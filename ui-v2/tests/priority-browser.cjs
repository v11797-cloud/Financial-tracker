const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const Core=require('../app.js');
const base='http://127.0.0.1:8765/Financial-tracker/ui-v2/';
const EK='regwatch_priority_excluded_v1',AK='regwatch_priority_added_v1';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 await ctx.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 const today=Core.kstToday(),future=new Date(Date.parse(today)+10*86400000).toISOString().slice(0,10);
 const fixtures=Array.from({length:15},(_,n)=>({id:`rule-${String(n).padStart(2,'0')}`,title:`내부통제 규정 개정 ${n}`,date:today,enf_date:future,category:'공포법령',dept:'금융위원회',url:'https://example.com/'+n}));
 const manual={id:'manual-X',title:'직접 선택하는 일반 자료 X',date:'2000-01-01',category:'보도자료',dept:'기타',url:'https://example.com/x'};
 const ko={schema_version:1,source:'KOFIA',items:[{id:'kofia_notice_999999',notice_seq:'999999',source:'KOFIA',title:'과거 예고',category:'입법예고',date:'2000-01-01',notice_end_date:'2000-01-02'}]};
 await ctx.route('**/data/regulatory_data.js',r=>r.fulfill({contentType:'application/javascript',body:`window.regulatoryData=${JSON.stringify([...fixtures,manual])};window.lastUpdated='${today} 08:00 KST';`}));
 await ctx.route('**/data/kofia_data.js',r=>r.fulfill({contentType:'application/javascript',body:`window.kofiaData=${JSON.stringify(ko)};`}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const rows=()=>p.locator('#priority-list .priority-summary').evaluateAll(ns=>ns.map(n=>n.dataset.id));
 const stored=key=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),key);
 const exclude=id=>p.locator(`#priority-list .priority-remove[data-id="${id}"]`).click();
 const toggle=id=>p.locator(`#regulation-list .priority-toggle[data-id="${id}"]`).click();
 const rank=()=>p.evaluate(()=>window.RegWatchPriority.getAutoPriorityCandidates().map(i=>i.id));
 const out=path.resolve('../verification/priority-exclusions');fs.mkdirSync(out,{recursive:true});
 try {
  await p.goto(base);await p.locator('.priority-summary').first().waitFor();const ranking=await rank(),initial=ranking.slice(0,3);assert.deepEqual(await rows(),initial);
  const b=initial[1];await exclude(b);assert.deepEqual(await rows(),[initial[0],initial[2],ranking[3]]);assert.equal(await p.locator('#detail-dialog').evaluate(d=>d.open),false);
  await p.getByRole('button',{name:'되돌리기',exact:true}).click();assert.deepEqual(await rows(),initial);
  await exclude(b);await p.reload();assert.ok(!(await rows()).includes(b));assert.deepEqual(await stored(EK),[b]);assert.equal((await rows()).length,3);
  // New leading rule candidate is discovered automatically despite saved exclusions.
  await p.evaluate(({today})=>window.applyCollectedData({items:[{id:'new-F',title:'자본시장 금융투자 내부통제 자금세탁 규정 개정',category:'공포법령',date:today,enf_date:today,dept:'금융위원회',url:'https://example.com/f'},...window.regulatoryData],updated:window.lastUpdated},window.kofiaData),{today});
  const newRanking=await rank();assert.equal(newRanking[0],'new-F');assert.deepEqual(await rows(),newRanking.filter(id=>id!==b).slice(0,3));
  await p.locator('#priority-excluded').click();assert.equal(await p.locator('.excluded-priority-row').count(),1);
  await p.locator(`[data-action="priority-restore"][data-id="${b}"]`).click();assert.deepEqual(await rows(),newRanking.slice(0,3));await p.locator('#priority-excluded-close').click();
  // Manual addition has its own slot; removing it does not add an exclusion when it is not automatic.
  await toggle('manual-X');assert.equal((await rows()).length,4);assert.equal((await rows()).at(-1),'manual-X');assert.deepEqual(await stored(AK),['manual-X']);
  assert.match(await p.locator('#ai-daily-summary').textContent(),/4건/);
  await toggle('manual-X');assert.deepEqual(await stored(AK),[]);assert.equal((await rows()).length,3);assert.ok(!(await stored(EK)).includes('manual-X'));
  await p.getByRole('button',{name:'되돌리기',exact:true}).click();assert.deepEqual(await stored(AK),['manual-X']);
  // Excluding a manual row retains its manual membership so restoring it works.
  await exclude('manual-X');assert.deepEqual(await stored(AK),['manual-X']);assert.ok((await stored(EK)).includes('manual-X'));
  await p.locator('#priority-excluded').click();await p.locator('[data-action="priority-restore"][data-id="manual-X"]').click();assert.equal((await rows()).at(-1),'manual-X');await p.locator('#priority-excluded-close').click();
  const a=(await rows())[0];await toggle(a);assert.ok((await stored(EK)).includes(a));await toggle(a);assert.ok(!(await stored(EK)).includes(a));assert.ok((await stored(AK)).includes(a));assert.equal((await rows()).filter(id=>id===a).length,1);
  await toggle(a);assert.ok(!(await stored(AK)).includes(a));assert.ok(!(await rows()).includes(a));
  // Detail toggle and reviewed state stay independent; Gemini control remains present.
  await p.locator('#priority-list .priority-summary[data-id="manual-X"]').click();const before={added:await stored(AK),excluded:await stored(EK)};
  await p.locator('#detail-content [data-action="read"]').click();assert.deepEqual(await stored(AK),before.added);assert.deepEqual(await stored(EK),before.excluded);assert.ok((await rows()).includes('manual-X'));
  assert.equal(await p.locator('#detail-content .gemini-button').count(),1);await p.locator('#detail-content .priority-toggle').click();assert.ok(!(await stored(AK)).includes('manual-X'));await p.locator('#close-detail').click();
  // Exhaust the complete ranking, including candidates beyond the original top ten.
  let count=0;while((await rows()).length){await p.locator('#priority-list .priority-remove').first().click();assert.ok(++count<=20);}
  assert.ok((await stored(EK)).length>10);assert.match(await p.locator('#priority-list').textContent(),/현재 표시할 우선검토 안건이 없습니다/);
  await p.reload();assert.deepEqual(await rows(),[]);await p.locator('#priority-excluded').click();
  assert.equal(await p.locator('.excluded-priority-row').count(),15); // new-F no longer exists after reloading fixtures
  await p.locator('#priority-restore-all').click();await p.locator('#priority-restore-cancel').click();assert.deepEqual(await rows(),[]);
  await p.locator('#priority-restore-all').click();await p.locator('#priority-restore-confirm').click();assert.deepEqual(await stored(EK),[]);assert.equal((await rows()).length,3);await p.locator('#priority-excluded-close').click();
  // Scope hides items without deleting saved state. Missing IDs are omitted from the excluded count.
  await toggle('manual-X');await exclude((await rows())[0]);const stable={a:await stored(AK),e:await stored(EK)};
  for(const scope of ['asset','aml','all']){await p.locator('#scope-select').selectOption(scope);assert.deepEqual(await stored(AK),stable.a);assert.deepEqual(await stored(EK),stable.e);}
  await p.evaluate(k=>localStorage.setItem(k,JSON.stringify([...JSON.parse(localStorage.getItem(k)),'missing-id'])),EK);await p.reload();assert.match(await p.locator('#priority-excluded').textContent(),/\(1\)/);
  await p.locator('#show-priority').click();assert.equal(await p.locator('.reg-row').count(),(await rows()).length);await p.locator('#reset-filters').click();
  await p.locator('#search-input').fill('zzzz-no-match');assert.equal(await p.locator('.reg-row').count(),0);await p.locator('#search-input').fill('');
  const reviewRecords=await p.evaluate(()=>localStorage.getItem('financial-tracker:ui-v2:reviews:v1'));assert.ok(reviewRecords.includes('manual-X'));
  // Keyboard restores are native buttons; mobile rail and excluded modal fit.
  await p.setViewportSize({width:390,height:844});await p.locator('#priority-list').scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:path.join(out,'mobile.png')});
  await p.locator('#priority-excluded').click();await p.screenshot({path:path.join(out,'excluded-mobile.png')});await p.locator('[data-action="priority-restore"]').first().focus();await p.keyboard.press('Enter');assert.equal(await p.locator('.excluded-priority-row').count(),0);await p.keyboard.press('Escape');
  const persisted=await ctx.storageState();const reopened=await browser.newContext({storageState:persisted});await reopened.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));const other=await reopened.newPage();await other.goto(base);assert.deepEqual(await other.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),AK),await stored(AK));await reopened.close();
  await p.setViewportSize({width:1440,height:1000});await p.locator('#priority-list').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'desktop.png')});
  assert.deepEqual(errors,[]);console.log('PASS: all 15 requested cases, slot backfill beyond 10, new highest auto, overlap toggle, manual/auto dedup, undo, persistence, missing ID count, restore/cancel/all, scope, read independence, detail/Gemini, priority feed, search, mobile and keyboard; zero console/page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
