import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from collect_press_summaries import extract_press
class PressTests(unittest.TestCase):
 def test_inline_and_identity(self):
  item={'id':'no010101_1','title':'Test. 금일 등록된 게시글','date':'2026-09-17'}
  body='A substantive announcement that includes <strong>important figures</strong> and the official decision.'
  html='<div class="board-view-wrap"><div class="header"><div class="subject">Test</div><div class="day"><span>2026-09-17</span></div></div><div class="body"><div class="cont"><p>'+body+'</p><p>Further official information concerning this announcement and its implementation.</p></div></div></div>'
  self.assertIn('important figures',extract_press(html,item)['purpose'])
  self.assertIn('Further official',extract_press(html,item)['changes'])
  with self.assertRaises(ValueError):extract_press(html,{**item,'date':'2025-09-17'})
 def test_no_body(self):
  with self.assertRaises(ValueError):extract_press('<h3>Title only</h3>',{'id':'fss_press_1','title':'Title only','date':'2026-09-17'})
if __name__=='__main__':unittest.main()
