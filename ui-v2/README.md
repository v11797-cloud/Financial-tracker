# Financial Tracker — UI 2.0 테스트

기존 운영 페이지와 분리된 Vanilla HTML/CSS/JS 대시보드입니다. 협회 연동 버전은 `ui-v2/`와 별도 `.github/workflows/ui-v2-kofia.yml`을 사용합니다. 기존 운영 파일·수집기·배포 workflow는 수정하지 않습니다.

## 파일과 실행

```text
Financial-tracker/
├── index.html                  기존 운영 버전 — 수정 없음
├── index.css                   기존 운영 CSS — 수정 없음
├── data/regulatory_data.js     기존 공용 데이터 — 수정 없음
└── ui-v2/
    ├── index.html
    ├── style.css
    ├── app.js
    ├── README.md
    └── tests/core.test.cjs
```

- 기존 저장소의 `ui-v2/`를 업데이트하고 `.github/workflows/ui-v2-kofia.yml`을 추가합니다. 루트 `index.html`을 교체하지 마세요.
- 로컬에서는 `ui-v2/index.html`을 브라우저로 열 수 있습니다. 데이터는 `../data/regulatory_data.js`에서 직접 읽습니다. 파일 URL에서 브라우저가 저장소·클립보드를 제한하면 현재 화면 내 확인 상태와 복사 대체 기능을 사용합니다.
- HTTP 미리보기: 저장소 루트에서 `python -m http.server 8765`를 실행하고 `http://localhost:8765/ui-v2/`에 접속합니다.
- 실행 의존성 추가와 npm 빌드는 없습니다. 아이콘·폰트 CDN이 없어도 v2는 동작합니다.
- 선택적 로직 검증: 저장소 루트에서 `node --test ui-v2/tests/core.test.cjs`.

## 유지한 기능

보도자료·입법예고·공포/시행 법령·금융시장동향, 제목·부서·카테고리 검색, 정밀 법령 필터 4개와 협회규정·모범규준 필터(그룹 내 단일 선택), 검색어 강조, 원문 링크, 링크 복사, 시행일 캘린더와 이전/다음/이번 달 이동을 제공합니다. 모든 과거 개정 이력은 목록에서 페이지를 이동해 확인할 수 있습니다. UI 2.0의 달력은 화면에 명시된 검색·필터를 적용합니다. 사이드바의 캘린더를 열면 목록 필터를 초기화해 전체 일정을 보여줍니다.

## 추가한 업무 흐름

- 오늘 게시·우선 검토·30일 내 시행·미확인 지표를 눌러 피드로 이동
- 전체 금융회사 / 자산운용사 관련 후보 관점 선택
- 미확인 우선 검토 상위 3건과 다음 시행 일정
- 최신순·검토 우선순·시행 임박순·오래된순 정렬
- 상세 패널에서 공포·발령번호, 원문 확인, 분류 근거, 명시적 확인 완료
- 브라우저에 확인 상태 저장, 변경된 항목은 다시 미확인으로 처리
- 모바일에서 세부 필터 펼치기, 가로 스크롤 월간 달력과 동일한 세로 일정 목록

## 데이터의 의미와 한계

오늘 게시와 D-Day는 한국시간(KST) 날짜 단위로 계산합니다. 오늘 게시 건수는 오늘 수집된 건수가 아닙니다. 최근 수집 시각은 기존 `lastUpdated` 값을 표시하며 기관별 수집 성공 여부를 의미하지 않습니다.

우선 검토와 자산운용 관련성은 제목·부서·시행일에 기반한 규칙입니다. 규제 적용 여부나 법적 중요도 확정 판정이 아닙니다. 전체 규칙은 화면의 ‘분류·날짜 기준’에 있습니다.

기존 기관 자료에는 의견제출 마감일이 없어 ‘미수집’으로 표시합니다. 협회 예고는 목록에 명시된 예고종료일을 표시합니다. 시행일은 유효한 `enf_date`만 사용하며 게시일·제개정일·예고종료일로 대체하지 않습니다. 협회 제·개정정보 목록에는 시행일이 없으므로 시행일 캘린더에는 임의로 추가하지 않습니다. 과거 시행일은 ‘시행일 경과’이며 현행 유효성을 의미하지 않습니다. 기존 법령 원문 주소는 법명 기반이므로 연혁과 공포번호를 대조해야 합니다.

## 금융투자협회 연동

