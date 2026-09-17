# 간결한 검토 화면 — 2026-09-17 개편

현재 화면 표시는 아래 기준을 우선한다. 이전 기능·Worker 설명은 내부 구조 참고용이다.

- 메인 Brief: 상위 최대 3건 수, 최상위 안건 1건과 한 줄 이유, 오늘 게시/우선검토/30일 내 시행 건수, 목록 이동 버튼만 표시한다. 신규는 실제 게시일이 오늘인 항목이며 수집일을 대신 사용하지 않는다. 우선검토 수는 보여주는 상위 건수이고 전체 후보 수와 다를 수 있다.
- 먼저 확인하세요: 제목, 관련 업무 최대 2개, 시행/의견마감 D-day 또는 신규 여부, 화살표로 단순화했다. Gemini 버튼은 검토 요약의 하단으로 모았다.
- 검토 요약: 요약(최대 2문장·180자), 이유 최대 3개, 실무 확인사항 최대 3개, 관련 업무 최대 3개 등 네 영역이다. 체크는 임시 UI이고 상단의 확인 완료 기록과 독립적이다.
- 하단 기본 CTA는 공식 원문과 Gemini Enterprise 두 개다. 프롬프트 미리보기는 ‘분석에 사용할 정보 확인’을 펼쳐 사용할 수 있다.
- 점수·confidence·분석 단계·기술 배지·막대·긴 조치표·변경사항 전체·원문 근거 전문은 기본 화면에서 제거했다. 분석 데이터·원문 캐시·원문 링크·점수 계산·정렬·업무관점·확인 기록은 유지한다.
- API가 없는 현재 모드에서는 화면의 섹션명을 ‘검토 요약’으로 표시하며 자동 생성 AI 결과로 오인시키는 기술 배지를 사용하지 않는다. 심층분석은 회사 Gemini에서 사용자가 프롬프트를 제출한 후 수행한다.
- 표시용 helper는 `ui-v2/ai-presentation.js`. 점수 엔진과 데이터 모델을 변경하지 않았다.
- 검증: Node 61개 중60 통과/기존1 skip. 기존 엔진과 동일 상위3건, 데이터/검색/필터/업무관점/확인 및 되돌리기/캘린더/캐시/원문 근거 보존/저장 차단/390px 모바일 통과. Gemini clipboard/popup/수동대체/XSS 검증 통과. 페이지 오류와 깨진 자산 없음.
- 운영 merge/push/배포는 수행하지 않았다. 실제 회사 Agent URL은 별도 설정이 필요하다.

---

# Gemini Enterprise Handoff — 현재 기본 모드

## 1. 기능 개요와 API를 사용하지 않는 이유

현재 UI는 회사 승인 Gemini Enterprise 환경으로 프롬프트를 전달하는 순수 frontend 기능을 기본으로 사용한다. API 키, LLM fetch, OAuth, 분석 서버, 외부 analytics를 사용하지 않는다. 이전 Worker 구현은 보존했지만 `ai-config.js`의 `apiEnabled:false`로 연결을 비활성화했다. 저장된 기존 endpoint만으로는 호출되지 않는다. 아래의 과거 Worker 문서는 별도 구현 참고용이다.

## 2. Architecture

```text
[공개 금융규제 Source]
           ↓
[RegWatch: 수집·분류·Rule 기반 우선검토·업무 관점 필터]
           ↓ 사용자 선택
[Gemini Enterprise 심층분석: Prompt 자동 생성·Clipboard 복사]
           ↓ 사용자가 Ctrl+V, Enter
[회사 승인 Gemini Enterprise / RegWatch Regulatory Analyst Agent]
           ↓
[규제 영향 분석·실무 Action·추가 검토사항]
```

RegWatch는 모든 규제를 생성형 AI에 전송하지 않는다. 사용자가 선택한 안건의 버튼을 누르면 프롬프트만 복사하고 Agent 탭을 연다. 실제 프롬프트 제출과 분석 시작은 사용자의 붙여넣기 및 Enter 조작 후 Gemini에서 이루어진다.

## 3. Gemini Enterprise Agent 준비 및 URL 설정

