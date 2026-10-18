// Isolated profile: link all priority candidates without altering priority or review state.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Core=require('../app.js'),today=Core.kstToday(),KEY='regwatch_workspace_v1';
const rules=Array.from({length:6},(_,n)=>({id:`ws-priority-${n}`,title:`자본시장 내부통제 규정 개정 ${n+1}`,date:today,enf_date:today,category:'공포법령',dept:'금융위원회',url:`https://example.com/${n}`}));
const manual={id:'ws-manual',title:'직접 추가한 자산운용 자료',date:'2000-01-01',category:'보도자료',dept:'금융위원회',url:'https://example.com/manual'};
const ordinary={...manual,id:'ws-ordinary',title:'일반 모니터링 자료'};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 await p.route('**/data/regulatory_data.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.regulatoryData=${JSON.stringify([...rules,manual,ordinary])};window.lastUpdated='${today} 08:00 KST';`}));
 await p.route('**/data/kofia_data.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.kofiaData={schema_version:1,source:"KOFIA",items:[]};'}));
 await p.addInitScript(()=>{localStorage.setItem('regwatch_priority_added_v1','["ws-manual"]');localStorage.setItem('regwatch_priority_excluded_v1','["ws-priority-0"]');});
 await p.goto('http://127.0.0.1:8765/Financial-tracker/ui-v2/');
 const snapshot=()=>p.evaluate(()=>['regwatch_priority_added_v1','regwatch_priority_excluded_v1','financial-tracker:ui-v2:reviews:v1'].map(k=>localStorage.getItem(k)));
 const before=await snapshot(),editor=p.getByRole('textbox',{name:'자유 메모 내용',exact:true});await editor.fill('기존 검토 메모');
 await p.getByRole('button',{name:'메모 안에 규제 링크 추가',exact:true}).click();
 assert.equal(await p.locator('[data-ws-source="priority"]').getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('.ws-picker-row').count(),6);assert.match(await p.locator('#workspace-reg-count').innerText(),/전체 후보 6건/);
 assert.equal(await p.locator('.ws-picker-row').filter({hasText:rules[0].title}).count(),0);
 assert.equal(await p.locator('.ws-picker-row').filter({hasText:manual.title}).count(),1);
 assert.equal(await p.locator('.ws-picker-row').filter({hasText:ordinary.title}).count(),0);
 await p.locator('[data-ws-source="all"]').click();await p.locator('#workspace-reg-search').fill(ordinary.title);assert.equal(await p.locator('.ws-picker-row').count(),1);
 await p.locator('#workspace-picker-close').click();await p.getByRole('button',{name:'메모 안에 규제 링크 추가',exact:true}).click();
 assert.equal(await p.locator('[data-ws-source="priority"]').getAttribute('aria-pressed'),'true');
 // Candidate beyond the visible top three is available and inserted at the memo caret.
 const visible=await p.locator('#priority-list .priority-summary').evaluateAll(ns=>ns.map(n=>n.dataset.id));
 const hidden=rules.find(r=>r.id!==rules[0].id&&!visible.includes(r.id));assert.ok(hidden);
 await p.locator('#workspace-reg-search').fill(hidden.title);await p.locator('.ws-picker-row button').click();assert.equal(await editor.locator('.ws-inline-reg').count(),1);
 await p.keyboard.type('후속 검토');await p.getByText('자동 저장됨',{exact:true}).waitFor();
 // Direct rail link targets the last edited memo; clicking twice does not duplicate it.
 await p.locator('#workspace-add').click();
 const second=p.getByRole('textbox',{name:'자유 메모 내용',exact:true}).last();await second.fill('담당자 검토');
 const rail=p.locator('#priority-list [data-action="workspace-link"]').first(),id=await rail.getAttribute('data-id');await rail.click();assert.equal(await second.locator('xpath=ancestor::section[contains(@class,"ws-block")]').locator('.ws-note-regulations .ws-inline-reg').count(),1);
 await rail.click();assert.equal(await p.locator('.ws-inline-reg').count(),2);
 await p.locator('#workspace-toggle').click();await p.locator('#priority-list [data-action="workspace-link"][data-id="ws-manual"]').click();assert.equal(await p.locator('#workspace-body').isVisible(),true);assert.equal(await second.locator('xpath=ancestor::section[contains(@class,"ws-block")]').locator('.ws-note-regulations .ws-inline-reg').count(),2);
 await p.getByText('자동 저장됨',{exact:true}).waitFor();await p.reload();assert.equal(await p.locator('.ws-inline-reg').count(),3);assert.deepEqual(await snapshot(),before);
 await p.screenshot({path:path.resolve('../../work/my-workspace/priority-links-desktop.png')});
 await p.getByRole('button',{name:'메모 안에 규제 링크 추가',exact:true}).first().click();await p.locator('#workspace-picker').screenshot({path:path.resolve('../../work/my-workspace/priority-picker.png')});
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#workspace-picker-close').click();
 // Empty Workspace creates a free memo when linking directly.
 await p.evaluate(k=>{localStorage.setItem(k,JSON.stringify({version:1,collapsed:true,updatedAt:null,blocks:[]}));},KEY);await p.reload();await p.locator(`#priority-list [data-action="workspace-link"][data-id="${id}"]`).click();
 assert.equal(await p.getByRole('textbox',{name:'자유 메모 내용',exact:true}).count(),1);assert.equal(await p.locator('.ws-inline-reg').count(),1);
 assert.deepEqual(await snapshot(),before);assert.deepEqual(errors,[]);
 console.log('PASS all priority candidates, manual/excluded handling, all-source search, reset, direct rail linking, last memo selection, dedup, collapse, reload, empty workspace, mobile and independent review/priority state.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
