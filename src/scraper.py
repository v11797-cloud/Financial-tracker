import requests
import urllib3
from bs4 import BeautifulSoup
import re
from datetime import datetime
import xml.etree.ElementTree as ET
import urllib.parse

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class FinancialRegulatoryScraper:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        self.base_url = "https://www.fsc.go.kr"
        self.targets = {
            "금융시장동향": "https://www.fsc.go.kr/no030101",
            "보도자료": "https://www.fsc.go.kr/no010101",
            "입법예고": "https://www.fsc.go.kr/po040301"
        }
        self.law_keywords = [
            "자본시장", "금융소비자", "금융투자", "전자금융", 
            "가상자산", "금융회사의 지배구조", "은행법", "보험업법", "여신전문금융업법"
        ]

    def _extract_id_from_url(self, url):
        """URL에서 게시글 고유 ID 추출"""
        notice_match = re.search(r"noticeId=(\d+)", url)
        if notice_match:
            return f"notice_{notice_match.group(1)}"
            
        match = re.search(r"/(no\d+|po\d+)/(\d+)", url)
        if match:
            return f"{match.group(1)}_{match.group(2)}"
            
        clean_url = url.split("?")[0].replace("https://", "").replace("http://", "").replace("www.fsc.go.kr", "")
        return clean_url.replace("/", "_").replace(".", "").strip("_")

    def _normalize_title(self, title):
        """중복 판별용 제목 정규화 헬퍼 (특수문자, 괄호, 태그 제거)"""
        clean = re.sub(r"\[.*?\]", "", title)
        clean = re.sub(r"\(.*?\)", "", clean)
        clean = re.sub(r"[^\w]", "", clean)
        return clean.lower()

    def scrape_board(self, category, url):
        """금융위 게시판 multi-page 스크래핑 (1~3페이지)"""
        results = []
        seen_ids = set()
        
        for page in range(1, 4):
            page_url = f"{url}?curPage={page}"
            try:
                response = requests.get(page_url, headers=self.headers, verify=False, timeout=10)
                if response.status_code != 200:
                    continue

                soup = BeautifulSoup(response.text, "html.parser")
                board_wrap = soup.find(class_="board-list-wrap")
                if not board_wrap:
                    board_wrap = soup.find(class_=lambda x: x and "board-list" in x)
                    
                if not board_wrap:
                    continue

                items = board_wrap.find_all("li")
                for item in items:
                    a_tag = item.find("a")
                    if not a_tag:
                        continue
                    
                    raw_href = a_tag.get("href", "").strip()
                    if not raw_href or raw_href == "#none":
                        continue
                    
                    clean_href = raw_href
                    if clean_href.startswith("./"):
                        clean_href = clean_href[1:]
                    elif not clean_href.startswith("/") and not clean_href.startswith("http"):
                        clean_href = "/" + clean_href
                        
                    full_url = clean_href if clean_href.startswith("http") else self.base_url + clean_href
                    title = a_tag.get_text(strip=True)
                    title = re.sub(r"파일다운로드.*", "", title)
                    title = re.sub(r"파일뷰어.*", "", title)
                    title = title.strip()

                    post_id = self._extract_id_from_url(full_url)
                    if post_id in seen_ids:
                        continue
                    seen_ids.add(post_id)

                    item_text = item.get_text(" ", strip=True)
                    date_match = re.search(r"(\d{4}-\d{2}-\d{2})", item_text)
                    date_str = date_match.group(1) if date_match else datetime.today().strftime("%Y-%m-%d")

                    dept_match = re.search(r"담당부서\s*:\s*([^\s\|]+)", item_text)
                    dept_str = dept_match.group(1) if dept_match else "금융위원회"
                    dept_str = dept_str.replace("조회수", "").replace(":", "").strip()

                    results.append({
                        "id": post_id,
                        "title": title,
                        "url": full_url,
                        "date": date_str,
                        "dept": f"금융위원회({dept_str})" if "금융위" not in dept_str else dept_str,
                        "category": category
                    })
            except Exception as e:
                print(f"[{category}] 금융위 Page {page} 크롤링 에러: {e}")
        
        return results

    def scrape_fss_press(self):
        """금융감독원(FSS) 보도자료 multi-page 수집 (1~5페이지)"""
        results = []
        category = "보도자료"
        base_fss_url = "https://www.fss.or.kr"
        seen_ids = set()
        
        for page in range(1, 6):
            url = f"https://www.fss.or.kr/fss/bbs/B0000188/list.do?menuNo=200218&pageIndex={page}"
            try:
                res = requests.get(url, headers=self.headers, verify=False, timeout=10)
                if res.status_code == 200:
                    soup = BeautifulSoup(res.text, "html.parser")
                    table = soup.find("table")
                    if table:
                        rows = table.find_all("tr")
                        for r in rows[1:]:
                            a_tag = r.find("a")
                            if not a_tag:
                                continue
                            
                            title = a_tag.get_text(strip=True)
                            raw_href = a_tag.get("href", "").strip()
                            if not title or not raw_href:
                                continue
                                
                            full_url = base_fss_url + raw_href if raw_href.startswith("/") else raw_href
                            
                            ntt_match = re.search(r"nttId=(\d+)", full_url)
                            post_id = f"fss_press_{ntt_match.group(1)}" if ntt_match else f"fss_press_{hash(full_url)}"

                            if post_id in seen_ids:
                                continue
                            seen_ids.add(post_id)

                            row_text = r.get_text(" ", strip=True)
                            date_match = re.search(r"(\d{4}-\d{2}-\d{2})", row_text)
                            date_str = date_match.group(1) if date_match else datetime.today().strftime("%Y-%m-%d")
                            
                            cols = r.find_all("td")
                            dept_name = "금융감독원"
                            if len(cols) >= 4:
                                possible_dept = cols[2].get_text(strip=True)
                                if possible_dept and not re.match(r"\d{4}-\d{2}-\d{2}", possible_dept):
                                    dept_name = f"금융감독원({possible_dept})"
                            
                            results.append({
                                "id": post_id,
                                "title": f"[금감원] {title}",
                                "url": full_url,
                                "date": date_str,
                                "dept": dept_name,
                                "category": category
                            })
            except Exception as e:
                print(f"[{category}] 금감원 보도자료 Page {page} 수집 에러: {e}")
                
        print(f"[{category}] 금감원 보도자료 총 {len(results)}건 수집 완료")
        return results

    def scrape_laws(self):
        """법제처 DRF API를 통한 법률/시행령(eflaw) 및 행정규칙/고시(admrul) 통합 수집"""
        results = []
        category = "공포법령"
        seen_ids = set()
        print(f"[{category}] 법제처 공포 법령 및 행정규칙(고시) 통합 수집 시작...")

        # 1. 법률 및 시행령 수집 (target=eflaw)
        for kw in self.law_keywords:
            try:
                url = f"https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=eflaw&type=XML&query={kw}&display=40"
                res = requests.get(url, headers=self.headers, verify=False, timeout=10)
                if res.status_code == 200:
                    root = ET.fromstring(res.content)
                    for law in root.findall("law"):
                        name = law.findtext("법령명한글") or law.findtext("법령명") or ""
                        prom_no = law.findtext("공포번호") or ""
                        prom_date = law.findtext("공포일자") or ""
                        enf_date = law.findtext("시행일자") or ""

                        prom_date_fmt = f"{prom_date[:4]}-{prom_date[4:6]}-{prom_date[6:]}" if len(prom_date) == 8 else prom_date
                        enf_date_fmt = f"{enf_date[:4]}-{enf_date[4:6]}-{enf_date[6:]}" if len(enf_date) == 8 else enf_date

                        unique_id = f"law_{name}_{prom_no}_{enf_date_fmt}"
                        if unique_id in seen_ids:
                            continue
                        seen_ids.add(unique_id)

                        title = f"[{name}] (공포 제{prom_no}호 | 시행일 {enf_date_fmt})"
                        encoded_name = urllib.parse.quote(name)
                        detail_url = f"https://www.law.go.kr/법령/{encoded_name}"

                        results.append({
                            "id": unique_id,
                            "title": title,
                            "url": detail_url,
                            "date": prom_date_fmt,
                            "dept": "법제처/관보",
                            "category": category,
                            "law_name": name,
                            "prom_no": prom_no,
                            "enf_date": enf_date_fmt
                        })
            except Exception as e:
                print(f"[{category}] 법령 키워드 '{kw}' 수집 에러: {e}")

        # 2. 행정규칙 / 금융위 고시 수집 (target=admrul) -> 금융투자업규정 개정고시 등
        admrul_keywords = ["금융투자업규정", "금융소비자", "자본시장", "가상자산", "전자금융", "지배구조"]
        for kw in admrul_keywords:
            try:
                url = f"https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=admrul&type=XML&query={kw}&display=40"
                res = requests.get(url, headers=self.headers, verify=False, timeout=10)
                if res.status_code == 200:
                    root = ET.fromstring(res.content)
                    for adm in root.findall("admrul"):
                        name = adm.findtext("행정규칙명") or ""
                        no = adm.findtext("발령번호") or adm.findtext("고시번호") or ""
                        prom_date = adm.findtext("발령일자") or adm.findtext("고시일자") or ""
                        enf_date = adm.findtext("시행일자") or ""
                        dept = adm.findtext("발령부처명") or "금융위원회"

                        prom_date_fmt = f"{prom_date[:4]}-{prom_date[4:6]}-{prom_date[6:]}" if len(prom_date) == 8 else prom_date
                        enf_date_fmt = f"{enf_date[:4]}-{enf_date[4:6]}-{enf_date[6:]}" if len(enf_date) == 8 else enf_date

                        unique_id = f"admrul_{name}_{no}_{prom_date_fmt}"
                        if unique_id in seen_ids:
                            continue
                        seen_ids.add(unique_id)

                        title = f"[{name}] (금융위 고시 제{no}호 | 발령일 {prom_date_fmt})"
                        encoded_name = urllib.parse.quote(name)
                        detail_url = f"https://www.law.go.kr/행정규칙/{encoded_name}"

                        results.append({
                            "id": unique_id,
                            "title": title,
                            "url": detail_url,
                            "date": prom_date_fmt,
                            "dept": dept,
                            "category": category,
                            "law_name": name,
                            "prom_no": no,
                            "enf_date": enf_date_fmt
                        })
            except Exception as e:
                print(f"[{category}] 행정규칙 키워드 '{kw}' 수집 에러: {e}")

        print(f"[{category}] 총 {len(results)}건 통합 수집 완료")
        return results

    def scrape_all(self):
        """금융위 및 금감원 수집 후 금융위-금감원 중복 보도자료는 금융위 보도자료로 자동 대체"""
        all_data = []
        for category, url in self.targets.items():
            print(f"[{category}] 수집 시작: {url}")
            data = self.scrape_board(category, url)
            print(f"[{category}] 수집 완료: {len(data)}건")
            all_data.extend(data)
        
        # 금감원 멀티페이지 보도자료 수집
        fss_press_data = self.scrape_fss_press()
        
        # 금융위 보도자료의 정규화 키 맵 생성
        fsc_titles = set()
        for item in all_data:
            if item.get("category") == "보도자료":
                norm_key = self._normalize_title(item.get("title", ""))
                if norm_key:
                    fsc_titles.add(norm_key)

        # 금감원 보도자료 중 금융위 보도자료와 제목이 중복되는 항목 제거 (금융위 보도자료로 대체)
        filtered_fss_data = []
        dedup_count = 0
        for item in fss_press_data:
            norm_key = self._normalize_title(item.get("title", ""))
            if norm_key in fsc_titles:
                dedup_count += 1
                continue
            filtered_fss_data.append(item)
            
        print(f"[보도자료] 금융위-금감원 중복 보도자료 {dedup_count}건 금융위 보도자료로 우선 대체 완료")
        all_data.extend(filtered_fss_data)

        # 법제처 공포 법령/고시 수집
        law_data = self.scrape_laws()
        all_data.extend(law_data)

        all_data.sort(key=lambda x: x["date"], reverse=True)
        return all_data

if __name__ == "__main__":
    scraper = FinancialRegulatoryScraper()
    test_results = scraper.scrape_all()
    print(f"\n총 수집 건수: {len(test_results)}건")
    for r in test_results[:5]:
        print(r)
