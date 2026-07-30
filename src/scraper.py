import requests
import urllib3
from bs4 import BeautifulSoup
import re
from datetime import datetime

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

    def _extract_id_from_url(self, url):
        """URL에서 게시글 고유 ID 추출 (noticeId 파라미터 대응 포함)"""
        # 1. noticeId 파라미터가 존재할 경우 (예: ?noticeId=4155)
        notice_match = re.search(r"noticeId=(\d+)", url)
        if notice_match:
            return f"notice_{notice_match.group(1)}"
            
        # 2. 일반 게시판 ID 형태 (예: /no010101/87196)
        match = re.search(r"/(no\d+|po\d+)/(\d+)", url)
        if match:
            return f"{match.group(1)}_{match.group(2)}"
            
        # 3. 매칭 안 되는 특수 케이스 처리
        clean_url = url.split("?")[0].replace("https://", "").replace("http://", "").replace("www.fsc.go.kr", "")
        return clean_url.replace("/", "_").replace(".", "").strip("_")

    def scrape_board(self, category, url):
        """특정 금융위 게시판을 크롤링하여 리스트 반환"""
        results = []
        try:
            response = requests.get(url, headers=self.headers, verify=False, timeout=10)
            if response.status_code != 200:
                print(f"[{category}] 페이지 요청 실패. 상태코드: {response.status_code}")
                return results

            soup = BeautifulSoup(response.text, "html.parser")
            board_wrap = soup.find(class_="board-list-wrap")
            if not board_wrap:
                # 대안으로 일반 board-list 클래스 탐색
                board_wrap = soup.find(class_=lambda x: x and "board-list" in x)
                
            if not board_wrap:
                print(f"[{category}] board-list-wrap 요소를 찾을 수 없습니다.")
                return results

            items = board_wrap.find_all("li")
            for item in items:
                # 1. 제목 및 상세 링크 추출
                a_tag = item.find("a")
                if not a_tag:
                    continue
                
                raw_href = a_tag.get("href", "").strip()
                if not raw_href or raw_href == "#none":
                    continue
                
                # 상대경로 (./ 또는 /로 시작하지 않는 경우 등) 안전하게 정규화
                clean_href = raw_href
                if clean_href.startswith("./"):
                    clean_href = clean_href[1:]  # 온점(.) 제거
                elif not clean_href.startswith("/") and not clean_href.startswith("http"):
                    clean_href = "/" + clean_href
                    
                full_url = clean_href if clean_href.startswith("http") else self.base_url + clean_href
                title = a_tag.get_text(strip=True)
                
                # 불필요한 파일 다운로드 등 텍스트 제거
                title = re.sub(r"파일다운로드.*", "", title)
                title = re.sub(r"파일뷰어.*", "", title)
                title = title.strip()

                # 2. 등록일 추출 (YYYY-MM-DD 패턴)
                item_text = item.get_text(" ", strip=True)
                date_match = re.search(r"(\d{4}-\d{2}-\d{2})", item_text)
                date_str = date_match.group(1) if date_match else datetime.today().strftime("%Y-%m-%d")

                # 3. 담당부서 추출
                dept_match = re.search(r"담당부서\s*:\s*([^\s\|]+)", item_text)
                dept_str = dept_match.group(1) if dept_match else "금융위원회"
                # 특수문자 제거
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

    def scrape_all(self):
        """모든 타겟 게시판 크롤링 및 결과 통합"""
        all_data = []
        for category, url in self.targets.items():
            print(f"[{category}] 수집 시작: {url}")
            data = self.scrape_board(category, url)
            print(f"[{category}] 수집 완료: {len(data)}건")
            all_data.extend(data)
        
        # 날짜 최신순 정렬
        all_data.sort(key=lambda x: x["date"], reverse=True)
        return all_data

if __name__ == "__main__":
    scraper = FinancialRegulatoryScraper()
    test_results = scraper.scrape_all()
    print(f"\n총 수집 건수: {len(test_results)}건")
    for r in test_results[:3]:
        print(r)
