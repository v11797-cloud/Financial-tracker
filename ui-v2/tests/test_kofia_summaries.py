import importlib.util
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
import collect_kofia_summaries as m
import hwp_text

ITEM = dict(id='kofia_revision_1795', history_seq='1795', law_seq='150', title='금융투자회사 표준내부통제기준', date='2026-05-14', source='KOFIA', source_group='모범규준', category='공포법령')


def html(item=ITEM, body='', attachment=True, link=None):
    full = link or f'/service/law/lawFullScreen.do?seq={item["law_seq"]}&amp;historySeq={item["history_seq"]}'
    return f'<html><nav>메뉴 제외</nav><table class="brdComView"><tr><th>규정명</th><td>{item["title"]}<a id="fullscreen" href="{full}">전문</a></td></tr><tr><th>제ㆍ개정일</th><td>{item["date"]}</td></tr><tr><td><div class="storyIn">{body}</div>{"<a href=/download.do?gubun=104&amp;seq=1791>개정문</a>" if attachment else ""}</td></tr></table></html>'


def hwpx(text):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        z.writestr('Contents/section0.xml', '<root xmlns:hp="urn:hp"><hp:p><hp:run><hp:t>' + text + '</hp:t></hp:run></hp:p></root>')
    return out.getvalue()


class KofiaSummaryTests(unittest.TestCase):
    def test_source_transport_uses_working_identity_encoding_and_rejects_redirects(self):
        class Response:
            status_code=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def iter_content(self,size):yield '<html>협회 원문</html>'.encode()
        with patch.object(m.requests,'get',return_value=Response()) as request:
            self.assertIn('협회 원문',m.get('https://law.kofia.or.kr/service/revision/revisionView.do?historySeq=1795'))
            options=request.call_args.kwargs
            self.assertEqual(options['headers']['Accept-Encoding'],'identity');self.assertIn('FinancialTracker',options['headers']['User-Agent']);self.assertFalse(options['allow_redirects'])
        response=Response();response.status_code=302
        with patch.object(m.requests,'get',return_value=response),self.assertRaises(ValueError):m.get('https://law.kofia.or.kr/invalid')

    def test_exact_title_date_law_and_history_required(self):
        for changes in ({'title':'다른 규정'}, {'date':'2026-05-13'}, {'history_seq':'1796'}, {'law_seq':'151'}):
            with self.assertRaises(ValueError):
                m.parse_detail(html({**ITEM, **changes}), ITEM)
        with self.assertRaises(ValueError):
            m.parse_detail(html(link='https://evil.test/service/law/lawFullScreen.do?seq=150&amp;historySeq=1795'),ITEM)
        with self.assertRaises(ValueError):
            m.parse_detail(html().replace('</html>',''),ITEM)
        self.assertEqual(m.parse_detail(html(),ITEM)['attachments'],['https://law.kofia.or.kr/download.do?gubun=104&seq=1791'])

    def test_official_summary_is_preferred_without_attachment_fetch(self):
        body='개정 목적 및 주요 내용: 투자자 보호를 위한 내부통제 절차를 정비하고 감독 및 보고 절차를 명확히 합니다.'
        calls=[]
        def fetch(url, binary=False):
            calls.append(url)
            return html(body=body+'<script>evil()</script>')
        record=m.collect(ITEM, fetch)
        self.assertEqual(record['status'],'ready');self.assertEqual(record['kind'],'revision_summary')
        self.assertEqual(record['text'],body);self.assertEqual(len(calls),1)

    def test_verified_amendment_attachment_is_read_when_summary_is_blank(self):
        amendment='표준내부통제기준 개정안 주요 내용: 보고 절차 및 담당 부서의 점검 사항을 정비합니다.'
        calls=[]
        def fetch(url,binary=False):
            calls.append((url,binary))
            return hwpx(amendment) if binary else html()
        record=m.collect(ITEM,fetch)
        self.assertEqual(record['kind'],'amendment_document');self.assertEqual(record['text'],amendment)
        self.assertEqual(calls[1],('https://law.kofia.or.kr/download.do?gubun=104&seq=1791',True))

    def test_full_text_is_separately_marked_and_never_called_change_summary(self):
        full=f'<html><div id="lawcontent"><div class="lawname">{ITEM["title"]}</div><a href="/service/law/detailArticlePrint.do?seq=150&amp;historySeq=1795&amp;contentSeq=123"></a><p>제1조 목적: 금융투자회사의 내부통제에 관한 기준 및 임직원의 준수 절차를 정합니다.</p></div></html>'
        def fetch(url,binary=False):
            if 'revisionView' in url:return html(attachment=False)
            self.assertEqual(url,'https://law.kofia.or.kr/service/law/lawFullScreenContent.do?seq=150&historySeq=1795')
            return full
        record=m.collect(ITEM,fetch);self.assertEqual(record['kind'],'version_fulltext');self.assertEqual(record['status'],'ready')
        with self.assertRaises(ValueError):m.parse_full(full,{**ITEM,'title':'다른 규정'})
        with self.assertRaises(ValueError):m.parse_full(full.replace('historySeq=1795','historySeq=1796'),ITEM)

    def test_source_failure_and_mismatch_never_create_text(self):
        for fetch in (lambda *a,**k: '<html>오류</html>',lambda *a,**k: html({**ITEM,'date':'2025-01-01'})):
            record=m.collect(ITEM,fetch);self.assertEqual(record['status'],'unavailable');self.assertEqual(record['text'],'')

    def test_hwp_records_skip_inline_control_payload_and_reject_incomplete_records(self):
        text=struct.pack('<H',2)+b'X'*12+struct.pack('<H',2)+'개정 내용'.encode('utf-16-le')+b'\r\0'
        record=struct.pack('<I',67 | len(text)<<20)+text
        self.assertEqual(hwp_text.section_text(record).strip(),'개정 내용')
        with self.assertRaises(ValueError):hwp_text.section_text(record[:-1])
        self.assertEqual(hwp_text.extract(hwpx('검증된 첨부 문단')),'검증된 첨부 문단')
        with self.assertRaises(ValueError):hwp_text.extract(hwpx('<!DOCTYPE unsafe>'))

    def test_matching_cache_is_preserved_when_another_source_fails(self):
        ready=m.collect(ITEM,lambda *a,**k:html(body='기존에 검증한 개정 이유 및 주요 내용입니다. 담당 부서의 감독 절차와 보고 체계를 정비합니다.'))
        other={**ITEM,'id':'kofia_revision_1796','history_seq':'1796'}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'ui-v2/data').mkdir(parents=True)
            (root/'ui-v2/data/kofia_data.json').write_text(json.dumps({'items':[ITEM,other]}),encoding='utf-8')
            output=root/'ui-v2/data/kofia_summaries.json';output.write_text(json.dumps({'items':{ITEM['id']:ready}}),encoding='utf-8')
            failed={**{k:other[k] for k in m.IDENTITY},'status':'unavailable','text':''}
            with patch.object(m,'ROOT',root),patch.object(m,'OUTPUT',output),patch.object(m,'collect',return_value=failed) as collect,patch.object(sys,'argv',['collector']):m.main()
            saved=json.loads(output.read_text(encoding='utf-8'))['items'];self.assertEqual(saved[ITEM['id']],ready);self.assertEqual(collect.call_count,1)


if __name__=='__main__':unittest.main()