회사에서 승인한 Gemini Enterprise에 RegWatch Regulatory Analyst Agent를 준비하고 사용자 접근권한을 부여한다. Agent 생성이나 로그인 자동화는 이 코드의 범위가 아니다. 실제 회사 Agent URL은 제공되지 않아 기본값을 비워 두었다.

브라우저 개발자 콘솔:

```javascript
window.RegWatchGemini.setAgentUrl('https://실제-회사-Agent-주소');
window.RegWatchGemini.getAgentUrl();
```

또는 다음 설정 후 새로고침:

```javascript
localStorage.setItem('regwatch_gemini_agent_url', 'https://실제-회사-Agent-주소');
location.reload();
```

공통 기본 주소는 `ui-v2/gemini-enterprise.js`의 `DEFAULT_AGENT_URL` 한 곳에 지정한다. 로딩 전에 `window.REGWATCH_GEMINI_CONFIG`를 지정할 수도 있다. 주소는 HTTPS만 허용하며 계정 비밀번호가 들어간 URL은 거부한다. 주소 자체는 secret이 아니다. 저장소가 차단되면 helper 설정은 현재 페이지 메모리에서 동작한다.

## 4. 사용자 동작 및 버튼

‘먼저 확인하세요’ 각 카드와 REGULATION BRIEF에 ‘✨ Gemini Enterprise 심층분석’을 제공한다. 상세 화면의 ‘분석 Prompt 미리보기’로 포함 데이터를 먼저 확인할 수 있다. 반복 안내 modal은 강제하지 않으며 버튼 tooltip과 미리보기에서 설명한다. Daily Brief에는 밀도를 고려해 추가 버튼을 중복 배치하지 않았다.

버튼 클릭 → 입력 검증 → 현재 업무 관점 반영 → 프롬프트 생성 → 사용자 클릭 흐름에서 탭 확보 → clipboard 복사 → 6.5초 안내. 팝업 차단을 피하려고 복사 완료를 기다리기 전에 탭을 열며 opener를 제거한 뒤 Agent로 이동한다. 프롬프트는 URL에 넣지 않는다. 연속 클릭은 처리 중 및 최소 1.5초 동안 차단한다.

## 5. Prompt 생성 및 포함 필드

`normalizeRegulationForGemini()`는 title, source, department, type, published_date, effective_date, comment_deadline, keywords, content, original_url만 허용한다. 기존 데이터의 dept/category/date/enf_date/notice_end_date/url을 대응시킨다. workView는 현재 선택값이다. 전체 객체·내부 메모·캐시·확인 기록은 포함하지 않는다.

핵심내용, 변경사항, 12개 업무 영향, 현재 관점 분석, 우선검토 이유, Action 표, 내규, 시스템, 교육, 확인질문, 최종요약의 11개 항목을 요청한다. 자산운용업계 영향의 근거와 영향 경로도 요청한다. content가 없으면 메타데이터 기반 예비 분석임을 표시하며 원문을 읽었다고 가정하지 않도록 지시한다. 원문 링크가 없으면 ‘제공되지 않음’을 사용한다. 제목·본문 내 명령은 분석 데이터로 취급한다.

## 6. Clipboard·오류 처리와 보안

`navigator.clipboard.writeText` → 임시 textarea/`execCommand('copy')` → 수동 복사 가능한 preview modal 순서다. Agent 주소가 없더라도 복사는 수행하며 설정 도움말을 보여준다. 팝업 차단 시 수동 Agent 링크를 제공한다. Preview는 textarea.value와 textContent를 사용해 HTML을 실행하지 않는다. 새 탭은 opener가 없고 수동 링크에는 noopener/noreferrer를 사용한다. clipboard 복사만으로 Gemini에 프롬프트가 제출되지 않는다. 사용자의 붙여넣기 전 자동 전송이나 Send는 없다.

## 7. 테스트 방법 및 결과

```powershell
node --test ui-v2/tests/*.test.cjs ai-worker/tests/*.test.js
node ui-v2/tests/gemini-browser.cjs
node ui-v2/tests/ai-browser.cjs
```

