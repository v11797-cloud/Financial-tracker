"""Official FSS rule pre-notices; list dates and exact rule identity."""
import re
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup
BASE = 'https://www.fss.or.kr/fss/job/lrgRegItnPrvntc/'
def parse_list(html):
    soup = BeautifulSoup(html, 'html.parser'); result = []
    for row in soup.select('tr'):
        a = row.select_one('td.title a[href*="lrgSlno="]')
        if not a: continue
        seq = re.search(r'lrgSlno=(\d+)', a['href'])
        date = next((td.get_text(strip=True) for td in row.select('td') if re.fullmatch(r'\d{4}-\d{2}-\d{2}',td.get_text(strip=True))), '')
        if not seq or not date: continue
        title = a.get_text(' ',strip=True)
        result.append(dict(id='fss_notice_'+seq[1],title=title,law_name=title,date=date,category='입법예고',source='FSS',dept='금융감독원',notice_seq=seq[1],url=BASE+'view.do?lrgSlno='+seq[1]+'&menuNo=200489'))
    return result

def extract_detail(html,item):
    soup = BeautifulSoup(html,'html.parser'); fields={}
    for dl in soup.select('.krds-reg dl.form-group'):
        dt,dd=dl.find('dt'),dl.find('dd')
        if dt and dd: fields[dt.get_text(' ',strip=True)]=dd.get_text('\n',strip=True)
    def field(term):return next((v for k,v in fields.items() if term in k),'')
    if re.sub(r'\s+','',field('명칭')) != re.sub(r'\s+','',item['title']):raise ValueError('FSS rule identity mismatch')
    purpose,changes=field('취지'),field('내용');end=field('시한')
    if not purpose and not changes:raise ValueError('missing substantive FSS notice')
    return dict(purpose=purpose,changes=changes,notice_end_date=end if re.fullmatch(r'\d{4}-\d{2}-\d{2}',end) else '')

def collect(pages=3):
    items={}
    for page in range(1,pages+1):
        r=requests.get(BASE+'list.do',params={'menuNo':'200489','pageIndex':page},timeout=25);r.raise_for_status();r.encoding='utf-8'
        rows=parse_list(r.text)
        if not rows:break
        items.update({i['id']:i for i in rows})
    def enrich(item):
        try:
            r=requests.get(item['url'],timeout=25);r.raise_for_status();r.encoding='utf-8'
            detail=extract_detail(r.text,item);item['notice_end_date']=detail['notice_end_date']
            if '자산운용' in detail['purpose']+detail['changes']:item['dept']='금융감독원 · 자산운용 관련'
        except (requests.RequestException,ValueError):pass
        return item
    with ThreadPoolExecutor(max_workers=4) as pool:return list(pool.map(enrich,items.values()))
