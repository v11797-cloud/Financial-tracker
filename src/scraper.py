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
        # 법제처 수집 키워드 목록
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

    def scrape_board(self, category, url):
        """금융위 게시판 스크래핑"""
        results = []
        try:
            response = requests.get(url, headers=self.headers, verify=False, timeout=10)
            if response.status_code != 200:
                print(f"[{category}] 페이지 요청 실패. 상태코드: {response.status_code}")
                return results

            soup = BeautifulSoup(response.text, "html.parser")
            board_wrap = soup.find(class_="board-list-wrap")
            if not board_wrap:
                board_wrap = soup.find(class_=lambda x: x and "board-list" in x)
                
            if not board_wrap:
                print(f"[{category}] board-list-wrap 요소를 찾을 수 없습니다.")
                return results

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

                item_text = item.get_text(" ", strip=True)
                date_match = re.search(r"(\d{4}-\d{2}-\d{2})", item_text)
                date_str = date_match.group(1) if date_match else datetime.today().strftime("%Y-%m-%d")

                dept_match = re.search(r"담당부서\s*:\s*([^\s\|]+)", item_text)
                dept_str = dept_match.group(1) if dept_match else "금융위원회"
                dept_str = dept_str.replace("조회수", "").replace(":", "").strip()

                post_id = self._extract_id_from_url(full_url)

                results.append({
                    "id": post_id,
                    "title": title,
                    "url": full_url,
                    "date": date_str,
                    "dept": dept_str,
                    "category": category
                })
        except Exception as e:
            print(f"[{category}] 크롤링 중 에러 발생: {e}")
        
        return results

    def scrape_laws(self):
        """법제처 DRF API를 통한 주요 금융 공포/시행 법령 수집"""
        results = []
        category = "공포법령"
        seen_ids = set()
        print(f"[{category}] 법제처 공포 법령 수집 시작...")

        for kw in self.law_keywords:
            try:
                url = f"https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=eflaw&type=XML&query={kw}&display=20"
                res = requests.get(url, headers=self.headers, verify=False, timeout=10)
                if res.status_code != 200:
                    continue
                
                root = ET.fromstring(res.content)
                for law in root.findall("law"):
                    name = law.findtext("법령명한글") or law.findtext("법령명") or ""
                    prom_no = law.findtext("공포번호") or ""
                    prom_date = law.findtext("공포일자") or ""
                    enf_date = law.findtext("시행일자") or ""
                    lsi_seq = law.findtext("법령일련번호") or law.findtext("MST") or ""

                    if len(prom_date) == 8:
                        prom_date_fmt = f"{prom_date[:4]}-{prom_date[4:6]}-{prom_date[6:]}"
                    else:
                        prom_date_fmt = prom_date
                        
                    if len(enf_date) == 8:
                        enf_date_fmt = f"{enf_date[:4]}-{enf_date[4:6]}-{enf_date[6:]}"
                    else:
                        enf_date_fmt = enf_date

                    unique_id = f"law_{name}_{prom_no}_{enf_date_fmt}"
                    if unique_id in seen_ids:
                        continue
                    seen_ids.add(unique_id)

                    title = f"[{name}] (공포 제{prom_no}호 | 시행일 {enf_date_fmt})"
                    # 법제처 제·개정이유 탭(chrClsCd=010202) 직통 웹 URL
                    detail_url = f"https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq={lsi_seq}&chrClsCd=010202"

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
                print(f"[{category}] 키워드 '{kw}' 수집 에러: {e}")

        print(f"[{category}] 총 {len(results)}건 수집 완료")
        return results

    def scrape_all(self):
        """모든 타겟 게시판 및 법제처 법령 수집 통합"""
        all_data = []
        for category, url in self.targets.items():
            print(f"[{category}] 수집 시작: {url}")
            data = self.scrape_board(category, url)
            print(f"[{category}] 수집 완료: {len(data)}건")
            all_data.extend(data)
        
        # 법제처 공포 법령 수집 추가
        law_data = self.scrape_laws()
        all_data.extend(law_data)

        # 날짜 최신순 정렬
        all_data.sort(key=lambda x: x["date"], reverse=True)
        return all_data

if __name__ == "__main__":
    scraper = FinancialRegulatoryScraper()
    test_results = scraper.scrape_all()
    print(f"\n총 수집 건수: {len(test_results)}건")
    for r in test_results[:5]:
        print(r)
