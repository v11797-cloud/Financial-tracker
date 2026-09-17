// Optional: start an HTTP server at the repository parent, install Playwright,
// then run node ui-v2/tests/ai-browser.cjs. PLAYWRIGHT_MODULE can point to an
// external Playwright module. AI_TEST_BASE_URL and AI_TEST_OUTPUT_DIR are optional.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const A = require('../ai-analysis.js');
const Core = require('../app.js');
const base = process.env.AI_TEST_BASE_URL || 'http://127.0.0.1:8765/Financial-tracker/ui-v2/';
const out = process.env.AI_TEST_OUTPUT_DIR || 'work/ai-browser';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: process.env.AI_TEST_BROWSER || 'msedge', headless: true });
  const errors = [], badAssets = [], passed = [];
  async function page(config = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await context.newPage();
    await p.route('https://api.github.com/**', r => r.fulfill({ json: { workflow_runs: [] } }));
    p.on('pageerror', e => errors.push(e.message));
    p.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) badAssets.push(r.url()); });
    await p.addInitScript(c => { window.REGWATCH_AI_CONFIG = { ...c, apiEnabled: Boolean(c.endpoint) }; }, config);
    return p;
  }
  try {
    const p = await page(); await p.goto(base); await p.locator('.ai-priority-row').first().waitFor();
    assert.ok(await p.evaluate(() => window.regulatoryData.length > 0));
    const all=await p.evaluate(()=>[...window.regulatoryData,...window.kofiaData.items].map(i=>({...i,dept:String(i.dept || '담당 부서 미수집'),category:String(i.category || '기타')})));
    const today=Core.kstToday();
    const expected=all.filter(i=>Core.priority(i,today).tier>0).sort((a,b)=>A.calculateRuleScore(b,today)-A.calculateRuleScore(a,today)||a.id.localeCompare(b.id)).slice(0,10).sort((a,b)=>A.calculateFinalPriorityScore(A.calculateRuleScore(b,today),A.buildFallbackAIAnalysis(b,today).ai_impact_score)-A.calculateFinalPriorityScore(A.calculateRuleScore(a,today),A.buildFallbackAIAnalysis(a,today).ai_impact_score)||a.id.localeCompare(b.id)).slice(0,3).map(i=>i.id);
    assert.deepEqual(await p.locator('#priority-list .priority-summary').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),expected);
    assert.equal(await p.locator('#ai-daily-top [data-id]').getAttribute('data-id'),expected[0]);
    assert.equal(await p.locator('#ai-daily .ai-score, #priority-list .ai-score, #priority-list .ai-tag, #priority-list .gemini-button').count(),0);
    await p.locator('#ai-daily-link').click();
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.id),expected[0]);
    passed.push('production data, unchanged score ranking, concise daily navigation and Pages subpath');
    await p.locator('#search-input').fill('금융투자'); assert.ok(await p.locator('.reg-row').count() > 0);
    await p.locator('#search-input').fill('zzzz-no-match'); assert.equal(await p.locator('.reg-row').count(), 0);
    await p.locator('#search-input').fill('');
    for (const selector of ['#category-tabs [data-category="입법예고"]', '#law-filters [data-law="자본시장"]']) {
      await p.locator(selector).click(); assert.ok(await p.locator('.reg-row').count() > 0); await p.locator(selector).click();
    }
    assert.equal(await p.locator('#scope-select option').count(), 14);
    for (const value of ['asset','aml','all']) await p.locator('#scope-select').selectOption(value);
    passed.push('search, filters and work views');
    await p.locator('#priority-list [data-action="ai-detail"]').first().click();
    assert.equal(await p.locator('#ai-detail-section .brief-section').count(),4);
    assert.ok(await p.locator('#detail-title').evaluate(n=>n.getBoundingClientRect().top>=0));
    assert.equal(await p.locator('.ai-questions input').count(),3);
    assert.doesNotMatch(await p.locator('#detail-content').innerText(), /RULE ANALYSIS|AI ANALYSIS|confidence|metadata_only|content_based|Priority Score/);
    assert.equal(await p.locator('#detail-content .ai-score, #detail-content meter').count(),0);
    assert.equal(await p.locator('.brief-cta a').count(),1);
    assert.equal(await p.locator('.brief-cta .gemini-button').count(),1);
    await p.screenshot({ path: `${out}/detail.png` });
    const read = p.locator('#detail-content [data-action="read"]');
    await read.click(); assert.equal(await read.getAttribute('aria-pressed'), 'true');
    assert.ok(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('financial-tracker:ui-v2:reviews:v1'))).length > 0));
    await read.click(); await p.locator('#close-detail').click();
    await p.locator('#show-priority').click(); assert.ok(await p.locator('.reg-row').count() > 0);
    await p.locator('#reset-filters').click(); await p.locator('#show-calendar').click(); assert.ok(await p.locator('#calendar-view').isVisible());
    await p.locator('#workspace-nav [data-workspace="all"]').click();
    await p.locator('#bulk-review-open').click(); await p.locator('#bulk-review-confirm').click();
    assert.equal(await p.locator('.ai-priority-row').count(), 0);
    assert.equal(await p.locator('#ai-daily-summary').innerText(),'오늘 우선 확인할 규제가 없습니다.');
    await p.locator('#bulk-review-undo').click(); assert.equal(await p.locator('.ai-priority-row').count(), 3);
    passed.push('details, persistent reviews, calendar and bulk undo');
    await p.screenshot({ path: `${out}/desktop.png` });
    await p.setViewportSize({ width: 390, height: 844 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.screenshot({ path: `${out}/mobile.png` });
    await p.locator('#ai-daily-top [data-action="ai-detail"]').first().click();
    assert.ok(await p.evaluate(() => document.querySelector('#detail-dialog').getBoundingClientRect().width <= innerWidth));
    await p.screenshot({ path: `${out}/mobile-detail.png` }); passed.push('mobile and drawer');
    const endpoint = 'https://worker.example/analyze'; let calls = 0;
    const ai = await page({ endpoint, enabled: true, timeoutMs: 2000 });
    await ai.route(endpoint, async route => {
      calls++; const body = route.request().postDataJSON();  assert.equal(body.work_view, 'all');
      await new Promise(resolve => setTimeout(resolve, 100));
      const analysis=A.buildFallbackAIAnalysis(body.regulation);
      if(body.regulation.source==='KOFIA'){
        const source_document={id:body.regulation.id,title:body.regulation.title,published_date:body.regulation.published_date,content:'브라우저 테스트용 본문입니다. 투자광고 사후 확인 절차가 자산운용사의 광고 심사 업무에 미치는 영향을 검토합니다. '.repeat(3),content_hash:'b'.repeat(64),source_url:'https://law.kofia.or.kr/service/revisionNotice/revisionNoticeView.do',kind:'notice_body',retrieved_at:new Date().toISOString(),truncated:false,attachments_included:false};
        await route.fulfill({json:{analysis:{...analysis,analysis_level:'content_based',confidence:65},source_document}});
      }else await route.fulfill({json:analysis});
    });
    await ai.goto(base); assert.equal(calls, 0);
    await ai.locator('#priority-list [data-action="ai-detail"]').first().click();
    await ai.waitForFunction(() => {
      const id=document.querySelector('#detail-content [data-action="read"]').dataset.id;
      return Object.keys(localStorage).some(k=>k.startsWith('regwatch_ai_v2_'+encodeURIComponent(id)));
    });
    assert.equal(calls,1);
    const analyzedId=await ai.locator('#detail-content [data-action="read"]').getAttribute('data-id');
    await ai.locator('#close-detail').click();
    await ai.locator('#scope-select').selectOption('aml');assert.equal(calls,1);
    await ai.reload();await ai.locator('.ai-priority-row').first().waitFor();
    await ai.evaluate(id=>{const button=document.createElement('button');button.dataset.action='ai-detail';button.dataset.id=id;document.body.append(button);button.click();button.remove();},analyzedId);
    await ai.waitForTimeout(250);assert.equal(calls,1);
    assert.equal(await ai.locator('#ai-detail-section .brief-section').count(),4);
    const stored=await ai.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('regwatch_ai_v2_'+encodeURIComponent(id))).map(k=>JSON.parse(localStorage.getItem(k))).find(v=>v.sourceDocument),analyzedId);
    if(analyzedId.startsWith('kofia_')){assert.ok(stored);assert.match(stored.sourceDocument.content,/투자광고 사후 확인/);}
    passed.push('mock AI cache and verified source retained internally; compact display after reload');
    await ai.locator('#close-detail').click();
    await ai.evaluate(()=>{const b=document.createElement('button');b.dataset.action='ai-detail';b.dataset.id='kofia_notice_156';document.body.append(b);b.click();b.remove();});
    await ai.waitForFunction(()=>Object.keys(localStorage).filter(k=>k.startsWith('regwatch_ai_v2_kofia_notice_156')).some(k=>JSON.parse(localStorage.getItem(k)).sourceDocument));
    const evidence=await ai.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('regwatch_ai_v2_kofia_notice_156')).map(k=>JSON.parse(localStorage.getItem(k))).find(v=>v.sourceDocument));
    assert.match(evidence.sourceDocument.content,/투자광고 사후 확인/);
    assert.equal(await ai.locator('.ai-source-evidence').count(),0);
    passed.push('KOFIA source evidence preserved in cache without verbose detail UI');
    const failure = await page({ endpoint, enabled: true });
    await failure.route(endpoint, r => r.fulfill({ status: 429, json: { ai_available: false } }));
    await failure.goto(base);
    const before = await failure.locator('#priority-list [data-action="ai-detail"]').evaluateAll(nodes => nodes.map(n => n.dataset.id));
    await failure.locator('#priority-list [data-action="ai-detail"]').first().click();
    await failure.waitForTimeout(200);
    assert.equal(await failure.locator('#ai-detail-section .brief-section').count(),4);
    assert.deepEqual(await failure.locator('#priority-list [data-action="ai-detail"]').evaluateAll(nodes => nodes.map(n => n.dataset.id)), before);
    passed.push('429 preserves original rule order');
    const blocked = await page();
    await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw Error('blocked storage'); } }); });
    await blocked.goto(base); await blocked.locator('.ai-priority-row').first().waitFor();
    passed.push('storage-disabled fallback');
    assert.deepEqual(errors, []); assert.deepEqual(badAssets, []);
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ passed, errors, badAssets }, null, 2));
    console.log(JSON.stringify({ passed, errors, badAssets }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