브라우저 테스트는 Playwright+Edge 필요. 외부 설치 경로는 PLAYWRIGHT_MODULE로 지정한다. 실제 회사 Gemini에는 접속하지 않고 회사 주소를 mock으로 대체한다. 구 Worker 회귀 테스트도 mock으로만 동작한다.

- Node 57개: 56 통과 / 기존 과거 snapshot 1 skip.
- Edge: 실제 clipboard, 실제 새 탭(mock 목적지), AML 관점, 주소 미설정, 복사 두 방식 실패 및 수동복사, 팝업차단, 중복클릭, XSS, 390px 모바일 확인.
- 기존 데이터 로딩·피드·우선검토·검색·필터·직무·확인완료·캘린더·localStorage·상세 회귀 통과.
- 기존 endpoint가 저장되어 있어도 생성형 AI 요청 0건. page error 0건.

## 8. 로컬 실행 및 GitHub Pages 배포

저장소 상위 폴더에서 `python -m http.server 8765 --bind 127.0.0.1` 후 `http://127.0.0.1:8765/Financial-tracker/ui-v2/`를 연다. Worker 실행과 API 키가 필요 없다. 스크립트/CSS는 상대경로로 로드해 Pages 하위경로를 지원한다.

검토 후 현재 feature branch 변경을 main에 반영하고 기존 Pages workflow로 배포한다. 이번 작업은 push/merge/운영배포를 수행하지 않았다. 회사 주소를 기본값에 지정하지 않으면 각 브라우저에서 설정해야 한다.

## 9. 경진대회 시연

미리 회사 로그인과 Agent URL을 준비한다. RegWatch → 먼저 확인하세요 → 상세 Prompt 미리보기 → Gemini Enterprise 심층분석 → 복사 안내 → 열린 회사 Agent에서 Ctrl+V → Enter. 클릭부터 붙여넣기까지 짧은 흐름이며 분석 완료 시간은 회사 Gemini에 달려 있다.

## 10. 현재 한계

회사 Agent URL과 접근권한은 별도 준비가 필요하다. Gemini 결과는 RegWatch에 자동으로 돌아오지 않으며 우선순위 점수나 캐시에 반영하지 않는다. 원문·첨부를 새로 수집하지 않고 선택 안건에 이미 있는 content만 포함한다. 특히 협회 POST 기반 상세주소는 링크만으로 개별 게시글 접근이 어려울 수 있어 제목·날짜를 대조하고 필요한 원문을 회사 Gemini에서 직접 제공해야 한다. 브라우저 정책에 따라 수동 복사/탭 열기가 필요하다. 실제 회사 Agent 로그인·분석 결과는 검증하지 않았다.

---

# 이전 API Worker 구현 참고 — 현재 기본 UI에서는 비활성화

# RegWatch AI — UI 2.0 추가 레이어

## 협회 원문 기반 분석

협회 항목의 AI 분석 요청 시 Worker가 `law.kofia.or.kr`에서 해당 원문을 가져온다. 예고는 `revisionSeq`를 담은 POST로 본문을 읽는다. 제·개정 이력은 `historySeq`에 해당하는 요약문을 읽고, 요약문이 없으면 원문 페이지의 동일 이력 링크를 확인한 뒤 규정 전문을 읽는다. 제목과 게시·제개정일이 일치해야 한다.

원문을 확보하지 못하면 AI를 호출하지 않고 예비 검토로 복귀한다. 임의 URL·외부 redirect는 허용하지 않으며 HTML은 2MB까지 읽는다. 본문 추출에 htmlparser2를 사용하며 원격 스크립트를 실행하지 않는다. 첨부 HWP/HWPX/PDF는 포함하지 않는다. 긴 전문은 앞 12,000자만 분석하며 전문만으로 이번 개정사항을 추정하지 않도록 모델에 지시한다.

협회 API 응답은 `{ analysis, source_document }` 형식이다. `analysis`는 기존 분석 스키마, `source_document`는 서버가 확인한 제목·날짜·본문·출처·조회시각·전체 본문 해시·절단 여부를 담는다. 프런트는 이 근거가 없는 협회 본문 분석을 받지 않는다. 상세의 '분석에 사용한 협회 원문 보기'에서 실제 전달 본문과 범위를 확인할 수 있다.

