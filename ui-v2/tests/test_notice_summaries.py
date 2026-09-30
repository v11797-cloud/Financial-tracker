import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('notice',Path(__file__).parents[1]/'scripts/collect_notice_summaries.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class NoticeTests(unittest.TestCase):
 def test_verified_sections(self):
  item={'title':'Test notice','date':'2026-09-16'}
  html='<div class="board-view-wrap"><div class="header"><div class="subject">Test notice</div><div class="day"><span>2026-09-16</span></div></div><div class="body"><div class="cont"><p>1. 개정이유</p><p>투자자 보호 강화</p><p>2. 주요내용</p><p>공시 범위 확대</p><p>3. 의견제출</p><p>연락처</p></div></div></div>'
  result=m.extract(html,item)
  self.assertEqual(result,{'purpose':'투자자 보호 강화','changes':'공시 범위 확대'})
  with self.assertRaises(ValueError):m.extract(html,{**item,'date':'2025-09-16'})
  with self.assertRaises(ValueError):m.extract(html,{**item,'title':'Other'})
 def test_missing_body_not_inferred(self):
  with self.assertRaises(ValueError):m.extract('<html>title only</html>',{'title':'title only','date':'2026-09-16'})
if __name__=='__main__':unittest.main()
