import importlib.util
from pathlib import Path
import unittest
from bs4 import BeautifulSoup

spec = importlib.util.spec_from_file_location('reasons', Path(__file__).resolve().parents[1] / 'scripts/collect_law_reasons.py')
reasons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reasons)


class ReasonsTest(unittest.TestCase):
    def test_only_reason_section_and_exact_identity(self):
        item = dict(law_name='금융투자업규정', prom_no='2026-28', date='2026-07-08')
        html = '''<input id="admNm" value="금융투자업규정"><input id="prmlNo" value="2026-28"><input id="prmlYd" value="20260708">
        <p class="sbj02">【제정·개정문】</p><div class="pgroup">제1조 전문 제외</div>
        <p class="sbj02">【제정·개정이유】</p><br><div class="pgroup">개정사유<br>주요내용</div>
        <p class="sbj02">다른 구역</p><div class="pgroup">제외</div>'''
        soup = BeautifulSoup(html, 'html.parser')
        self.assertEqual(reasons.extract_reason(soup, item, True), '개정사유\n주요내용')
        with self.assertRaises(ValueError):
            reasons.extract_reason(soup, dict(item, prom_no='2025-6'), True)
        with self.assertRaises(ValueError):
            reasons.extract_reason(soup, dict(item, date='2025-07-08'), True)

    def test_missing_reason_is_not_full_text_fallback(self):
        item = dict(law_name='예시법', prom_no='123', date='2026-01-01')
        soup = BeautifulSoup('<input id="lsNm" value="예시법"><input id="ancNo" value="123"><input id="ancYd" value="20260101"><p class="sbj02">【제정·개정문】</p><div class="pgroup">전문</div>', 'html.parser')
        self.assertEqual(reasons.extract_reason(soup, item, False), '')


if __name__ == '__main__':
    unittest.main()