캐시는 메타데이터 키에서 본문·원문 해시가 포함된 실제 분석 키를 참조한다. 24시간 이내는 원문과 분석을 함께 재사용하고, 만료 후 재조회한다. 따라서 24시간 안에 원문이 바뀐 사실을 즉시 감지하지는 않는다. 기존 본문 근거 없는 협회 AI 캐시는 사용하지 않는다. Worker와 프런트를 함께 업데이트해야 한다.

2026-09-16 내려받은 실제 협회 HTML로 로컬 Workers 런타임을 검증했다. 예고 156번은 본문 764자 전체, 제·개정 1795번은 전문 63,692자 중 12,000자를 전달했다. 모델 응답은 mock이며 실제 유료 AI 호출·운영 배포는 하지 않았다.

## 자산운용업계 영향 분석

상세 화면에 자산운용업계에 미칠 영향 섹션을 추가했다. `asset_management_impact` 필드로 근거·영향 경로·불확실성을 서술한다. 실제 API 결과는 AI 영향 분석으로, API 미연결/장애 시에는 규칙 기반 예비 검토로 구분한다. 새 필드가 없는 이전 캐시는 스키마 검증에서 제외된다. 프런트와 Worker를 함께 업데이트해야 한다.

## 화면 수정 사항

Regulation Brief 상세에서는 우선순위 점수·등급, Rule/Impact 내역, 신뢰도 수치와 업무 영향도 점수 표시를 제거했다. 영향 업무는 이름만 표시하며 규칙 권고 Action은 숨긴다. 실제 AI 분석의 권고 Action과 대시보드 카드 점수는 유지한다.

## 1. 기능 개요

기존 수집 데이터·분류·검색·자료 종류/법령 필터·확인 완료·일괄 확인/되돌리기·캘린더·수동 재수집을 유지하면서 우선검토 카드, 오늘의 Brief, 기존 REGULATION BRIEF 모달에 분석을 추가한다. 기존 순위 함수와 피드의 우선검토 필터는 그대로 유지한다.

기준: 원격 `main`의 `08c6611` (2026-09-16 확인). 별도 작업 사본의 브랜치 `feature/regwatch-ai`. 원래 로컬 저장소의 미추적 `ui-ax/`는 복사하거나 수정하지 않았다. 운영 사이트에는 아직 배포하지 않았다.

## 2. Architecture

```text
기존 JSON/JS 수집 데이터 → 기존 우선검토 후보 (미확인, 업무 범위 적용)
                         → Rule 0~60점 상위 10건
                         → localStorage의 유효한 분석 조회
                         → 상세 클릭 시 POST /analyze (최대 동시 2건)
GitHub Pages             → Cloudflare Worker → Gemini Interactions API
                         ← JSON Schema 검증 ← 구조화 JSON
                         → 카드 / 상세 / Daily Brief
API 미설정               → deterministic RULE ANALYSIS
API 장애                 → RULE ANALYSIS + 기존 우선순위 정렬 복귀
```

`ui-v2/ai-config.js`: 공개 endpoint와 timeout/TTL 설정. API Key는 없다.

`ui-v2/ai-schema.js`: 12개 업무 분류, JSON Schema, 런타임 검증, 안내 문구. 프런트와 Worker가 같은 계약을 사용한다.

`ui-v2/ai-analysis.js`: 입력 매핑, 점수, fallback, SHA-256 캐시, 요청 중복 제거와 동시성 제한, 안전한 HTML 렌더러.

`ui-v2/ai-ui.js`: 카드/Brief/상세 화면. 기존 `app.js`에는 3곳의 연결 지점만 추가한다. `ai.css`는 기존 색상 변수를 사용한다.

`ai-worker/src/index.js`: origin, 입력, 크기, rate limit, Gemini timeout 및 출력 검증. 협회 항목은 kofia-source.js에서 확인한 공식 본문을 사용한다. 다른 기관은 제공된 입력 데이터를 사용한다.

## 3. AI Priority 계산

최종 점수 = `round(clamp(Rule, 0, 60) + clamp(Impact, 0, 40))`.

