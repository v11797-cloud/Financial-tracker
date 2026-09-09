"""UI-only amendment-reason cache. Never changes the production feed/collector."""
import concurrent.futures
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'ui-v2/data/law_reasons.js'


def eligible(item):
    name = re.sub(r'\s+', '', item.get('law_name', ''))
    return item.get('category') == '공포법령' and item.get('source') != 'KOFIA' and any(
        name.startswith(prefix) for prefix in ('자본시장과금융투자업에관한법률', '금융소비자보호에관한법률', '금융투자업규정'))


def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return BeautifulSoup(response.read().decode('utf-8'), 'html.parser')


def extract_reason(soup, item, admin):
    fields = ('admNm', 'prmlNo', 'prmlYd') if admin else ('lsNm', 'ancNo', 'ancYd')
    values = [soup.find('input', id=field) for field in fields]
    if not all(values):
        raise ValueError('Missing official amendment identity')
    actual = [re.sub(r'\s+', '', node.get('value', '')) for node in values]
    expected = [re.sub(r'\s+', '', item['law_name']), str(item['prom_no']), item['date'].replace('-', '')]
    if actual != expected:
        raise ValueError(f'Amendment identity mismatch: {actual} != {expected}')
    heading = next((p for p in soup.select('p.sbj02') if '제정·개정이유' in p.get_text()), None)
    if heading is None:
        return ''
    parts = []
    for sibling in heading.find_next_siblings():
        if 'sbj02' in sibling.get('class', []):
            break
        if 'pgroup' in sibling.get('class', []):
            for br in sibling.find_all('br'):
                br.replace_with('\n')
            parts.append('\n'.join(line.strip() for line in sibling.get_text().splitlines() if line.strip()))
    return '\n\n'.join(parts)


def collect(item):
    admin = item['id'].startswith('admrul_')
    kind = '행정규칙' if admin else '법령'
    path = f"{kind}/{item['law_name']}/({item['prom_no']},{item['date'].replace('-', '')})"
    shell = fetch('https://www.law.go.kr/' + urllib.parse.quote(path, safe='/(),-'))
    frame = shell.find('iframe', id='lawService')
    if frame is None:
        raise ValueError('Official amendment not resolved')
    key = 'admRulSeq' if admin else 'lsiSeq'
    seq = urllib.parse.parse_qs(urllib.parse.urlparse(frame['src']).query).get(key, [''])[0]
    if not re.fullmatch(r'\d+', seq):
        raise ValueError('Missing official amendment sequence')
    endpoint = 'admRulRvsInfoR' if admin else 'lsRvsDocInfoR'
    url = f'https://www.law.go.kr/LSW/{endpoint}.do?{key}={seq}&lsRvsGubun=Rsn'
    soup = fetch(url)
    text = extract_reason(soup, item, admin)
    return {key: item[key] for key in ('id', 'law_name', 'prom_no', 'date')} | {
        'text': text, 'status': 'available' if text else 'not_provided', 'source_url': url,
    }


def main():
    items = [item for item in json.loads((ROOT / 'data/regulatory_data.json').read_text(encoding='utf-8')) if eligible(item)]
    records = {}
    if OUTPUT.exists():
        records = json.loads(OUTPUT.read_text(encoding='utf-8').removeprefix('window.lawReasons = ').strip().removesuffix(';'))['items']
    def resolve(item):
        previous = records.get(item['id'])
        if previous and previous.get('status') == 'available' and all(previous.get(k) == item[k] for k in ('law_name', 'prom_no', 'date')):
            return item['id'], previous
        return item['id'], collect(item)
    # Fail without overwriting the last verified cache if the source/identity check fails.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        result = dict(pool.map(resolve, items))
    payload = {'schema_version': 1, 'items': result}
    OUTPUT.write_text('window.lawReasons = ' + json.dumps(payload, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
    print(f'Verified amendment reasons: {len(result)}; unavailable: {sum(x["status"] != "available" for x in result.values())}')


if __name__ == '__main__':
    main()