- 규정 제·개정예고: 전체 목록을 입법예고 탭에 포함합니다. 종료된 예고도 이력으로 유지하며 우선 검토에서는 제외합니다.
- 최신제·개정정보: 현행규정 트리에서 협회규정·모범규준 아래에 있는 규정의 개정 이력만 공포/시행 법령 탭에 포함합니다. 하위 폴더의 설명서·가이드라인도 포함하며 표준약관과 현행 분류를 확인할 수 없는 규정은 제외합니다.
- 제목 추정 대신 원본 규정 식별자와 트리 계층을 대조합니다. 개정 이력 식별자별로 보존합니다.
- `scripts/collect_kofia.py` → `data/kofia_data.json` 및 `.js` → 기존 데이터와 UI에서 합쳐 표시합니다. 기존 공용 데이터는 복제·변경하지 않습니다.
- 협회 목록 페이지는 POST로 조회하고 전체 페이지·건수·중복을 검증한 후 저장합니다. 조회·검증 실패 시 기존 스냅샷을 유지하고 workflow를 실패 처리합니다.
- 예고 원문도 POST 조회가 필요하여 `kofia-notice.html`과 `.js`가 검증한 숫자 식별자로 협회 원문을 엽니다. 연결 페이지 주소를 복사·공유할 수 있습니다.
- 협회 수집 시각을 기존 기관 수집 시각과 별도로 표시합니다.

수동 갱신 및 검증(저장소 루트):

```sh
python -m pip install -r requirements.txt
python ui-v2/scripts/collect_kofia.py
python -m unittest discover -s ui-v2/tests -p 'test_kofia.py'
node --test ui-v2/tests/core.test.cjs ui-v2/tests/kofia.test.cjs
```

## 확인 기록 격리

### 필터 UI 업데이트 (2026-09-08)

자료 종류와 법령·규정을 두 그룹으로 구분했습니다. 그룹마다 하나만 선택하며 새 선택은 이전 선택을 대체합니다. 법령·규정에는 전체, 기존 4개 법령, 협회규정, 모범규준이 있습니다. 각 그룹의 전체 버튼은 해당 조건만 해제하고 필터 초기화는 검색·자료 종류·법령·규정·미확인 조건을 초기화합니다. 버튼 건수는 해당 옵션을 선택했을 때 현재 다른 조건에 맞는 목록 건수입니다.

협회규정과 모범규준은 KOFIA의 실제 현행 분류로 판별합니다. 분류가 수집되지 않은 예고를 제목만으로 포함하지 않습니다. 모바일은 필터 펼치기와 적용 개수 안내를 유지합니다. Node 21개·Python 7개 검증 통과, 데스크톱 단일 선택 전환 및 모바일 전환·초기화·빈 결과·가로 넘침 검증 완료.

저장 키는 `financial-tracker:ui-v2:reviews:v1`입니다. 서버나 원본 JSON에 기록하지 않으며 운영 화면과 공유하지 않습니다. 항목 `id`와 내용 지문을 함께 사용하므로 동일 법명·원문 URL의 다른 개정본은 별도 기록됩니다. 검색 페이지 번호 등 원문 URL의 일시적인 매개변수만 달라진 경우는 새 개정으로 취급하지 않습니다. 상세나 원문 열기만으로 자동 확인하지 않습니다. 저장 차단·용량 제한 시 현재 화면에서 계속 동작하며 상태 표시에서 알려줍니다.

## GitHub Pages 반영 및 원복

현재 `.github/workflows/daily_tracker.yml`은 저장소 루트 전체를 Pages에 업로드합니다. `ui-v2/` 변경과 새 `.github/workflows/ui-v2-kofia.yml`을 `main`에 반영하면 기존 배포가 실행됩니다. 기존 workflow, crawler, 공용 JSON, 운영 HTML/CSS를 편집할 필요가 없습니다.

새 `UI 2.0 KOFIA Data` workflow는 기존 `Daily Financial Regulatory Tracker`의 성공 이후 실행되어 협회 자료만 수집·검증·커밋하고 Pages를 배포합니다. GitHub Actions에서 수동 실행도 가능합니다. 최초 반영 후 Actions에서 두 작업의 성공을 확인하세요. 저장소 정책이 봇의 main push를 제한한다면 커밋 단계에서 실패하므로 해당 정책에 맞춘 데이터 반영 절차가 필요합니다. 강제 push는 사용하지 않습니다.

테스트 경로는 `https://v11797-cloud.github.io/Financial-tracker/ui-v2/`입니다. 기존 `https://v11797-cloud.github.io/Financial-tracker/`는 기존 루트 파일을 계속 사용합니다. 이번 협회 연동 변경은 로컬 구현·검증 상태이며 공개 배포는 아직 수행하지 않았습니다.