| Rule 항목 | 기준 | 최대 |
|---|---|---:|
| 시행 임박도 | 0~7일 20, 8~30일 15, 31~90일 5, 나머지 0 | 20 |
| 의견마감 임박도 | 0~7일 10, 8~30일 7, 나머지 0 | 10 |
| 업무 키워드 | taxonomy 최대 영향도 × 3 | 15 |
| 자료 유형 | 공포법령 10, 입법예고 8, 보도자료 4, 시장동향 1 | 10 |
| 최신성 | 과거 0~7일 5, 8~30일 3, 31~90일 1 | 5 |

누락·잘못된 날짜, 과거 기한, 미래 게시일은 해당 가점을 받지 않는다. 게시일을 시행일로 사용하지 않는다. 기존 데이터의 `enf_date`는 공포법령, `notice_end_date`는 입법예고일 때만 사용한다.

AI Impact는 업무 영향 15 + 내부통제 10 + 변경 가능성 10 + 긴급성 5의 합을 모델에 요청한다. 서버는 반환값이 정수 0~40인지 검증한다. 세부 가점은 모델 내부 판단이며 별도 필드로 반환하지 않는다.

Fallback Impact는 최대 업무 영향 × 3, 내부통제 × 2, 변경 키워드·관련 업무 일치 시 5, 수집된 시행/마감 일정이 가까우면 5를 합산한다. 0~40점 범위이며 실제 AI 분석으로 표시하지 않는다.

90 이상 매우 높음/red, 75 이상 높음/orange, 60 이상 보통/yellow, 나머지 낮음/neutral. 직무 관점은 해당 업무 영향 × 2를 **정렬에만** 더한다. 표시 점수는 100점 척도를 유지한다. 자산운용사 관점은 기존 후보 필터를 유지하고 운용 영향도를 사용한다.

## 4. AI와 Rule fallback

- endpoint 없음: `RULE ANALYSIS`, 규칙 Impact를 포함한 점수와 예비 분석.
- endpoint 있음·호출 전: `AI 분석 대기`, Rule 점수만 표시. 첫 로딩/업무 관점 변경은 AI API 호출을 하지 않는다.
- 실제 API 성공: `AI ANALYSIS`, Rule + AI Impact.
- API 장애·429·500·timeout·JSON/schema 오류: `AI 연결 불가 · 기존 규칙 적용`. 기존 우선검토 순서로 돌아가고 해당 분석의 AI 가점은 0. 같은 실패 요청은 60초간 재호출하지 않는다.
- API 분석 대상은 현재 기존 미확인 우선검토 후보 중 Rule 점수 상위 10건뿐이다. 다른 상세에서는 규칙 분석을 제공한다. 백그라운드 API 큐는 사용하지 않는다.
- Daily Brief는 현재 상위 후보 최대 10건의 분석 범위와 실제 AI/Rule 건수를 명시한다. 영향 업무는 중복 집계이며 사이트 전체의 실제 규제 적용 건수로 해석하면 안 된다.

협회 항목은 서버에서 원문을 확보한 뒤 분석한다. 다른 기관의 입력에 `content`가 없으면 `metadata_only`. 실제 본문이 제공된 경우에만 `content_based`가 가능하다. 규칙 엔진은 본문을 해석하지 않으므로 항상 `metadata_only`. 별도 법령 개정이유 뷰어의 본문을 자동으로 합치지는 않는다. 메타데이터 분석의 confidence 상한은 40이며 이 값은 검증된 정확도 확률이 아니다.

캐시 키: `regwatch_ai_v2_{encodeURIComponent(id)}_{SHA256}`. 날짜·제목·담당부서·기관·키워드·본문·원문 URL의 변경을 반영한다. 본문 전체로 해시를 만들고 실제 API 전송은 최대 12,000자. 저장 시각 기준 TTL 24시간, endpoint 변경 시 무효. 캐시에서 읽었다고 만료가 연장되지 않는다. 저장이 차단되거나 용량이 부족하면 메모리 캐시를 사용한다. 확인 완료 저장 키와 분리한다.

