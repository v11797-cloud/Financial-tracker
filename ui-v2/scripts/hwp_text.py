"""Read text without executing HWP content. See https://tech.hancom.com/python-hwp-parsing-2/."""
import io
import re
import struct
import zipfile
import zlib
from xml.etree import ElementTree

LIMIT = 16 * 1024 * 1024


def paragraph(data):
    if len(data) % 2:
        raise ValueError('Invalid HWP paragraph')
    units = struct.unpack('<' + 'H' * (len(data) // 2), data)
    result, n = [], 0
    extended = set(range(1, 10)) | {11, 12} | set(range(14, 24))
    while n < len(units):
        value = units[n]
        if value in extended:
            if n + 8 > len(units):
                raise ValueError('Incomplete HWP control')
            if value == 9:
                result.append(' ')
            n += 8
            continue
        result.append('\n' if value in (10, 13) else chr(value) if value >= 32 else '')
        n += 1
    return ''.join(result).encode('utf-16-le', 'surrogatepass').decode('utf-16-le')


def section_text(data):
    if len(data) > LIMIT:
        raise ValueError('HWP section too large')
    parts, offset = [], 0
    while offset < len(data):
        if offset + 4 > len(data):
            raise ValueError('Incomplete HWP record')
        header = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        tag, size = header & 1023, header >> 20
        if size == 4095:
            if offset + 4 > len(data):
                raise ValueError('Incomplete extended record')
            size = struct.unpack_from('<I', data, offset)[0]
            offset += 4
        if size > LIMIT or offset + size > len(data):
            raise ValueError('Invalid HWP record size')
        if tag == 67:
            parts.append(paragraph(data[offset:offset + size]))
        offset += size
    return '\n'.join(parts)


def extract(data):
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('Attachment too large')
    if data.startswith(b'PK'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            sections = sorted((n for n in archive.namelist() if re.fullmatch(r'Contents/section\d+\.xml', n)), key=lambda n:int(re.search(r'\d+',n)[0]))
            if not sections or sum(archive.getinfo(n).file_size for n in sections) > LIMIT:
                raise ValueError('Invalid HWPX sections')
            parts = []
            for name in sections:
                xml = archive.read(name)
                if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
                    raise ValueError('Unsupported XML declaration')
                tree = ElementTree.fromstring(xml)
                for p in tree.iter():
                    if p.tag.rsplit('}', 1)[-1] == 'p':
                        parts.append(''.join(n.text or '' for n in p.iter() if n.tag.rsplit('}', 1)[-1] == 't'))
            return '\n'.join(parts)
    import olefile
    with olefile.OleFileIO(io.BytesIO(data)) as document:
        header = document.openstream('FileHeader').read(256)
        if not header.startswith(b'HWP Document File') or len(header) < 40:
            raise ValueError('Not an HWP 5 document')
        flags = struct.unpack_from('<I', header, 36)[0]
        if flags & 6:
            raise ValueError('Protected HWP document')
        sections = sorted((p for p in document.listdir() if len(p) == 2 and p[0] == 'BodyText' and re.fullmatch(r'Section\d+', p[1])), key=lambda p:int(p[1][7:]))
        parts, total = [], 0
        for name in sections:
            raw = document.openstream(name).read(LIMIT + 1)
            if len(raw) > LIMIT:
                raise ValueError('HWP section too large')
            if flags & 1:
                inflater = zlib.decompressobj(-15)
                raw = inflater.decompress(raw, LIMIT + 1)
                if len(raw) > LIMIT or not inflater.eof:
                    raise ValueError('Invalid compressed section')
            total += len(raw)
            if total > LIMIT:
                raise ValueError('HWP body too large')
            parts.append(section_text(raw))
        return '\n'.join(parts)
