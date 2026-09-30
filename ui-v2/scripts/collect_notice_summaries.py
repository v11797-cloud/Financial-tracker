"""Collect identity-checked official notice excerpts for the static detail view."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import unicodedata
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'ui-v2/data/notice_summaries.json'

def key(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))

def extract(html, item):
    soup = BeautifulSoup(html, 'html.parser')
    if item.get('source') == 'KOFIA':
        table = soup.select_one('table.brdComView')
        if not table:
            raise ValueError('missing notice table')
        def field(label):
            th = next((n for n in table.select('th') if key(n.get_text()) == label), None)
            td = th.find_next_sibling('td') if th else None
            return td.get_text(' ', strip=True) if td else ''
        title, date = field('규정명'), field('예고시작일')
        body = table.select_one('.storyIn')
    else:
        title_node = soup.select_one('.board-view-wrap .header .subject')
        date_node = soup.select_one('.board-view-wrap .header .day span')
        title = title_node.get_text(' ', strip=True) if title_node else ''
        date = date_node.get_text(strip=True) if date_node else ''
        body = soup.select_one('.board-view-wrap .body .cont')
    if key(title) != key(item['title']) or date != item['date'] or body is None:
        raise ValueError('notice identity mismatch')
    for node in body.select('script,style,noscript'):
        node.decompose()
    for br in body.find_all('br'):
        br.replace_with('\n')
    text = body.get_text('\n', strip=True)
    text = re.sub(r'[ \t\xa0]+', ' ', text)
    text = re.sub(r'\n+', '\n', text).strip()
    headings = list(re.finditer(r'(?:^|\n)\s*\d+\s*[.．)]\s*([^\n]{1,50})', text))
    sections = {}
    for n, match in enumerate(headings):
        label = re.sub(r'\s+', '', match.group(1))
        value = text[match.end():headings[n+1].start() if n+1 < len(headings) else len(text)].strip()
        if re.search('이유|배경|목적', label):
            sections['purpose'] = value
        elif '주요' in label and '내용' in label:
            sections['changes'] = value
    if not any(sections.values()):
        raise ValueError('no substantive summary sections in notice body')
    return sections

def collect(item):
    try:
        if item.get('source') == 'KOFIA' and re.fullmatch(r'\d{1,12}', str(item.get('notice_seq', ''))):
            url = 'https://law.kofia.or.kr/service/revisionNotice/revisionNoticeView.do'
            response = requests.post(url, data={'revisionSeq': item['notice_seq']}, timeout=25, allow_redirects=False)
        elif re.fullmatch(r'notice_\d+', item['id']):
            url = 'https://www.fsc.go.kr/po040301/view?noticeId=' + item['id'].split('_')[1]
            response = requests.get(url, timeout=25, allow_redirects=False)
        else:
            raise ValueError('unsupported notice source')
        response.raise_for_status()
        if response.status_code != 200 or len(response.content) > 2000000:
            raise ValueError('invalid response')
        response.encoding = 'utf-8'
        sections = extract(response.text, item)
        return item['id'], dict(title=item['title'], date=item['date'], status='ready', source_url=url,
                               collected_at=datetime.now(timezone.utc).isoformat(), **sections)
    except (requests.RequestException, ValueError) as error:
        return item['id'], dict(title=item['title'], date=item['date'], status='unavailable', error=str(error)[:100])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()
    items = json.loads((ROOT / 'data/regulatory_data.json').read_text(encoding='utf-8-sig'))
    items += json.loads((ROOT / 'ui-v2/data/kofia_data.json').read_text(encoding='utf-8-sig'))['items']
    items = sorted((i for i in items if i.get('category') == '입법예고'), key=lambda i: i['date'], reverse=True)
    if args.limit:
        items = items[:args.limit]
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = dict(pool.map(collect, items))
    OUTPUT.write_text(json.dumps({'schema_version': 1, 'items': records}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Notice summaries: {sum(v["status"] == "ready" for v in records.values())}/{len(records)} ready')

if __name__ == '__main__':
    main()