AI 점수마다 설명 tooltip을 제공하며 AI 분석 화면 하단에는 다음 문구를 표시한다.

> AI 분석은 규제 검토를 보조하기 위한 참고자료입니다. 실제 적용 여부 및 대응 필요성은 공식 원문과 회사 업무를 담당자가 직접 대조하여 최종 판단해야 합니다.

## 5. Gemini Interactions API 설정

Google의 Interactions REST API를 native fetch로 호출한다. SDK 의존성은 추가하지 않았다.

- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/interactions`
- 인증: `x-goog-api-key` 헤더. URL·프런트·로그에 키를 넣지 않는다.
- `store: false`, 단일 규제 요청, 대화 ID 및 tool 사용 없음.
- `system_instruction`과 `<REGULATION_DATA>`를 분리한다. JSON 안의 `<`, `>`를 escape하여 데이터가 구분자를 닫지 못하게 한다.
- `response_format: { type: "text", mime_type: "application/json", schema: ... }`.
- `steps`의 `model_output.content`에서 text만 추출한다. completed가 아닌 응답·refusal·빈 값·JSON 파싱 실패·스키마 불일치를 거부한다.
- 기존 모든 필드 및 `asset_management_impact`를 유지한다. 숫자 범위, 필수 필드, enum, 추가 필드를 서버와 프런트에서 검증한다.
- Gemini 호출 timeout 14초, 원문 조회 포함 Worker 22초, 프런트 25초. 출력 한도 4,500 tokens.
- 파싱 실패 `AI_RESPONSE_PARSE_ERROR`, 스키마 오류 `AI_RESPONSE_SCHEMA_ERROR`, 시간 초과 `AI_PROVIDER_TIMEOUT`, 기타 공급자 오류 `AI_PROVIDER_UNAVAILABLE`. 안전한 코드만 프런트에 반환한다.
- `GET /health`: provider, 설정 유무, 서비스 상태만 반환하며 실제 공급자 연결 성공을 뜻하지 않는다.

기본 모델은 `env.GEMINI_MODEL || "gemini-3.6-flash"`다. 변수만 변경하여 다른 호환 모델을 선택할 수 있다. 해당 계정의 모델 권한·할당량·한국어 분석 품질은 실제 호출로 확인해야 한다.

Google AI Studio에서 발급한 키를 로컬 전용 `ai-worker/.dev.vars`에 입력한다. **이 파일과 API 키를 repository에 commit하지 않는다.**

```dotenv
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.6-flash"
```

개발용 최소 연결 검사:

```powershell
cd ai-worker
node scripts/test-gemini.js
```

스크립트는 환경변수 또는 `.dev.vars`를 읽고 키 존재 여부, 선택 모델, HTTP status, 호출/파싱 성공 여부만 출력한다. 키가 없으면 외부 호출을 생략한다. 키가 있으면 최소 구조화 JSON 호출 1회를 수행한다. 규제 분석 품질 평가를 대신하지 않는다.

## 6. Cloudflare Worker 배포

저장소 루트에서:

```powershell
cd ai-worker
npm ci
npx wrangler login
```

`wrangler.toml`의 `GEMINI_MODEL = "gemini-3.6-flash"`를 필요 시 변경한다. production은 `.dev.vars` 대신 Worker secret을 사용한다. 기존 계정에서 사용 중인 rate limit namespace와 겹치지 않도록 `namespace_id`도 확인한다.

```powershell
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

키는 프롬프트에 입력하며 파일·Git·프런트엔드에 넣지 않는다. Worker는 이 저장소의 `ui-v2/ai-schema.js`를 번들에 포함하므로 `ai-worker/`만 따로 복사하지 않는다.

배포 없이 번들 확인:

```powershell
npx wrangler deploy --dry-run
```

## 7. API Key와 보안

운영 키는 Worker secret `GEMINI_API_KEY`만 사용한다. 로그는 provider, 안전한 모델명, HTTP status, 오류 코드, 소요시간만 기록한다. 키/원문/모델 응답을 로그로 출력하지 않는다. `ai-worker/.gitignore`는 `.dev.vars`, `.env*`, `.wrangler`, `node_modules`를 제외한다.

