# 금융 규제 실시간 업데이트 대시보드 (Financial Regulatory Tracker)

이 프로그램은 금융위원회(FSC)의 고시공고, 보도자료, 입법예고 데이터를 매일 자동으로 수집하여 개인정보 노출이나 서버 유지 비용 없이 로컬 브라우저에서 한눈에 모니터링할 수 있는 프리미엄 웹 대시보드 시스템입니다.

## 🌟 주요 특징
- **완벽한 개인정보 보호:** 외부 이메일 API 연동이나 API 키 발급이 불필요하여 비밀번호 등 민감정보 유출 걱정이 없습니다.
- **실시간 비동기 필터링:** 대시보드 상에서 키워드 검색 및 중요 법안(자본시장법, 금소법 등) 필터 칩 제공.
- **프리미엄 UI:** 다크 네이비 테마의 미려한 반응형 디자인으로 모바일/PC 어디서나 최적화된 화면을 자랑합니다.
- **CORS 우회 로컬 실행:** 별도의 로컬 웹 서버(Apache, Node.js 등)를 기동하지 않고, `index.html` 파일을 더블 클릭하여 여는 것만으로도 수집된 데이터를 즉각 연동해 보여줍니다.

---

## 🚀 사용법

### 1. 원클릭 실행 (수동 업데이트 및 확인)
- 폴더 내의 `run_tracker.bat` 파일을 더블 클릭합니다.
- 콘솔 창에서 최신 데이터를 수집(약 1~2초 소요)한 후, 자동으로 브라우저에 `index.html` 창이 띄워집니다.

## 🌐 동료와 공유하기 (GitHub Pages + GitHub Actions)

이 프로젝트는 **GitHub Pages**와 **GitHub Actions**를 활용하여 서버 비용 없이 **매일 아침 8시(KST)에 자동으로 최신 규제 데이터를 수집하고 무료 웹 링크로 타인에게 공유**할 수 있도록 준비되어 있습니다.

### 1️⃣ GitHub 저장소 생성 및 코드 올리기
1. [GitHub](https://github.com/) 접속 후 로그인 후 새로운 저장소(New Repository)를 만듭니다. (예: `financial-tracker`)
2. 프로젝트 폴더(`C:\Users\user\.gemini\antigravity\scratch\financial_regulatory_tracker`)에서 다음 명령어들을 순서대로 실행하여 코드를 올립니다:
   ```bash
   git init
   git add .
   git commit -m "feat: 금융 규제 트래커 첫 커밋"
   git branch -M main
   git remote add origin https://github.com/<본인아이디>/financial-tracker.git
   git push -u origin main
   ```

### 2️⃣ GitHub Pages 웹사이트 배포 활성화
1. GitHub 저장소 페이지의 **[Settings]** 탭으로 이동합니다.
2. 좌측 메뉴의 **[Pages]**를 클릭합니다.
3. **Build and deployment** 섹션 아래의 **Branch** 설정을 `main` / `/(root)` 로 선택 후 **[Save]**를 누릅니다.
4. 약 1~2분 후 저장소 상단에 타인과 공유 가능한 **무료 웹 주소**가 표시됩니다!
   - 🔗 `https://<본인아이디>.github.io/financial-tracker/`

### 3️⃣ 매일 아침 자동 수집 권한 설정
1. 저장소의 **[Settings]** -> **[Actions]** -> **[General]**로 이동합니다.
2. **Workflow permissions** 항목을 **`Read and write permissions`**로 변경하고 **[Save]**를 누릅니다.
3. 이제 매일 아침 8시(한국시간)에 GitHub가 서버에서 자동으로 파이썬 스크립트를 실행하여 최신 금융위 데이터를 가져오고 대시보드를 자동 업데이트합니다.

---

## ⏰ 매일 아침 로컬 자동 업데이트 설정 방법 (Windows 작업 스케줄러)

컴퓨터가 켜져 있을 때 매일 아침 지정된 시간에 백그라운드에서 데이터를 수집하고 최신화하도록 윈도우 작업 스케줄러에 등록할 수 있습니다.

1. **작업 스케줄러 실행:**
   - 키보드 `윈도우 키 + R`을 누릅니다.
   - 실행 창에 `taskschd.msc`를 입력하고 엔터를 쳐서 **작업 스케줄러**를 엽니다.

2. **기본 작업 만들기:**
   - 우측 [작업] 패널에서 **[기본 작업 만들기...]**를 클릭합니다.
   - 이름: `금융 규제 트래커` 입력 후 [다음] 클릭.

3. **트리거 및 시간 설정:**
   - 작업 시작 주기: **[매일]** 선택 후 [다음] 클릭.
   - 시작 시간: 원하는 아침 시각 (예: `오전 08:30:00`) 설정 후 [다음] 클릭.

4. **동작 설정:**
   - 수행할 작업: **[프로그램 시작]** 선택 후 [다음] 클릭.

5. **스크립트 경로 지정 (중요):**
   - **프로그램/스크립트:** `찾아보기`를 눌러 이 프로젝트 폴더 내의 `run_tracker.bat` 파일을 선택합니다.
     - 예: `C:\Users\user\.gemini\antigravity\scratch\financial_regulatory_tracker\run_tracker.bat`
   - **시작 위치(옵션):** 배치 파일이 정상 작동하기 위해 배치 파일이 위치한 **폴더 경로**를 반드시 적어주어야 합니다.
     - 예: `C:\Users\user\.gemini\antigravity\scratch\financial_regulatory_tracker`
   - 설정 완료 후 [다음] 클릭.

6. **완료:**
   - 마침(Finish) 버튼을 클릭하여 작업을 완료합니다.
   - 이제 매일 아침 설정한 시간에 자동으로 최신 금융 규제를 긁어모아 로컬 데이터베이스를 최신 상태로 유지하게 됩니다! (필요시 대시보드 파일 `index.html`을 북마크하여 언제든지 더블 클릭하여 접속하시면 됩니다.)
