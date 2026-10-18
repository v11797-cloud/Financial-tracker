# RegWatch Agent — Floating Gemini Enterprise Handoff

## 기능 개요 및 변경 파일

UI 2.0 우측 하단의 **RegWatch Agent**는 공개 규제 정보를 선택하고 회사 Gemini Enterprise를 새 탭으로 여는 실행 패널이다. RegWatch 안에 채팅창이나 Gemini iframe을 만들지 않는다. 사용자가 Gemini 답변을 복사한 뒤 기존 분석 가져오기 기능으로 Workspace에 저장한다.

추가: `ui-v2/regwatch-agent.js`, `ui-v2/regwatch-agent.css`, `ui-v2/tests/regwatch-agent.test.cjs`, `ui-v2/tests/regwatch-agent-browser.cjs` 및 이 문서.

수정: `ui-v2/index.html`, `app.js`, `gemini-enterprise.js`, `gemini-analysis.js`, `gemini-analysis-ui.js`, `workspace.js`, `guide.html`, `GEMINI_ANALYSIS.md`, 기존 Gemini 브라우저/단위 테스트 및 `.github/workflows/ui-v2-kofia.yml`의 Node 검사 목록.

현재 브랜치 `feature/regwatch-ai`의 기존 미커밋 작업과 데이터는 보존했다. 이번 변경을 위해 수집기·운영 데이터·읽음 기록·우선검토 저장 키를 변경하지 않았다.

## 플로팅 Agent 사용법

1. 우측 하단 **RegWatch Agent**를 누른다. 이 단계는 외부 탭을 열거나 프롬프트를 복사하지 않는다.
2. 규제가 선택되어 있으면 제목·기관·자료유형·게시일을 확인한다. 없으면 목록에서 선택한다.
3. 분석 유형을 선택하고 필요하면 **실행 전 프롬프트 미리보기**를 펼친다.
4. **Prompt 복사 + Agent 열기**를 누른다.
5. 열린 회사 Gemini 입력창에 Ctrl+V로 붙여넣고 분석을 실행한다.
6. 답변을 복사한 뒤 RegWatch 패널의 **분석 결과 Workspace에 가져오기**를 누른다.

핵심 실행 버튼은 두 개다. 설정은 ⚙, 규제 변경은 작은 텍스트 버튼으로 분리했다. 데스크톱은 고정된 우측 패널이며 본문을 계속 사용할 수 있다. 모바일은 하단 Drawer로 표시한다. 닫기/ESC가 가능하고 버튼에 열림 상태·패널 연결을 제공한다. 닫힌 모달 안으로 포커스가 돌아가지 않도록 처리했다. 알림은 실행 버튼과 겹치지 않도록 배치한다.

## 회사 전용 Agent 생성 및 공유

RegWatch는 회사 Agent를 대신 생성하거나 조직 권한을 바꾸지 않는다. 이미 승인된 Agent가 있으면 그 접속 링크를 사용한다.