Origin은 정확히 `https://v11797-cloud.github.io`만 허용한다. 로컬 개발 시에만 `ALLOW_LOCALHOST=true`로 `http://localhost:<port>`, `http://127.0.0.1:<port>`를 허용한다. `/analyze`는 Origin 없는 요청도 거부한다. 공개 상태 조회 `/health`는 예외다. CORS는 인증을 대신하지 않으며 비브라우저 클라이언트는 Origin을 위조할 수 있다.

기본 rate limit은 Cloudflare 위치별 IP당 60초 10회. 회사 공용 IP는 한도를 공유한다. 이는 전역 비용 상한이나 사용자 인증이 아니다. 공개 서비스 규모가 커지면 인증/Turnstile 및 계정별 비용 통제를 추가해야 한다. 바인딩·키 미설정은 호출을 차단한다.

Worker 입력은 최대 80KB, 본문 12,000자, 모델 출력은 JSON Schema와 범위 검증을 적용한다. 모든 AI 텍스트는 escape 처리한다. 본문 안의 명령은 분석 데이터로 취급하도록 system prompt에 명시한다. 이 방어가 모델의 사실 정확성을 보증하지는 않는다.

## 8. 프런트엔드 endpoint 연결

UI 2.0을 연 브라우저 console에서:

```javascript
localStorage.setItem('regwatch_ai_endpoint', 'https://YOUR-WORKER.workers.dev/analyze');
location.reload();
```

해당 브라우저에만 적용된다. 모든 사용자에게 기본 연결하려면 `ai-config.js`의 공개 endpoint 기본값을 배포된 주소로 설정한다. 키는 넣지 않는다.

API 없는 데모로 복귀:

```javascript
localStorage.removeItem('regwatch_ai_endpoint');
location.reload();
```

AI 레이어 전체를 끄려면 `ai-config.js`의 `enabled`를 `false`로 바꾼다. 기존 피드/우선검토/상세는 작동한다.

## 9. 로컬 테스트와 GitHub Pages

저장소 상위 폴더에서(폴더명이 Financial-tracker인 경우):

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

`http://127.0.0.1:8765/Financial-tracker/ui-v2/`를 연다. `file://` 대신 HTTP를 사용한다. 모든 새 JS/CSS 주소는 `./` 상대경로다.

저장소 루트에서:

```powershell
node --test ui-v2/tests/*.test.cjs ai-worker/tests/*.test.js
python -m pip install -r requirements.txt
python -m unittest discover -s ui-v2/tests -p 'test_*.py'
```

브라우저 통합 테스트는 `ui-v2/tests/ai-browser.cjs`에 있다. Playwright와 Edge 또는 Chromium이 필요하다. 테스트는 AI API와 GitHub Actions 조회를 mock 처리하며 실제 재수집/유료 API를 실행하지 않는다. 실행 지침은 해당 파일 첫머리를 확인한다.

로컬 Worker 개발:

```powershell
cd ai-worker
npx wrangler dev --var ALLOW_LOCALHOST:true
```

로컬 API 호출까지 확인하려면 `.dev.vars`에 `GEMINI_API_KEY`, `GEMINI_MODEL`을 설정한다. 이 파일은 Git에 넣지 않는다. 키가 없으면 503과 `{ "ai_available": false, "error_code": "AI_PROVIDER_UNAVAILABLE" }`를 반환한다. `/health`는 키 없이도 200이다.

GitHub Pages는 기존 `main`의 `daily_tracker.yml` 및 후속 `ui-v2-kofia.yml`를 그대로 사용한다. 변경 브랜치 검토 후 `main`으로 반영하면 기존 수집·배포가 수행된다. 이 작업에서는 push/merge/운영 배포를 실행하지 않았다. 로컬 설치한 `ai-worker/node_modules`, `.dev.vars` 등을 Git에 추가하지 않는다. 기존 Pages workflow가 저장소 전체를 업로드하므로 secret은 반드시 Worker에만 보관한다.

## 10. 경진대회 데모 순서

