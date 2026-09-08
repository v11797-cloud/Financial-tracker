import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('collect_kofia', ROOT / 'scripts/collect_kofia.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
FIXTURES = Path(__file__).parent / 'fixtures'


class KofiaTests(unittest.TestCase):
    def fixture(self, name):
        return (FIXTURES / name).read_text(encoding='utf-8')

    def test_nested_current_classification_not_title_matching(self):
        groups = collector.parse_classification(self.fixture('kofia-tree.html'))
        self.assertEqual(groups['136']['group'], '협회규정')
        self.assertEqual(groups['381']['group'], '모범규준')
        self.assertEqual(groups['278']['path'][:2], ['모범규준', '설명서 및 위험고지'])
        self.assertIn('주식워런트증권 거래설명서', groups['278']['path'])
        self.assertNotIn('120', groups)  # 매매거래계좌설정약관: 표준약관
        self.assertNotIn('999999999', groups)

    def test_missing_category_tree_is_failure_not_empty_success(self):
        with self.assertRaises(ValueError):
            collector.parse_classification('<html>No category tree</html>')

    def test_notice_period_and_stable_identity(self):
        rows, total, pages = collector.parse_page(self.fixture('kofia-notices.html'), 'notices', 1)
        self.assertEqual((total, pages, len(rows)), (152, 16, 10))
        self.assertEqual(rows[0]['id'], 'kofia_notice_157')
        self.assertEqual(rows[0]['date'], '2026-09-01')
        self.assertEqual(rows[0]['notice_end_date'], '2026-09-21')
        self.assertEqual(rows[0]['source_method'], 'POST')
        self.assertNotIn('enf_date', rows[0])

    def test_history_seq_and_law_seq_are_distinct(self):
        rows, total, pages = collector.parse_page(self.fixture('kofia-revisions.html'), 'revisions', 1)
        self.assertEqual((total, pages), (1437, 144))
        self.assertEqual(rows[0]['id'], 'kofia_revision_1807')
        self.assertEqual(rows[0]['law_seq'], '278')
        self.assertIn('historySeq=1807', rows[0]['url'])
        self.assertNotIn('enf_date', rows[0])
        self.assertEqual(rows[6]['law_seq'], rows[8]['law_seq'])
        self.assertNotEqual(rows[6]['id'], rows[8]['id'])

    def test_silent_page_one_response_and_truncated_html_rejected(self):
        with self.assertRaises(ValueError):
            collector.parse_page(self.fixture('kofia-revisions.html'), 'revisions', 2)
        with self.assertRaises(ValueError):
            collector.parse_page(self.fixture('kofia-notices.html').replace('</html>', ''), 'notices', 1)

    def test_invalid_date_is_not_inferred(self):
        for value in ['2026-02-29', '2026-13-01', '상세참조', '']:
            self.assertEqual(collector.valid_date(value), '')
        self.assertEqual(collector.valid_date('2028-02-29'), '2028-02-29')

    def test_snapshot_scope_and_no_duplicate_histories(self):
        data = json.loads((ROOT / 'data/kofia_data.json').read_text(encoding='utf-8'))
        ids = [row['id'] for row in data['items']]
        self.assertEqual(len(ids), len(set(ids)))
        revisions = [row for row in data['items'] if row['category'] == '공포법령']
        self.assertEqual(len(revisions), data['counts']['revisions_included'])
        self.assertEqual(data['counts']['revisions_scanned'], len(revisions) + data['counts']['revisions_excluded'])
        for row in revisions:
            self.assertIn(row['source_group'], collector.ALLOWED_GROUPS)
            self.assertEqual(row['classification_path'][0], row['source_group'])
            self.assertNotIn('표준약관', row['classification_path'][:1])


if __name__ == '__main__':
    unittest.main()
