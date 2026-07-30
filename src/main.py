import os
import json
from scraper import FinancialRegulatoryScraper

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "regulatory_data.json")
JS_FILE = os.path.join(DATA_DIR, "regulatory_data.js")

def main():
    print("=== 금융 규제 업데이트 수집기 실행 ===")
    
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    existing_dict = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                raw_list = json.load(f)
                for item in raw_list:
                    if isinstance(item, dict) and "id" in item:
                        existing_dict[item["id"]] = item
        except Exception as e:
            print(f"기존 데이터 로딩 중 에러(새로 만듭니다): {e}")

    scraper = FinancialRegulatoryScraper()
    new_items = scraper.scrape_all()

    # 새로 가져온 최신 데이터로 덮어쓰기 및 추가 (Upsert)
    for item in new_items:
        existing_dict[item["id"]] = item

    final_data = list(existing_dict.values())
    # 날짜 최신순 정렬
    final_data.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    max_history_limit = 1000
    if len(final_data) > max_history_limit:
        final_data = final_data[:max_history_limit]

    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(final_data, f, indent=4, ensure_ascii=False)
            
        with open(JS_FILE, "w", encoding="utf-8") as f:
            f.write(f"window.regulatoryData = {json.dumps(final_data, indent=4, ensure_ascii=False)};")
            
        print(f"전체 데이터 업데이트 완료: 총 {len(final_data)}건 최신화 저장됨")
    except Exception as e:
        print(f"데이터 저장 중 에러 발생: {e}")

if __name__ == "__main__":
    main()