1. API 미설정 상태에서 화면을 열고 ‘AI 오늘의 Regulatory Brief’의 Rule/AI 건수 구분을 보여준다.
2. ‘먼저 확인하세요’에서 RULE 점수·선정 이유·영향 업무를 확인한다.
3. ‘AI 상세 분석’에서 예비 분석 또는 협회 본문 기반 분석, 영향 업무, 업계 영향, 확인 질문, 공식 원문/확인 완료를 보여준다.
4. 준법/AML/IT 관점을 변경해 정렬 관점을 비교한다. 관련 후보가 없으면 순서가 달라지지 않을 수 있다.
5. Worker 연결 후 후보 상세를 눌러 대기 → 분석 중 → AI ANALYSIS로 전환되는 것을 보여준다.
6. 같은 항목 재조회/새로고침 시 캐시를 사용함을 확인한다.
7. endpoint를 잘못된 테스트 주소로 바꿔 장애 시 기존 Rule 정렬과 피드가 유지됨을 보여준다.

## 검증 결과와 한계

- JS 54개 중 53개 통과, 기존 특정 과거 스냅샷 테스트 1개 의도적 skip.
- 기존 Python 수집기 테스트 9개 통과. 실시간 외부기관 재수집은 수행하지 않았다.
- Headless Edge: 1,624건 데이터, 검색/필터/직무 관점, 확인 완료/취소, 일괄 확인/되돌리기, 캘린더, mock AI 로딩·성공·캐시, 429 fallback, storage 차단, 390px 모바일 확인. JS 미처리 오류와 깨진 하위경로 자산 없음.
- Wrangler dry-run 번들 생성 및 rate limit binding 확인.
- 실제 Workers 로컬 런타임: mock Gemini upstream + 실제 rate limit binding으로 정상 JSON 200 검증. 별도 HTTP 검사에서 preflight 204, 키 미설정 503, 외부 origin 403 확인.
- 실제 Gemini 호출, Cloudflare 배포, 운영 GitHub Pages 반영은 미실행. Gemini 키 미설정 상태다.
- 로컬 HTTP `/health` 200, `/analyze` 503, OPTIONS 204 및 실제 Worker → 브라우저 RULE ANALYSIS 전환 확인.
- 로컬 Git 도달 가능 이력 253개 blob과 작업 파일 58개를 API 키 패턴으로 검사했으며 노출 패턴을 발견하지 못했다. 패턴 검사는 모든 비밀값을 식별한다는 보장은 아니다.
- Wrangler의 Request.cf 조회는 로컬 인증서 체인 경고로 기본값을 사용했다. TLS 검증은 끄지 않았으며 로컬 Worker 및 번들 검증은 통과했다.
- 협회 외 기관의 자동 원문 수집·첨부파일 해석·회사별 적용대상 판단·팀 공유 확인 기록은 추가하지 않았다. 확인 질문 체크는 일시적인 화면 조작이다.
- Daily Brief는 별도 LLM 호출 없이 현재 분석들의 집계로 생성한다.
- 프런트 캐시는 브라우저별이며 서버 공용 캐시는 없다. Worker/IP rate limit과 브라우저 동시성 제한은 전역 동시성·정확한 비용 상한을 보장하지 않는다.

공식 참고: [Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [Interactions REST reference](https://ai.google.dev/api/interactions-api-v1), [May 2026 응답 형식 변경](https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026), [Cloudflare Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### Gemini 전환 검증 (2026-09-17)

CASE A(AML 메타데이터)와 CASE B(본문 제공)는 mock 응답으로 입력/출력 계약을 검증했다. 실제 모델의 환각 여부나 분석 품질 검증으로 해석하면 안 된다. 400/401/403/404/429/500/503, 키 누락, 실제 타이머 abort, 빈 응답·잘못된 JSON·스키마 오류를 검사했다. 키가 없어 실서비스 호출은 하지 않았다.

캐시 namespace를 v2로 변경하여 이전 공급자의 캐시를 사용하지 않는다. 같은 공급자에서 모델을 교체한 직후 새 결과가 필요하면 브라우저의 `regwatch_ai_v2_` 키만 삭제한다. 확인 완료 기록은 삭제하지 않는다.

Gemini API Key 입력 후 실제 호출 테스트 필요
