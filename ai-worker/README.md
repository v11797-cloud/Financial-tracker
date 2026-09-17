# RegWatch AI Worker

UI 2.0용 `POST /analyze` 프록시. API Key는 Worker secret으로만 설정한다.

저장소 전체를 내려받은 뒤 이 폴더에서:

```powershell
npm ci
npm test
npx wrangler login
```

`wrangler.toml`의 `GEMINI_MODEL`을 Gemini Interactions 호환 모델 ID (기본 gemini-3.6-flash)로 설정하고:

```powershell
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

원격 배포 없는 번들 검증: `npx wrangler deploy --dry-run`.

로컬 실행: `npx wrangler dev --var ALLOW_LOCALHOST:true`. 키/바인딩이 없으면 AI를 호출하지 않고 503과 `{ "ai_available": false, "error_code": "AI_PROVIDER_UNAVAILABLE" }`를 반환한다.

허용된 origin의 오류 응답에도 CORS 헤더가 포함된다. 허용되지 않은 origin은 403. localhost는 개발 옵션이 켜졌을 때만 허용한다.

기본 IP rate limit은 Cloudflare 위치별 60초 10회이며 전역 과금 상한 또는 인증 수단이 아니다. 협회 항목은 숫자 식별자로 구성한 고정 공식 경로만 fetch하고 제목·날짜를 대조한다. 외부 redirect와 임의 URL은 차단한다. 첨부파일은 포함하지 않는다. 성공 시 `{ analysis, source_document }`로 원문 근거를 함께 반환한다. 입력 body 80KB, 본문 12,000자 제한. 원본 DB 전체를 전송하지 않는다.

프런트와 공유하는 JSON Schema는 `../ui-v2/ai-schema.js`에 있다. 해당 파일까지 함께 유지해야 번들이 생성된다.

설정, 보안, 점수, 데모 및 운영 반영 절차는 [REGWATCH_AI.md](../REGWATCH_AI.md)를 참고한다.

로컬 `.dev.vars`: `GEMINI_API_KEY=""`, `GEMINI_MODEL="gemini-3.6-flash"` (각각 별도 줄). 키는 Git에 commit하지 않는다. 운영에서는 `.dev.vars` 대신 Cloudflare secret을 사용한다.

`GET /health`로 설정 유무 확인. 실제 공급자 연결 확인은 `node scripts/test-gemini.js` (Node 22.9 이상). 키는 출력하지 않는다.

Gemini native fetch, `store:false`, `response_format` JSON Schema, `steps/model_output` 파싱. 호출 timeout 14초, 원문 포함 전체 22초. 상세 API 및 캐시 v2 설명은 위 문서를 참고한다.
