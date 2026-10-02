import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[2]/'src'))
from fss_notices import parse_list,extract_detail
class FSSNoticeTests(unittest.TestCase):
 def test_list_uses_publication_date_and_stable_identity(self):
  rows=parse_list('<table><tr><td class="title"><a href="/view.do?lrgSlno=4305">규정</a></td><td>2026-09-04</td></tr></table>')
  self.assertEqual(rows[0]['id'],'fss_notice_4305');self.assertEqual(rows[0]['date'],'2026-09-04')
 def test_exact_rule_and_deadline(self):
  html='<div class="krds-reg">'+''.join('<dl class="form-group"><dt>'+k+'</dt><dd>'+v+'</dd></dl>' for k,v in [('1. 규정의 명칭','규정'),('2. 제개정 취지','자산운용사 보호'),('3. 제개정 내용','대상 확대'),('5. 시한','2026-10-14')])+'</div>'
  self.assertEqual(extract_detail(html,{'title':'규정'})['notice_end_date'],'2026-10-14')
  with self.assertRaises(ValueError):extract_detail(html,{'title':'다른 규정'})
