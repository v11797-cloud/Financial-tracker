// Uses an isolated profile and fixtures, never the user's notes or review history.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Core=require('../app.js'),KEY='regwatch_workspace_v1',today=Core.kstToday();
const fixtures=Array.from({length:5},(_,n)=>({id:`memo-rule-${n}`,title:['금융소비자보호 감독규정 개정','금융투자업규정 개정','지배구조 감독규정 개정','자본시장법 개정','내부통제 규정 개정'][n],category:'공포법령',date:today,enf_date:today,dept:'금융위원회',url:`https://example.com/rule/${n}`}));
const out=path.resolve('../../work/my-workspace');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if((r.postData()||'').includes('PRIVATE_NOTE_MARKER')||r.url().includes('PRIVATE_NOTE_MARKER'))requests.push(r.url());});
 await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 await p.route('**/data/regulatory_data.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.regulatoryData=${JSON.stringify(fixtures)};window.lastUpdated='${today} 08:00 KST';`}));
 await p.route('**/data/kofia_data.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.kofiaData={schema_version:1,source:"KOFIA",items:[]};'}));
 const saved=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY),settle=()=>p.getByText('자동 저장됨',{exact:true}).waitFor();
 const note=()=>p.locator('.ws-block').filter({has:p.locator('.ws-note-title')});
 const body=()=>note().first().getByRole('textbox',{name:'자유 메모 내용',exact:true});
 const insert=async name=>{await note().first().locator('.ws-memo-insert-menu > summary').click();await note().first().locator('.ws-memo-insert-menu').getByRole('button',{name,exact:true}).click();};
 const connect=async title=>{await note().first().getByRole('button',{name:'메모 상단에 우선검토 규제 링크 추가',exact:true}).click();await p.locator('#workspace-reg-search').fill(title);await p.locator('.ws-picker-row button').click();};
 const manage=async(index,name)=>{const n=p.locator('.ws-block').nth(index);await n.locator('.ws-block-bar summary').click();await n.getByRole('button',{name,exact:true}).click();};
 await p.goto('http://127.0.0.1:8765/Financial-tracker/ui-v2/');
 // One-click creation, optional title, body text, no type picker or default sample data.
 assert.equal(await note().count(),1);assert.equal(await p.locator('#workspace-add-menu').count(),0);assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),null);
 await p.locator('#workspace-add').click();assert.equal(await note().count(),2);assert.equal(await note().last().locator('.ws-note-title').evaluate(n=>n===document.activeElement),true);
 await note().last().locator('.ws-note-title').fill('自由なメモ <script>');await manage(1,'자유 메모 블록 삭제');await p.locator('#workspace-undo').click();assert.equal(await note().last().locator('.ws-note-title').inputValue(),'自由なメモ <script>');await manage(1,'자유 메모 블록 삭제');
 const title=note().first().getByRole('textbox',{name:'메모 제목',exact:true});await title.fill('금융소비자보호 · 이번 주 검토');
 await body().fill('PRIVATE_NOTE_MARKER\n개정 내용과 당사 적용 대상을 함께 검토합니다.');await settle();
 await connect(fixtures[0].title);await connect(fixtures[1].title);
 assert.equal(await note().first().locator('.ws-note-regulations .ws-inline-reg').count(),2);
 assert.equal(await body().locator('.ws-inline-reg').count(),0);assert.equal(await title.inputValue(),'금융소비자보호 · 이번 주 검토');
 await note().first().getByRole('button',{name:'메모 상단에 우선검토 규제 링크 추가',exact:true}).click();await p.locator('#workspace-reg-search').fill(fixtures[0].title);assert.equal(await p.locator('.ws-picker-row button').isDisabled(),true);await p.locator('#workspace-picker-close').click();
 await note().first().locator('.ws-note-regulations .ws-inline-reg-title').first().click();assert.equal(await p.locator('#detail-dialog').evaluate(n=>n.open),true);await p.locator('#close-detail').click();assert.equal(await note().first().locator('.ws-note-regulations a').first().getAttribute('href'),fixtures[0].url);
 // Mixed body: text, editable checklist with independent completion/drafts and following text.
 await body().click();await p.keyboard.press('Control+End');await insert('체크리스트');
 const checklist=note().first().locator('.ws-inline-checklist').first(),draft=checklist.getByRole('textbox',{name:'본문 추가할 할 일',exact:true});
 await draft.fill('내규 변경 필요 여부 확인');await p.keyboard.press('Enter');await draft.fill('관련 부서 의견 취합');await checklist.getByRole('button',{name:'+ 항목 추가',exact:true}).click();
 await checklist.getByRole('checkbox',{name:'본문 할 일 완료',exact:true}).first().check();
 await checklist.getByRole('textbox',{name:'본문 할 일 내용',exact:true}).last().fill('관련 부서 의견 취합\n후속 회의 준비');
 await draft.fill('작성 중인 다음 할 일');await p.keyboard.press('Shift+Enter');await p.keyboard.type('이어 작성');
 assert.equal(await draft.inputValue(),'작성 중인 다음 할 일\n이어 작성');await settle();
 let data=await saved();assert.equal(data.blocks.length,1);assert.equal(data.blocks[0].regulations.length,2);assert.match(data.blocks[0].content,/☑ 내규 변경 필요 여부 확인/);assert.match(await p.locator('#workspace-summary').innerText(),/2건 중 1건 완료/);
 await p.reload();assert.equal(await title.inputValue(),'금융소비자보호 · 이번 주 검토');assert.equal(await checklist.getByRole('checkbox').first().isChecked(),true);assert.equal(await draft.inputValue(),'작성 중인 다음 할 일\n이어 작성');
 // Body selection formatting must leave embedded controls intact.
 await body().evaluate(root=>{const range=document.createRange();range.selectNodeContents(root);getSelection().removeAllRanges();getSelection().addRange(range);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
 await note().first().getByLabel('메모 글자 크기',{exact:true}).selectOption('16');await settle();await p.reload();assert.equal(await checklist.getByRole('checkbox').first().isChecked(),true);assert.equal(await draft.inputValue(),'작성 중인 다음 할 일\n이어 작성');
 // Native continuation after the checklist and inserting further content never replaces earlier text.
 await body().evaluate(root=>{root.focus();const tail=root.lastChild,range=document.createRange();range.selectNodeContents(tail);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
 await p.keyboard.type('추가 의견');await insert('구분선');await p.keyboard.type('다음 회의에서 확인');await settle();assert.match((await saved()).blocks[0].content,/추가 의견/);
 await checklist.getByRole('button',{name:'본문 할 일 삭제',exact:true}).last().click();assert.equal(await checklist.getByRole('checkbox').count(),1);
  await body().evaluate(root=>{root.focus();const range=document.createRange();range.selectNodeContents(root);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
  await insert('체크리스트');assert.equal(await body().locator('.ws-inline-checklist').count(),2);
  await body().locator('.ws-inline-checklist').last().getByRole('button',{name:'본문 체크리스트 삭제',exact:true}).click();assert.equal(await body().locator('.ws-inline-checklist').count(),1);assert.match((await body().innerText()),/추가 의견/);
 await draft.fill('');await settle();await p.locator('#my-workspace').screenshot({path:path.join(out,'unified-memo-desktop.png')});
 // Notes remain separate and reorderable, direct priority links target the active memo header.
 await p.locator('#workspace-add').click();await note().last().locator('.ws-note-title').fill('제목만 있는 별도 메모');
 await p.locator('#priority-list [data-action="workspace-link"][data-id="memo-rule-2"]').click();assert.equal(await note().last().locator('.ws-note-regulations .ws-inline-reg').count(),1);
 await manage(1,'자유 메모 위로 이동');await settle();assert.equal((await saved()).blocks[0].title,'제목만 있는 별도 메모');await manage(0,'자유 메모 아래로 이동');
 // Deletion + relink + undo keeps the old note content and unique regulation references.
 await manage(0,'자유 메모 블록 삭제');await p.locator('#priority-list [data-action="workspace-link"][data-id="memo-rule-0"]').click();await p.locator('#workspace-undo').click();await settle();await p.reload();assert.equal(await note().count(),2);assert.equal(await p.locator('.ws-note-regulations [data-ws-reference]').count(),3);assert.match((await saved()).blocks[0].content,/PRIVATE_NOTE_MARKER/);
 // Clear/export/import protection, invalid imports, quota failure and keyboard/mobile.
 const reviewBefore=await p.evaluate(()=>['financial-tracker:ui-v2:reviews:v1','regwatch_priority_excluded_v1','regwatch_priority_added_v1'].map(k=>localStorage.getItem(k)));
 await p.locator('#workspace-more-menu > summary').click();const downloadEvent=p.waitForEvent('download');await p.locator('#workspace-export').click();const download=await downloadEvent,backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 await p.locator('#workspace-import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});await p.getByText(/가져오기 실패/).waitFor();assert.deepEqual((await saved()).blocks,backup.blocks);
 await p.locator('#workspace-more-menu > summary').click();await p.locator('#workspace-clear').click();await p.locator('#workspace-confirm-cancel').click();assert.deepEqual((await saved()).blocks,backup.blocks);
 await p.locator('#workspace-more-menu > summary').click();await p.locator('#workspace-clear').click();await p.locator('#workspace-confirm-apply').click();assert.equal(await note().count(),0);
 const file={name:'notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};await p.locator('#workspace-import-file').setInputFiles(file);await p.locator('#workspace-confirm-apply').click();await settle();assert.deepEqual((await saved()).blocks,backup.blocks);
 await p.evaluate(key=>{const old=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=old;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('full','QuotaExceededError');return old.call(this,k,v);};},KEY);
 await title.fill('저장 실패에도 유지할 제목');await p.getByText(/저장 실패 · 브라우저 저장 공간/).waitFor();assert.equal(await title.inputValue(),'저장 실패에도 유지할 제목');await p.evaluate(()=>restoreStorage());await p.locator('#workspace-retry').click();await settle();
 assert.deepEqual(await p.evaluate(()=>['financial-tracker:ui-v2:reviews:v1','regwatch_priority_excluded_v1','regwatch_priority_added_v1'].map(k=>localStorage.getItem(k))),reviewBefore);
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#my-workspace').screenshot({path:path.join(out,'unified-memo-mobile.png')});
 await p.locator('#workspace-toggle').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#workspace-body').isVisible(),false);await p.keyboard.press('Enter');await p.locator('#workspace-add').focus();await p.keyboard.press('Enter');await p.keyboard.type('Keyboard memo');assert.equal(await note().last().locator('.ws-note-title').inputValue(),'Keyboard memo');
 // Import old standalone blocks unchanged; legacy content is editable without forced migration.
 const legacy={version:1,collapsed:false,updatedAt:null,blocks:[{id:'old-note',type:'text',content:'기존 메모 유지'},{id:'old-heading',type:'heading',content:'기존 소제목'},{id:'old-list',type:'checklist',items:[{id:'old-task',text:'기존 할 일',completed:true}],draft:'미완성 입력'},{id:'old-rule',type:'regulation',regulation:{id:'old-r',title:'기존 규제',institution:'금융위',date:'2025-01-01',url:'https://example.com/old'},content:'기존 규제 메모'}]};
 await p.locator('#workspace-import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await p.locator('#workspace-confirm-apply').click();await settle();await p.reload();assert.equal(await p.locator('.ws-block').count(),4);assert.equal(await p.getByRole('textbox',{name:'관련 규제 메모',exact:true}).inputValue(),'기존 규제 메모');assert.equal(await p.getByRole('checkbox',{name:'할 일 완료',exact:true}).isChecked(),true);assert.equal(await body().innerText(),'기존 메모 유지');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log('PASS one-click notes, free title/multiple header links, mixed editable checklist, completion/draft/reload, formatting, continuation, dedup/undo, backup/restore, failure recovery, keyboard/mobile, legacy compatibility and no note transmission.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
