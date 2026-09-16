/* Public, read-only Actions status. Authentication and dispatch stay on GitHub. */
(() => {
  'use strict';
  const REPO = 'v11797-cloud/Financial-tracker';
  const WORKFLOWS = ['daily_tracker.yml', 'ui-v2-kofia.yml'];
  const workflowURL = `https://github.com/${REPO}/actions/workflows/${WORKFLOWS[0]}`;
  function latestRuns(runs) {
    return WORKFLOWS.map(path => runs.filter(run => run.head_branch === 'main' && run.path === `.github/workflows/${path}`)
      .sort((a, b) => Number(b.id) - Number(a.id))[0] || null);
  }
  function runState(run) {
    if (!run) return '미확인';
    if (run.status !== 'completed') return '수집·배포 진행 중';
    return run.conclusion === 'success' ? '완료' : run.conclusion === 'skipped' ? '실행 생략' : '실패·취소';
  }
  function parseBase(text) {
    const match = /^\s*window\.lastUpdated\s*=\s*("[^"\r\n]*");\s*window\.regulatoryData\s*=\s*([\s\S]*?);?\s*$/.exec(text);
    if (!match) throw new Error('Unexpected production data format');
    const items = JSON.parse(match[2]);
    if (!Array.isArray(items) || !items.length || !items.every(item => item && typeof item.id === 'string' && typeof item.title === 'string')) throw new Error('Invalid production data');
    return { items, updated: JSON.parse(match[1]) };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { latestRuns, runState, parseBase }; return;
  }
  const button = document.getElementById('collect-button');
  const status = document.getElementById('collection-status');
  const details = document.getElementById('collection-details');
  const reload = document.getElementById('reload-button');
  let busy = false, checking = false, refreshing = false, openedAt = 0, lastCheck = 0;
  let lastSuccess = '', retryAfter = 0, refreshRemaining = 0;
  async function get(url, json = true) {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) retryAfter = Date.now() + 3600000;
      throw new Error(`HTTP ${response.status}`);
    }
    return json ? response.json() : response.text();
  }
  async function refreshData() {
    if (refreshing) return false;
    refreshing = true; reload.disabled = true;
    const previous = reload.textContent; reload.textContent = '불러오는 중…';
    try {
      const [text, kofia] = await Promise.all([
        get(new URL('../data/regulatory_data.js', document.baseURI).href, false),
        get(new URL('./data/kofia_data.json', document.baseURI).href)
      ]);
      const base = parseBase(text);
      window.applyCollectedData(base, kofia);
      return true;
    } catch (error) {
      console.error('Data refresh failed', error);
      status.textContent = '최신 데이터를 불러오지 못했습니다. 현재 자료를 유지합니다. 다시 불러오기를 눌러주세요.';
      return false;
    } finally { refreshing = false; reload.disabled = false; reload.textContent = previous; }
  }
  function updateButton() {
    button.disabled = busy || Date.now() - openedAt < 60000;
    button.textContent = busy ? '⏳ 자료 수집 중…' : button.disabled ? 'GitHub 실행 대기…' : '↻ 자료 재수집';
  }
  async function check() {
    if (checking || Date.now() < retryAfter || Date.now() - lastCheck < 60000) return;
    checking = true; lastCheck = Date.now();
    try {
      const payload = await get(`https://api.github.com/repos/${REPO}/actions/runs?per_page=50`);
      if (!Array.isArray(payload.workflow_runs)) throw new Error('Invalid Actions response');
      const runs = latestRuns(payload.workflow_runs);
      busy = runs.some(run => run && run.status !== 'completed');
      details.replaceChildren();
      runs.forEach((run, index) => {
        const link = document.createElement('a');
        link.href = run ? `https://github.com/${REPO}/actions/runs/${Number(run.id)}` : `https://github.com/${REPO}/actions/workflows/${WORKFLOWS[index]}`;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        const time = run ? new Date(run.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        link.textContent = `${index ? '협회·개정이유' : '기존 기관'}: ${runState(run)} ${time} ↗`;
        details.append(link);
      });
      const newManual = runs[0] && runs[0].event === 'workflow_dispatch' && Date.parse(runs[0].created_at) >= openedAt;
      if (busy) status.textContent = '최근 workflow 실행 중입니다. 수집 → 데이터 저장 → Pages 배포 순으로 진행됩니다.';
      else if (openedAt && !newManual) status.textContent = 'GitHub 화면에서 Run workflow → main → Run workflow를 눌러주세요. 아직 새 수동 실행이 확인되지 않았습니다.';
      else if (runs.some(run => run && run.status === 'completed' && !['success', 'skipped'].includes(run.conclusion))) status.textContent = '⚠ 최근 수집·배포 작업에 실패 또는 취소가 있습니다. 아래 실행 기록을 확인하세요.';
      else status.textContent = runs.every(run => run && run.conclusion === 'success') ? '✓ 최근 수집·배포 완료 · 아래 두 workflow는 각각의 최신 실행입니다.' : '최근 실행 상태를 확인했습니다. 아래 두 workflow는 각각의 최신 실행입니다.';
      const success = runs.filter(run => run && run.status === 'completed' && run.conclusion === 'success').map(run => `${run.id}:${run.run_attempt}`).join(',');
      if (success && success !== lastSuccess) { lastSuccess = success; refreshRemaining = 3; }
      // Recheck on subsequent polls as Pages/CDN publication can lag workflow completion.
      if (refreshRemaining > 0 && await refreshData()) refreshRemaining -= 1;
    } catch (error) {
      console.error('Actions status unavailable', error);
      status.textContent = '실행 상태를 조회하지 못했습니다. GitHub 실행 화면에서 확인하세요. 현재 자료는 유지됩니다.';
    } finally { checking = false; updateButton(); }
  }
  button.addEventListener('click', () => {
    if (button.disabled) return;
    // This only opens GitHub: never claim that a workflow has been dispatched.
    window.open(workflowURL, '_blank', 'noopener,noreferrer');
    openedAt = Date.now(); updateButton();
    status.textContent = 'GitHub에서 Run workflow → main → Run workflow를 눌러주세요. 로그인과 저장소 실행 권한이 필요합니다.';
    setTimeout(updateButton, 60000);
    check();
  });
  reload.addEventListener('click', refreshData);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(() => { if (!document.hidden) check(); }, 120000);
  check();
})();