Gemini Enterprise Business edition을 사용하는 회사의 경우, 회사 계정으로 로그인한 뒤 **Agents → Create agent**에서 규제 분석 목적·지침을 정하고 미리보기 후 생성한다. **Share**에서 조직 내 이용자에게 공유하거나 접속 링크를 복사한다. 회사 에디션·관리자 설정에 따라 화면과 공유 가능 범위가 다를 수 있다. 절차 근거: [Google 공식 Agent Designer 생성·공유 안내](https://support.google.com/g/answer/16540723?hl=en).

Cloud 관리형 Gemini Enterprise의 조직 내 Agent 공유는 관리자의 사용자·그룹·조직 접근 설정에 따른다. 담당자는 [Google Cloud 공식 Agent 공유 문서](https://docs.cloud.google.com/gemini/enterprise/docs/share-custom-agents)를 확인한다.

권장 Agent 이름은 `RegWatch Regulatory Analyst`다. 생성 지침 예시는 다음과 같다.

> 제공된 공개 금융 규제 자료와 확인 가능한 공식 원문을 근거로 한국어 실무 분석을 작성한다. 사실·시행일·의무·URL을 추정하지 않는다. 원문을 읽지 못했다면 그 사실을 표시한다. 사용자가 지정한 분석 유형과 REGWATCH_EXPORT_V1 형식을 따르며 제공된 규제 ID를 유지한다. 단일 자료만으로 규제 전반의 추세를 단정하지 않는다. 사내 시스템의 변경·메시지 발송·업무 승인은 수행하지 않는다.

Agent 생성·공유와 실제 회사 접근은 사용자/회사 담당자가 수행하는 수동 확인 항목이다.

## Agent URL 설정

패널 우측 위 **⚙ Agent 주소 설정**을 누른다. 기존 초보자용 안내와 주소 입력 폼을 재사용한다. 회사 Agent 화면 또는 공유 링크의 실제 주소를 붙여넣고 저장한다.

- 기존 `regwatch_gemini_agent_url` 및 `RegWatchGemini.setAgentUrl()`을 유지한다.
- HTTPS를 권장하고 유효한 HTTP/HTTPS를 허용한다. 사용자명·비밀번호가 들어간 주소 및 실행 가능한 URL 스킴은 거부한다.
- 저장소가 막히면 현재 탭에만 적용됐음을 알리며 영구 저장 성공으로 표시하지 않는다.
- 주소 저장은 조직 접근 권한을 부여하지 않는다. 로그인·권한은 회사 설정을 따른다.
- 브라우저·origin별 설정이므로 로컬/운영, Chrome/Edge/Codex 내장 브라우저는 각각 등록한다.

## 규제 선택 및 분석 유형

- 우선검토/Regulation Brief: 기존 Gemini 심층분석 버튼이 규제 ID를 넘겨 같은 패널을 연다.
- 전체 Feed: **Agent로 분석** 버튼을 제공한다. 상세보기 선택도 Agent 대상 컨텍스트에 반영한다.
- My Workspace: 기존 **① Gemini로 분석하기/다시 분석** 버튼이 같은 패널을 연다.
- 미선택: 현재 우선검토, Workspace 연결 규제, 전체 Feed에서 검색·선택한다. 본문 검색/필터를 변경하지 않는다.
- 자유 질문: **규제 선택 없이 Gemini Enterprise Agent 열기**를 고르면 규제 프롬프트를 생성·복사하지 않고 Agent만 연다. 분석 저장 시에는 규제를 다시 선택해야 한다.

네 유형은 `asset`(자산운용사 업무 영향), `amendments`(주요 개정내용), `controls`(내부통제/AML), `trends`(트렌드·시사점)다. 자산운용 업무·신구 대비·AML/KYC·정책 시사점의 질문을 구분한다. 트렌드 유형은 단일 안건의 한계를 명시한다.

## 프롬프트 복사와 실행

기존 `buildGeminiRegulationPrompt()`와 `openGeminiEnterpriseAnalysis()`를 확장해 재사용했다. 공개 ID·제목·기관·일정·유형·키워드·상세내용·공식 URL·현재 업무 관점과 선택한 유형의 지시사항을 포함한다. 기존 REGWATCH_EXPORT_V1 스키마는 유지한다.

미리보기를 펼칠 때 또는 실행을 직접 누를 때만 프롬프트를 생성한다. 새 탭은 실행 클릭의 동기 흐름에서 먼저 확보한 뒤 클립보드 복사를 시도한다. opener를 분리하고 설정 URL에 임의의 파라미터를 추가하지 않는다. 팝업 차단 시 수동 열기, 복사 실패 시 직접 복사할 수 있는 기존 미리보기를 제공한다.

## 분석 결과 가져오기 및 Workspace 연결

기존 붙여넣기 → JSON/일반 텍스트 미리보기 → 저장 기능을 재사용한다. 가져오기 창의 규제 대상은 열 때 고정된다. 결과의 ID가 다르면 차단하고, ID가 없으면 선택한 안건에 저장한다는 별도 확인을 받는다.

Workspace에 없는 규제이면 **이 규제를 Workspace에 추가하고 분석 결과를 저장할까요? → 추가 후 저장 / 취소**를 표시한다. 취소 시 새 노트나 분석을 만들지 않는다. 이미 연결한 규제는 기존 메모에 연결한다. 분석 요청 실행만으로는 Workspace 노트를 만들지 않는다.

분석 저장이 실패하면 입력과 기존 이력을 유지한다. 분석은 저장했지만 Workspace 연결 저장에 실패한 경우도 구분해 알린다. 미저장 붙여넣기나 개인 의견이 있을 때 페이지를 떠나면 브라우저 확인을 요청한다. 사용자가 떠나기를 선택하면 메모리의 붙여넣기 초안은 사라질 수 있으므로 저장 또는 원문 내보내기를 사용한다.

## Workspace 저장 및 분석 이력

기존 `regwatch_workspace_v1`, `regwatch_gemini_analyses_v1`을 유지한다. 자유 메모·별도 규제별 의견·검토 상태·체크리스트는 그대로 사용한다. 분석은 새 버전으로 추가하며 기존 개인 의견/완료 상태를 덮어쓰지 않는다.

새 분석에는 기존 레코드 필드에 `analysisType`, `requestId`, `source: gemini_enterprise_manual`, `structuredResult`를 더한다. 오래된 레코드는 이 필드가 없어도 읽는다. 유형과 요청 식별자는 해당 규제와 일치하는 로컬 Handoff에서 가져온 값이며 Gemini 응답 검증 값이 아니다. 요청을 확인할 수 없으면 유형 미지정/빈 requestId로 보관한다. importedAt은 RegWatch 저장 시각이다.

이전 분석은 시간순 이력에서 확인하고 복사·내보내기·확인 후 삭제할 수 있다. Workspace/분석 JSON 백업은 새 메타데이터를 포함하고 기존 백업도 지원한다. 우선검토 제외나 Workspace 연결 삭제는 분석 이력을 삭제하지 않는다. 보관함에서 조회할 수 있다.

Handoff는 기존 `regwatch_gemini_handoff_v1` sessionStorage에 규제 ID/제목, 분석 유형, requestedAt, requestId를 보관한다. 복귀 안내는 실제 Gemini 진행/완료 상태가 아니라 로컬 실행 준비 기록이다. **안내 닫기**로 제거할 수 있다. 다른 규제를 선택하면 이전 실행 안내가 새 대상으로 오인되지 않도록 패널 상태를 지운다.

## 보안과 데이터 전달 범위

이번 기능에는 LLM API 호출, API 키 저장, Gemini iframe/DOM 접근, 자동 로그인·인증 우회·메시지 제출이 없다. 허용된 공개 규제 필드만 프롬프트로 복사한다. Workspace 자유 메모·규제별 개인 의견·기존 분석을 자동 전달하지 않는다. Gemini 답변은 수동으로 가져온 참고자료임을 표시한다. 모든 동적 화면 값은 textContent/value로 출력하고 URL은 검증한다.

## GitHub Pages 배포

현재 변경은 로컬이며 운영 배포하지 않았다. 배포 시 기존 미커밋 변경과 이번 파일 목록을 검토하고 필요한 파일을 함께 커밋한다. 운영 main 반영 후 기존 UI 2.0 Pages 워크플로를 실행하고 성공을 확인한다. 새 JS/CSS와 문서는 저장소 산출물에 포함되며 모든 페이지 자원은 `/Financial-tracker/ui-v2/`의 상대경로로 로드한다. 운영 origin에서 Agent URL을 별도로 설정하고 플로팅 버튼·프롬프트·가져오기·복원을 확인한다.

## 제한사항과 수동 확인

회사 Gemini의 실제 접근·답변 생성·분석 품질은 자동 검증하지 않았다. 회사 계정으로 접속하고 프롬프트를 붙여넣어 실제 분석 후 답변을 복사하는 단계는 사용자가 확인해야 한다. 이 기능은 양방향 API 동기화가 아니며, 정적 사이트의 저장 데이터는 브라우저별이다. Gemini가 URL을 받았다고 원문을 읽은 것으로 간주하지 않는다.

## 테스트 결과 및 실행

- Node 전체: **77개 중 76개 통과, 기존 날짜 스냅샷 1개 건너뜀**.
- `regwatch-agent-browser.cjs`: 요청한 CASE 1~20, 추가로 Toast 겹침·연결 삭제 후 이력 보존·미저장 입력 새로고침 확인을 검증했다.
- 기존 Gemini Handoff의 실제 클립보드/모의 팝업·차단/복사 거부·XSS 검증, 가져오기 23개 시나리오, 주소 설정·직접 Workspace 진입 검증 통과.
- 기존 AI 화면 8개 그룹, 우선검토 15개 시나리오, Workspace 생성·서식·규제 삭제·백업·모바일/키보드 검증 통과.
- 회사 Agent URL 이동은 mock으로 처리했으며 Gemini 페이지 조작이나 분석 호출은 없었다. 새 요청의 외부 네트워크가 없고 페이지 오류가 없음을 확인했다.

```powershell
node --test ui-v2/tests/*.test.cjs
node ui-v2/tests/regwatch-agent-browser.cjs
node ui-v2/tests/gemini-import-browser.cjs
```

브라우저 테스트는 Playwright와 Edge가 필요하고, 로컬 서버를 저장소 상위 디렉터리에서 8765 포트로 실행해야 한다. 실제 회사 Agent 수동 검증은 패널 ⚙ 등록 → 규제/유형 선택 → 미리보기 → 실행 → Gemini에서 붙여넣고 분석 → 답변 복사 → 가져오기/확인 저장 → 새로고침 후 분석·개인 의견 복원을 순서대로 확인한다.
