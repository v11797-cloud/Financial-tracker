const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8765/Financial-tracker/ui-v2/');
 await p.locator('#search-input').fill('금융투자업규정');
 const id='admrul_금융투자업규정_2026-38_2026-09-09';
 await p.locator(`[data-action="detail"][data-id="${id}"]`).click();
 await p.getByRole('heading',{name:'공포·시행법령 요약',exact:true}).waitFor();
 assert.match(await p.locator('#notice-summary').innerText(),/외국인 통합계좌/);
 assert.equal(await p.locator('#ai-detail-section').isVisible(),false);
 assert.match(await p.locator('#detail-content .brief-cta a').first().getAttribute('href'),/^https:\/\/www.law.go.kr/);
 await p.screenshot({path:'../../work/law-summary-preview.png'});
 await p.setViewportSize({width:390,height:844});assert.ok(await p.locator('#notice-summary').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
 await p.route('**/data/law_reasons.js',r=>r.fulfill({contentType:'application/javascript',body:'window.lawReasons={schema_version:1,items:{}};'}));
 await p.reload();await p.locator('#search-input').fill('금융투자업규정');await p.locator(`[data-action="detail"][data-id="${id}"]`).click();
 assert.match(await p.locator('#notice-summary').innerText(),/아직 공식 원문 요약/);assert.deepEqual(errors,[]);
 console.log('PASS law excerpt, official link, mobile layout and missing-source fallback');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
