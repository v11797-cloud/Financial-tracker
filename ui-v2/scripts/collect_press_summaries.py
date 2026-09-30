"""Identity-checked excerpts of FSC/FSS press release bodies (no title inference)."""
from collect_notice_summaries import ROOT, key
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import re
import requests
from bs4 import BeautifulSoup

def title_key(value):
    return key(re.sub(r'\s*금일 등록된 게시글\s*$', '', re.sub(r'^\[금감원\]\s*', '', value)).rstrip('. '))

def extract_press(html,item):
    soup=BeautifulSoup(html,'html.parser')
    fss=item['id'].startswith('fss_press_')
    title=soup.select_one('.krds-bd-view .subject' if fss else '.board-view-wrap .header .subject')
    if fss:
        area=soup.select_one('.krds-bd-view .sub-info')
        dt=next((n for n in area.select('dt') if n.get_text(strip=True)=='등록일'),None) if area else None
        date=dt.find_next_sibling('dd') if dt else None
    else:date=soup.select_one('.board-view-wrap .header .day span')
    body=soup.select_one('.krds-bd-view .n-dbdata' if fss else '.board-view-wrap .body .cont')
    if title is None or date is None or body is None or title_key(title.get_text(' ',strip=True))!=title_key(item['title']) or date.get_text(strip=True)!=item['date']:
        raise ValueError('press identity mismatch')
    for n in body.select('script,style,noscript'):n.decompose()
    for br in body.find_all('br'):br.replace_with('\n')
    # Preserve paragraph boundaries without splitting inline emphasis into fragments.
    for p in body.find_all(['p','div','tr']):p.append('\n')
    text=body.get_text('',strip=False)
    lines=[re.sub(r'\s+',' ',line).strip() for line in text.splitlines()]
    lines=[line for line in lines if len(line)>35 and title_key(line)!=title_key(item['title']) and not re.match(r'^[※*]?\s*(자세한|상세한|붙임|첨부파일)',line)]
    if not lines:raise ValueError('no substantive body')
    return {'purpose':lines[0], 'changes':'\n'.join(lines[1:])}

def collect(item):
    try:
        if re.fullmatch(r'fss_press_\d+',item['id']):url='https://www.fss.or.kr/fss/bbs/B0000188/view.do?nttId='+item['id'].split('_')[-1]+'&menuNo=200218'
        elif re.fullmatch(r'no010101_\d+',item['id']):url='https://www.fsc.go.kr/no010101/'+item['id'].split('_')[-1]
        else:raise ValueError('unsupported source')
        r=requests.get(url,timeout=20,allow_redirects=False);r.raise_for_status()
        if r.status_code!=200 or len(r.content)>2000000:raise ValueError('invalid response')
        r.encoding='utf-8'
        return item['id'],dict(title=item['title'],date=item['date'],status='ready',source_url=url,collected_at=datetime.now(timezone.utc).isoformat(),**extract_press(r.text,item))
    except (requests.RequestException,ValueError) as e:return item['id'],dict(title=item['title'],date=item['date'],status='unavailable',error=str(e)[:100])

def main():
    items=json.loads((ROOT/'data/regulatory_data.json').read_text(encoding='utf-8-sig'))
    items=[i for i in items if i.get('category')=='보도자료']
    with ThreadPoolExecutor(max_workers=4) as pool:records=dict(pool.map(collect,items))
    (ROOT/'ui-v2/data/press_summaries.json').write_text(json.dumps({'schema_version':1,'items':records},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Press summaries: {sum(v["status"]=="ready" for v in records.values())}/{len(records)} ready')
if __name__=='__main__':main()
