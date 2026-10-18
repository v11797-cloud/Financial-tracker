const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 await p.goto('http://127.0.0.1:8765/Financial-tracker/ui-v2/');
 const show=()=>p.evaluate(()=>RegWatchGemini.renderGeminiPromptPreview(RegWatchGemini.buildGeminiRegulationPrompt({id:'setting-test',title:'규정 검토',url:'https://example.com/rule'})));
 await show();const input=p.getByRole('textbox',{name:'회사 Gemini Agent 주소',exact:true}),save=p.getByRole('button',{name:'Agent 주소 저장',exact:true});
 assert.equal(await p.locator('.gemini-agent-settings').evaluate(n=>n.open),true);assert.equal(await p.locator('.gemini-setup-steps li').count(),4);assert.equal(await p.locator('#gemini-preview code').count(),0);
 const before=await p.evaluate(()=>['regwatch_workspace_v1','regwatch_gemini_analyses_v1','financial-tracker:ui-v2:reviews:v1'].map(k=>localStorage.getItem(k)));
 await save.click();assert.match(await p.locator('#gemini-agent-status').innerText(),/먼저 붙여넣으세요/);
 for(const invalid of ['javascript:alert(1)','https://user:password@company.example/agent']){await input.fill(invalid);await save.click();assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await p.evaluate(()=>localStorage.getItem('regwatch_gemini_agent_url')),null);}
 await input.fill(' https://company.example/agent?view=regwatch ');await save.click();assert.match(await p.locator('#gemini-agent-status').innerText(),/저장했습니다/);assert.equal(await input.getAttribute('aria-invalid'),null);assert.equal(await p.locator('[data-open]').getAttribute('href'),'https://company.example/agent?view=regwatch');
 assert.deepEqual(await p.evaluate(()=>['regwatch_workspace_v1','regwatch_gemini_analyses_v1','financial-tracker:ui-v2:reviews:v1'].map(k=>localStorage.getItem(k))),before);
 await p.reload();await show();assert.equal(await p.locator('.gemini-agent-settings').evaluate(n=>n.open),false);await p.locator('.gemini-agent-settings > summary').click();assert.equal(await input.inputValue(),'https://company.example/agent?view=regwatch');
 await p.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='regwatch_gemini_agent_url')throw new DOMException('full','QuotaExceededError');return original.call(this,k,v);};});await input.fill('https://company.example/other-agent');await save.click();assert.match(await p.locator('#gemini-agent-status').innerText(),/저장하지 못했습니다/);assert.equal(await p.locator('[data-open]').getAttribute('href'),'https://company.example/other-agent');assert.equal(await p.evaluate(()=>localStorage.getItem('regwatch_gemini_agent_url')),'https://company.example/agent?view=regwatch');await p.evaluate(()=>restoreStorage());
 await save.click();assert.match(await p.locator('#gemini-agent-status').innerText(),/저장했습니다/);
 const out=path.resolve('../../work/gemini-settings');fs.mkdirSync(out,{recursive:true});await p.locator('.gemini-agent-settings').screenshot({path:path.join(out,'settings-desktop.png')});
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('.gemini-agent-settings').screenshot({path:path.join(out,'settings-mobile.png')});
 assert.deepEqual(errors,[]);console.log('PASS beginner guide, automatic first-time setup, validated URL form, storage/reload, active link update, storage-failure guidance, unrelated notes unchanged and mobile.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
