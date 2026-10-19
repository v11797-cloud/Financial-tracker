"""Identity-checked KOFIA revision excerpts, isolated from law.go.kr reasons and AI APIs."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup
import requests
from hwp_text import extract as extract_attachment

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'ui-v2/data/kofia_summaries.json'
BASE = 'https://law.kofia.or.kr'
IDENTITY = ('id', 'title', 'date', 'law_seq', 'history_seq', 'source_group')


def key(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def clean(value):
    return '\n'.join(s for line in value.splitlines() if (s := re.sub(r'[ \t\xa0]+', ' ', line).strip()))


def text(node):
    if node is None:
        return ''
    for n in node.select('script,style,noscript'):
        n.decompose()
    for n in node.find_all('br'):
        n.replace_with('\n')
    return clean(node.get_text('\n', strip=True))


def eligible(item):
    return (item.get('source') == 'KOFIA' and item.get('category') == '공포법령'
            and item.get('source_group') in ('협회규정', '모범규준')
            and re.fullmatch(r'\d{1,12}', str(item.get('history_seq', ''))) is not None
            and re.fullmatch(r'\d{1,12}', str(item.get('law_seq', ''))) is not None
            and item.get('id') == 'kofia_revision_' + str(item['history_seq']))


def parse_detail(html, item):
    if not eligible(item) or '</html>' not in html.lower():
        raise ValueError('Invalid revision identity or incomplete HTML')
    table = BeautifulSoup(html, 'html.parser').select_one('table.brdComView')
    if table is None:
        raise ValueError('Missing revision table')
    def field(label):
        heading = next((n for n in table.select('th') if key(n.get_text()) == key(label)), None)
        node = heading.find_next_sibling('td') if heading else None
        if node is not None and label == '규정명':
            node = BeautifulSoup(str(node), 'html.parser')
            for link in node.select('a,button'):
                link.decompose()
        return node.get_text(' ', strip=True) if node else ''
    if key(field('규정명')) != key(item['title']) or field('제ㆍ개정일') != item['date']:
        raise ValueError('Revision title/date mismatch')
    full = table.select_one('a#fullscreen[href]')
    url = urlparse(urljoin(BASE, full['href'])) if full else None
    query = parse_qs(url.query) if url else {}
    if not url or url.scheme != 'https' or url.netloc != 'law.kofia.or.kr' or url.path != '/service/law/lawFullScreen.do' or query.get('historySeq') != [str(item['history_seq'])] or query.get('seq') != [str(item['law_seq'])]:
        raise ValueError('Historical version link mismatch')
    attachments = []
    for a in table.select('a[href]'):
        link = urlparse(urljoin(BASE, a['href'])); q = parse_qs(link.query)
        if link.scheme == 'https' and link.netloc == 'law.kofia.or.kr' and link.path == '/download.do' and q.get('gubun') == ['104'] and len(q.get('seq', [])) == 1 and re.fullmatch(r'\d{1,12}', q['seq'][0]):
            attachments.append(BASE + '/download.do?gubun=104&seq=' + q['seq'][0])
    return {'body': text(table.select_one('.storyIn')), 'attachments': list(dict.fromkeys(attachments))[:2]}


def parse_full(html, item):
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.select_one('#lawcontent')
    if '</html>' not in html.lower() or body is None or key(text(body.select_one('.lawname'))) != key(item['title']):
        raise ValueError('Historical full text mismatch')
    versions = [parse_qs(urlparse(a['href']).query) for a in body.select('a[href]') if urlparse(a['href']).path == '/service/law/detailArticlePrint.do']
    if not versions or any(q.get('seq') != [str(item['law_seq'])] or q.get('historySeq') != [str(item['history_seq'])] for q in versions):
        raise ValueError('Full text historical identity mismatch')
    return text(body)


def get(url, binary=False):
    response = requests.get(url, timeout=(5, 12), allow_redirects=False, stream=True)
    with response:
        if response.status_code != 200:
            raise ValueError('Official source unavailable')
        limit = 8 * 1024 * 1024 if binary else 2 * 1024 * 1024
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > limit:
                raise ValueError('Official source too large')
            chunks.append(chunk)
        content = b''.join(chunks)
        return content if binary else content.decode('utf-8-sig')


def collect(item, fetch=get):
    record = {k: item[k] for k in IDENTITY}
    record.update(collected_at=datetime.now(timezone.utc).isoformat(), source_url=BASE + '/service/revision/revisionView.do?historySeq=' + str(item['history_seq']))
    try:
        detail = parse_detail(fetch(record['source_url']), item)
        record['attachment_urls'] = detail['attachments']
        body = detail['body']
        kind, source = 'revision_summary', record['source_url']
        if len(re.sub(r'\s', '', body)) < 30:
            body = ''
            for attachment in detail['attachments']:
                try:
                    candidate = clean(extract_attachment(fetch(attachment, binary=True)))
                    if len(candidate) >= 30 and re.search(r'[가-힣]', candidate):
                        body, kind, source = candidate, 'amendment_document', attachment
                        break
                except Exception:
                    continue
        if not body:
            source = BASE + '/service/law/lawFullScreenContent.do?seq=' + str(item['law_seq']) + '&historySeq=' + str(item['history_seq'])
            body = parse_full(fetch(source), item)
            kind = 'version_fulltext'
        if len(body) < 30 or not re.search(r'[가-힣]', body):
            record.update(status='not_provided', text='', kind='', content_url='')
        else:
            record.update(status='ready', text=body[:24000], kind=kind, content_url=source,
                          truncated=len(body) > 24000, content_hash=hashlib.sha256(body.encode()).hexdigest())
    except Exception as error:
        record.update(status='unavailable', text='', error=type(error).__name__)
    return record


def matching(record, item):
    return isinstance(record, dict) and all(record.get(k) == item.get(k) for k in IDENTITY)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=180)
    parser.add_argument('--max-seconds', type=int, default=300)
    args = parser.parse_args()
    items = sorted((i for i in json.loads((ROOT / 'ui-v2/data/kofia_data.json').read_text(encoding='utf-8-sig'))['items'] if eligible(i)), key=lambda i: (i['date'], int(i['history_seq'])), reverse=True)
    previous = json.loads(OUTPUT.read_text(encoding='utf-8'))['items'] if OUTPUT.exists() else {}
    records = {i['id']: previous[i['id']] if matching(previous.get(i['id']), i) else {**{k:i[k] for k in IDENTITY}, 'status':'pending', 'text':''} for i in items}
    todo = [i for i in items if records[i['id']]['status'] not in ('ready', 'not_provided')]
    if args.limit:
        todo = todo[:args.limit]
    start, failures, attempted = time.monotonic(), 0, 0
    with ThreadPoolExecutor(max_workers=3) as pool:
        for offset in range(0, len(todo), 3):
            if time.monotonic() - start > args.max_seconds or failures >= 6:
                break
            for item, record in zip(todo[offset:offset+3], pool.map(collect, todo[offset:offset+3])):
                attempted += 1
                failures = failures + 1 if record['status'] == 'unavailable' else 0
                # A temporary failure never overwrites a verified matching excerpt.
                records[item['id']] = record
            print(f'KOFIA summaries attempted {attempted}; ready {sum(r["status"] == "ready" for r in records.values())}', flush=True)
    payload = {'schema_version':1, 'source':'KOFIA', 'updated_at':datetime.now(timezone.utc).isoformat(),
               'counts':{status:sum(r['status'] == status for r in records.values()) for status in ('ready','not_provided','pending','unavailable')}, 'items':records}
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temporary.replace(OUTPUT)
    print(json.dumps(payload['counts']), flush=True)


if __name__ == '__main__':
    main()
