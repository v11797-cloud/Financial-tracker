import os
import json
from scraper import FinancialRegulatoryScraper

# 프로젝트 경로 설정
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "regulatory_data.json")

def main():
    print("=== 금융 규제 업데이트 수집기 실행 ===")
    
    # 1. 저장 디렉토리 생성
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        print(f"데이터 디렉토리 생성 완료: {DATA_DIR}")
        
    # 2. 기존 데이터 로드
    existing_data = []
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            print(f"기존 데이터 로드 완료: {len(existing_data)}건")
        except Exception as e:
            print(f"기존 데이터 로딩 중 에러(새로 생성합니다): {e}")
            existing_data = []

    # 기존 데이터 ID 세트 구축 (빠른 조회를 위함)
    existing_ids = {item["id"] for item in existing_data if "id" in item}

    # 3. 크롤러 구동
    scraper = FinancialRegulatoryScraper()
    new_items = scraper.scrape_all()

    # 4. 중복 제거 및 누적
    added_count = 0
    for item in new_items:
        if item["id"] not in existing_ids:
            existing_data.append(item)
            existing_ids.add(item["id"])
            added_count += 1

    print(f"새로 추가된 데이터: {added_count}건")

    # 5. 정렬 및 개수 제한 (최신순 정렬, 최대 1000개 보존)
    existing_data.sort(key=lambda x: x["date"], reverse=True)
    max_history_limit = 1000
    if len(existing_data) > max_history_limit:
        existing_data = existing_data[:max_history_limit]
        print(f"데이터 개수가 제한을 초과하여 최신 {max_history_limit}개로 조정되었습니다.")

    # 6. 저장
    JS_FILE = os.path.join(DATA_DIR, "regulatory_data.js")
    try:
        # JSON 저장
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(existing_data, f, indent=4, ensure_ascii=False)
            
        # JS 저장 (로컬 더블클릭 실행 시 CORS 우회용)
        with open(JS_FILE, "w", encoding="utf-8") as f:
            f.write(f"window.regulatoryData = {json.dumps(existing_data, indent=4, ensure_ascii=False)};")
            
        print(f"전체 데이터 업데이트 완료: 총 {len(existing_data)}건 저장됨")
        print(f"  -> JSON: {DATA_FILE}")
        print(f"  -> JS: {JS_FILE}")
    except Exception as e:
        print(f"데이터 저장 중 에러 발생: {e}")

if __name__ == "__main__":
    main()
