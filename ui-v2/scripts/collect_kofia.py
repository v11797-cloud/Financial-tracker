"""Collect KOFIA into UI 2.0 only. The production collector and data stay untouched.

Uses the existing requirements.txt. No remote JavaScript is executed. Complete
pagination and the current classification tree are required before files change.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import hashlib
import html as html_module
import json
from pathlib import Path
import re
import time
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup
import requests

BASE = 'https://law.kofia.or.kr'
TREE = BASE + '/service/law/lawCurrentPartTree.do'
NOTICES = BASE + '/service/revisionNotice/revisionNoticeList.do'
REVISIONS = BASE + '/service/revision/revisionlist.do'
NOTICE_VIEW = BASE + '/service/revisionNotice/revisionNoticeView.do'
ALLOWED_GROUPS = {'협회규정', '모범규준'}
OUTPUT = Path(__file__).resolve().parents[1] / 'data'


def clean(value):
    return re.sub(r'\s+', ' ', value).strip()


def valid_date(value):
    value = clean(value)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        return ''
    try:
        date.fromisoformat(value)
        return value
    except ValueError:
        return ''


def parse_classification(text):
    # Read declared tree metadata and edges; never evaluate the site's JS.
    nodes = {}
    for match in re.finditer(r'tree(\d+)\.action\s*=\s*"javascript:gotoLawList\((.*?)\)"', text, re.S):
        args = re.findall(r"'((?:\\.|[^'\\])*)'", match.group(2))
        if len(args) >= 3 and args[0] == match.group(1):
            nodes[args[0]] = {'name': html_module.unescape(args[2]), 'folder': args[1] == '1'}
    parents = {child: parent for parent, child in re.findall(r'tree(\d+)\.add\(tree(\d+)\)', text)}
    roots = {seq: node['name'] for seq, node in nodes.items() if node['name'] in ALLOWED_GROUPS and node['folder']}
    if set(roots.values()) != ALLOWED_GROUPS:
        raise ValueError('KOFIA classification roots missing; retain last good snapshot')
    result = {}
    for seq, node in nodes.items():
        if node['folder']:
            continue
        chain, seen, cursor, group = [], set(), seq, None
        while cursor in nodes and cursor not in seen:
            seen.add(cursor)
            chain.append(nodes[cursor]['name'])
            if cursor in roots:
                group = roots[cursor]
                break
            cursor = parents.get(cursor)
        if group:
            result[seq] = {'group': group, 'path': list(reversed(chain)), 'name': node['name']}
    if not result:
        raise ValueError('No classified current rules found')
    return result


def parse_page(text, kind, expected_page):
    soup = BeautifulSoup(text, 'html.parser')
    info, table = soup.select_one('.brdInfo2'), soup.select_one('table.brdComList')
    if not info or not table or '</html>' not in text.lower():
        raise ValueError(f'{kind} page {expected_page}: incomplete or changed HTML')
    summary = clean(info.get_text(' ', strip=True))
    match = re.search(r'전체\s*:\s*([\d,]+)\s*건.*?페이지\s*:\s*(\d+)\s*/\s*(\d+)', summary)
    if not match or int(match[2]) != expected_page:
        raise ValueError(f'{kind}: unexpected pagination {summary!r}')
    total, page_count = int(match[1].replace(',', '')), int(match[3])
    rows = []
    for tr in table.select('tbody tr'):
        cells = tr.find_all('td', recursive=False)
        if not cells:
            continue
        if len(cells) < 6:
            raise ValueError(f'{kind}: unexpected list columns')
        link = cells[1].find('a', href=True)
        if not link:
            raise ValueError(f'{kind}: missing source link')
        title = clean(link.get_text(' ', strip=True))
        changed = clean(cells[2].get_text(' ', strip=True))
        published = valid_date(cells[3].get_text(' ', strip=True))
        if not title or not published:
            raise ValueError(f'{kind}: missing title or publication date')
        if kind == 'notices':
            notice = re.fullmatch(r"javascript:goRevisionInfoDetail\('(\d+)'\);?", link['href'])
            end = valid_date(cells[4].get_text(' ', strip=True))
            if not notice or not end or end < published:
                raise ValueError('Invalid KOFIA notice identity or period')
            seq = notice[1]
            rows.append({
                'id': f'kofia_notice_{seq}', 'title': title, 'url': NOTICE_VIEW,
                'date': published, 'dept': '금융투자협회', 'category': '입법예고',
                'source': 'KOFIA', 'source_type': '규정 제·개정예고', 'source_method': 'POST',
                'notice_seq': seq, 'notice_end_date': end, 'revision_type': changed,
            })
        else:
            href = urljoin(BASE, link['href'])
            history = parse_qs(urlparse(href).query).get('historySeq', [''])[0]
            fullscreen = re.search(r"popfullscreenEx3\('(\d+)',\s*'(\d+)'", str(tr))
            if not history.isdigit() or not fullscreen or fullscreen[2] != history:
                raise ValueError('Missing or conflicting KOFIA law/history identity')
            rows.append({
                'id': f'kofia_revision_{history}', 'title': title, 'url': href,
                'date': published, 'dept': '금융투자협회', 'category': '공포법령',
                'source': 'KOFIA', 'source_type': '최신 제·개정정보',
                'law_seq': fullscreen[1], 'history_seq': history, 'law_name': title,
                'revision_type': changed,
                # The list gives revision date, not effective date. Do not infer it.
            })
    if not rows and total:
        raise ValueError(f'{kind}: empty nonempty page')
    return rows, total, page_count


def collect(fetch):
    classification = parse_classification(fetch(TREE))
    complete = {}
    for kind, url in [('notices', NOTICES), ('revisions', REVISIONS)]:
        # Site forms use POST; GET pagination silently returns page 1.
        def params(page):
            values = {'page': str(page), 'searchValue': ''}
            if kind == 'notices':
                values.update({'revisionSeq': '0', 'searchType': ''})
            return values
        first, expected_total, pages = parse_page(fetch(url, params(1)), kind, 1)
        if pages > 1000:
            raise ValueError('Unexpected pagination size; inspect site before collecting')
        all_rows = list(first)
        def next_page(page):
            return parse_page(fetch(url, params(page)), kind, page)
        # Small, bounded concurrency; no duplicate page probes or unbounded crawl.
        with ThreadPoolExecutor(max_workers=3) as pool:
            for rows, total, count in pool.map(next_page, range(2, pages + 1)):
                if total != expected_total or count != pages:
                    raise ValueError('KOFIA changed during collection; retain snapshot and retry later')
                all_rows.extend(rows)
        ids = [item['id'] for item in all_rows]
        if len(ids) != expected_total or len(set(ids)) != expected_total:
            raise ValueError(f'{kind}: incomplete/duplicated pagination ({len(ids)}/{expected_total})')
        complete[kind] = all_rows
        print(f'{kind}: {len(all_rows)} records, {pages} pages', flush=True)
    selected, excluded = [], []
    for item in complete['revisions']:
        entry = classification.get(item['law_seq'])
        if not entry:
            excluded.append(item['id'])
            continue
        item['source_group'] = entry['group']
        item['classification_path'] = entry['path']
        item['dept'] = f"금융투자협회 · {entry['group']}"
        selected.append(item)
    stamp = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M KST')
    records = sorted(complete['notices'] + selected, key=lambda row: (row['date'], row['id']), reverse=True)
    return {
        'schema_version': 1, 'source': 'KOFIA', 'updated_at': stamp,
        'classification_url': TREE, 'classification_checked_at': stamp,
        'scope': '모든 예고 + 현행 분류 협회규정·모범규준의 제·개정 이력',
        'counts': {'notices': len(complete['notices']), 'revisions_scanned': len(complete['revisions']),
                   'revisions_included': len(selected), 'revisions_excluded': len(excluded),
                   '협회규정': sum(row['source_group'] == '협회규정' for row in selected),
                   '모범규준': sum(row['source_group'] == '모범규준' for row in selected)},
        'items': records,
    }


def make_fetch(cache_dir=None):
    def fetch(url, params=None):
        cache = None
        if cache_dir:
            digest = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
            cache = cache_dir / (digest + '.html')
            if cache.exists():
                return cache.read_text(encoding='utf-8')
        for attempt in range(3):
            try:
                time.sleep(0.15)
                response = requests.request('POST' if params is not None else 'GET', url, data=params,
                                            headers={'User-Agent': 'FinancialTracker-UI2/1.0', 'Accept-Encoding': 'identity'}, timeout=(10, 30))
                response.raise_for_status()
                text = response.content.decode('utf-8')
                if '</html>' not in text.lower():
                    raise ValueError('Truncated HTML response')
                if cache:
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    cache.write_text(text, encoding='utf-8')
                return text
            except (requests.RequestException, UnicodeError, ValueError):
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    return fetch


def write_snapshot(payload, output=OUTPUT):
    # No file changes until both feeds and classification have fully succeeded.
    output.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    for filename, content in [('kofia_data.json', serialized + '\n'), ('kofia_data.js', 'window.kofiaData = ' + serialized + ';\n')]:
        path = output / filename
        temporary = output / (filename + '.tmp')
        temporary.write_text(content, encoding='utf-8')
        temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, help='Optional local analysis cache; omit for live refresh')
    args = parser.parse_args()
    payload = collect(make_fetch(args.cache_dir))
    write_snapshot(payload)
    print(json.dumps(payload['counts'], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