UI 2.0 전체를 제거하려면 `ui-v2/`와 새 `.github/workflows/ui-v2-kofia.yml`을 삭제하고 기존 방식으로 다시 배포합니다. 협회 연동만 되돌리려면 이번 변경 커밋을 revert합니다. 운영 파일 복구나 데이터 마이그레이션은 없습니다. 브라우저의 v2 확인 기록은 운영 페이지에서 사용하지 않습니다.

## 검증 기준

협회 연동 기준 커밋: `6ec1271b6a35aa5e011b691a0dcc1e11215033ec`. 2026-09-07 검증: 기존 기관 462건 + 협회 1,110건 = 1,572건. 협회 예고 152건, 제·개정정보 1,437건 중 협회규정 543건·모범규준 415건 포함, 479건 제외. 건수는 수집 시점에 따라 달라집니다.

Node 20개 및 Python 7개 검증 통과. 기존 필터·날짜·확인 기록 검증에 협회 분류·전체 페이지·개정별 식별·데이터 불변성·예고 종료일·원문 연결 검증을 추가했습니다. 브라우저에서 입법예고 152건, 제·개정 958건과 예고 원문 정상 연결을 확인했습니다. 기준 커밋 대비 기존 운영 파일·공용 데이터·수집기·배포 workflow 변경은 없습니다. 새 GitHub Actions의 원격 실행은 배포 후 확인이 필요합니다.


## 자료 재수집 (2026-09-16)

상단 수집 시각 아래 `↻ 자료 재수집`을 누르면 기존 Daily Financial Regulatory Tracker의 GitHub 실행 화면이 열립니다. GitHub 로그인 및 저장소 Actions 실행 권한이 있는 사용자가 `Run workflow → main → Run workflow`를 눌러 실행합니다. 이 버튼 자체는 실행 요청 API를 호출하지 않습니다. backend/serverless가 없는 정적 Pages이므로 외부 서비스와 secret을 추가하지 않는 fallback입니다.

- 기존 `daily_tracker.yml`의 workflow_dispatch → `python src/main.py` → data 저장/commit/push/Pages 배포 → 기존 `ui-v2-kofia.yml`의 workflow_run → `python ui-v2/scripts/collect_kofia.py` 및 `python ui-v2/scripts/collect_law_reasons.py` → 보조 데이터 검증/commit/push/Pages 배포를 재사용합니다. workflow와 수집기 변경 없음.
- 기존 기관 출력: `data/regulatory_data.json`, `data/regulatory_data.js`. 협회 출력: `ui-v2/data/kofia_data.json`, `.js`. 개정이유: `ui-v2/data/law_reasons.js`.
- 최근 수집은 기존 `window.lastUpdated`와 협회 `updated_at` 값을 각각 표시합니다. 별도 상태 파일을 만들지 않습니다.
- 공개 GitHub API를 인증 없이 GET으로만 조회합니다. 페이지가 보일 때 2분 간격으로 두 workflow 각각의 최신 main 실행 상태와 실행 기록 링크를 표시합니다. 두 기록을 같은 요청으로 추정하지 않습니다. API 제한/통신 실패 시 GitHub 화면에서 확인하도록 안내합니다.
- 버튼을 누른 후 60초간, 실제 진행 상태를 확인한 동안 버튼을 비활성화합니다. 정적 페이지이므로 GitHub의 직접 실행이나 다른 브라우저까지 막지는 않습니다. 기존 workflow의 pages concurrency를 유지합니다.
- 배포 성공 감지 시 데이터만 갱신합니다. 기존 JS 데이터는 텍스트로 받아 JSON 부분만 파싱하며 eval하지 않습니다. cache=no-store와 시각 쿼리를 사용하고 CDN 지연에 대비해 후속 조회에서도 다시 확인합니다. `다시 불러오기`도 같은 갱신 기능입니다. 검색/필터/확인 기록을 유지하며 잘못된 응답은 기존 화면을 보존합니다.
- 기존 수집기는 기관 오류를 로그에 남기고 이전 누적 자료를 유지하지만, 일부 오류와 저장 오류를 프로세스 실패로 반환하지 않습니다. 따라서 workflow 성공이 모든 기관의 수집 성공을 보증하지 않습니다. 개별 기관 상태는 실행 로그를 확인하세요. 협회 수집기는 검증 실패 시 기존 스냅샷을 보존하고 실패합니다.
- 데이터 미변경 시 기존 auto-commit action과 보조 workflow의 cached diff 검사로 commit을 생략합니다.
- 새 Secret, PAT, 외부 서비스 가입 및 Pages 설정 변경은 필요 없습니다.

검증: `node --test ui-v2/tests/*.test.cjs`, `python -m unittest discover -s ui-v2/tests -p 'test_*.py'`. 기존 운영 파일과 ui-ax 작업은 변경하지 않습니다.
