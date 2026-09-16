const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseBase, latestRuns, runState } = require('../collection.js');
test('existing production script is parsed as JSON without executing code', () => {
  const result = parseBase(fs.readFileSync(path.join(__dirname, '../../data/regulatory_data.js'), 'utf8'));
  assert.ok(result.items.length > 0);
  assert.match(result.updated, /KST$/);
  assert.throws(() => parseBase('window.lastUpdated = "x"; window.regulatoryData = alert(1);'));
  assert.throws(() => parseBase('window.lastUpdated = "x"; window.regulatoryData = [];'));
  assert.throws(() => parseBase('window.lastUpdated = "x"; window.regulatoryData = [{"id":"a"}];'));
});

async function mount({ active = false, apiError = false, invalidData = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', disabled: false, events: {}, children: [], addEventListener(name, fn) { this.events[name] = fn; }, replaceChildren() { this.children = []; }, append(child) { this.children.push(child); } });
    return elements.get(id);
  };
  let applied = 0, opened = 0;
  const requests = [];
  const context = {
    document: { baseURI: 'https://example.test/Financial-tracker/ui-v2/', hidden: false, getElementById: element, createElement: () => ({}), addEventListener() {} },
    window: { applyCollectedData() { applied++; }, open() { opened++; } },
    URL, Date, AbortSignal, console: {error() {}}, setTimeout() {}, setInterval() {},
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('api.github.com')) return {ok: !apiError, status: 403, json: async () => ({workflow_runs: [{id: 100, path: '.github/workflows/daily_tracker.yml', head_branch: 'main', status: active ? 'queued' : 'completed', conclusion: active ? null : 'success', created_at: new Date().toISOString(), run_attempt: 1}]})};
      return {ok: true, json: async () => ({}), text: async () => invalidData ? 'broken' : 'window.lastUpdated = "2026-09-16 10:00 KST"; window.regulatoryData = [{"id":"x","title":"example"}];'};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../collection.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { element, requests, applied: () => applied, opened: () => opened };
}
test('successful deployment refreshes data using project-relative no-store GETs', async () => {
  const ui = await mount();
  assert.equal(ui.applied(), 1);
  assert.ok(ui.requests.some(x => x.url.startsWith('https://example.test/Financial-tracker/data/regulatory_data.js?t=')));
  assert.ok(ui.requests.some(x => x.url.startsWith('https://example.test/Financial-tracker/ui-v2/data/kofia_data.json?t=')));
  assert.ok(ui.requests.every(x => x.options.credentials === 'omit' && x.options.cache === 'no-store' && !x.options.headers));
});
test('open-only fallback prevents duplicate click and never claims dispatch', async () => {
  const ui = await mount();
  ui.element('collect-button').events.click(); ui.element('collect-button').events.click();
  assert.equal(ui.opened(), 1);
  assert.equal(ui.element('collect-button').disabled, true);
  assert.match(ui.element('collection-status').textContent, /Run workflow/);
});
test('active workflow disables button; unavailable status does not claim success', async () => {
  const active = await mount({active: true});
  assert.equal(active.element('collect-button').disabled, true);
  const failed = await mount({apiError: true});
  assert.match(failed.element('collection-status').textContent, /조회하지 못했습니다/);
  assert.equal(failed.applied(), 0);
});
test('invalid refreshed JSON preserves the currently loaded data', async () => {
  const ui = await mount({invalidData: true});
  assert.equal(ui.applied(), 0);
  assert.match(ui.element('collection-status').textContent, /현재 자료를 유지/);
});
test('status selects only latest main runs of the two existing workflows', () => {
  const run = (id, workflow, branch = 'main') => ({ id, path: `.github/workflows/${workflow}`, head_branch: branch });
  const result = latestRuns([run(9, 'daily_tracker.yml', 'other'), run(2, 'daily_tracker.yml'), run(8, 'ui-v2-kofia.yml'), run(5, 'daily_tracker.yml'), run(99, 'unrelated.yml')]);
  assert.deepEqual(result.map(x => x.id), [5, 8]);
  assert.deepEqual(latestRuns([]), [null, null]);
});
test('queued, failed, skipped and missing runs are never reported as successful', () => {
  assert.equal(runState(null), '미확인');
  for (const status of ['queued', 'in_progress', 'waiting', 'pending']) assert.equal(runState({status}), '수집·배포 진행 중');
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) assert.equal(runState({status: 'completed', conclusion}), '실패·취소');
  assert.equal(runState({status: 'completed', conclusion: 'skipped'}), '실행 생략');
  assert.equal(runState({status: 'completed', conclusion: 'success'}), '완료');
});
