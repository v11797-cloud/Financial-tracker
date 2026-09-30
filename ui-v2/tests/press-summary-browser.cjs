const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 await p.goto('http://127.0.0.1:8765/Financial-tracker/ui-v2/');
 for(const [id,search,expected] of [['no010101_87731','사업보고서','해태제과'],['fss_press_229066','금융상황 점검회의','금융시장']]){
  await p.locator('#search-input').fill(search);await p.locator(`[data-action="detail"][data-id="${id}"]`).click();
  await p.getByRole('heading',{name:'핵심 내용',exact:true}).waitFor();
  assert.ok((await p.locator('#notice-summary').innerText()).includes(expected));
  assert.equal(await p.locator('#ai-detail-section').isVisible(),false);
  assert.ok(!(await p.locator('#notice-summary').innerText()).includes('개정안입니다'));
  await p.setViewportSize({width:390,height:844});assert.ok(await p.locator('#notice-summary').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  await p.locator('#close-detail').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS FSC/FSS press source excerpts and mobile layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
