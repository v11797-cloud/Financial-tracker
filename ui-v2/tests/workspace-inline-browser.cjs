const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base='http://127.0.0.1:8765/Financial-tracker/ui-v2/',out=path.resolve('../../work/my-workspace');
const today=require('../app.js').kstToday();
const KEY='regwatch_workspace_v1', item={id:'inline-test-1',title:'금융투자업규정 일부개정',date:today,enf_date:today,category:'공포법령',dept:'금융위원회',url:'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=101'};
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1050},acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 await p.route('**/data/regulatory_data.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.regulatoryData=${JSON.stringify([item])};window.lastUpdated='2026-10-16 08:00 KST';`}));
 await p.goto(base);const editor=p.getByRole('textbox',{name:'자유 메모 내용',exact:true});
 await editor.fill('검토 방향\n후속 조치');
 const caret=async(text,end=true)=>editor.evaluate((root,{text,end})=>{
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())if(n.nodeValue.includes(text)){
     const at=n.nodeValue.indexOf(text)+(end?text.length:0),r=document.createRange();r.setStart(n,at);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return;
   }throw Error('No caret text');
 },{text,end});
 await caret('검토 방향');await p.getByRole('button',{name:'메모 안에 규제 링크 추가',exact:true}).click();
 await p.locator('#workspace-reg-search').fill(item.title);await p.locator('.ws-picker-row button').click();
 assert.equal(await editor.locator('.ws-inline-reg').count(),1);assert.equal(await editor.evaluate(n=>document.activeElement===n),true);
 await p.keyboard.type('검토 메모: ');await p.getByText('자동 저장됨',{exact:true}).waitFor();
 let data=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);assert.equal(data.blocks.length,1);assert.equal(data.blocks.some(x=>x.type==='regulation'),false);
 assert.match(data.blocks[0].content,/검토 방향[\s\S]*금융투자업규정[\s\S]*검토 메모: [\s\S]*후속 조치/);
 await editor.locator('.ws-inline-reg-title').click();assert.equal(await p.locator('#detail-dialog').evaluate(n=>n.open),true);assert.equal(await p.locator('#detail-content .gemini-button').count(),1);await p.locator('#close-detail').click();
 assert.equal(await editor.locator('.ws-inline-reg a').getAttribute('href'),item.url);
 await p.locator('#regulation-list [data-action="workspace-add"][data-id="inline-test-1"]').click();await p.getByRole('button',{name:'메모 안에 규제 링크 추가',exact:true}).click();await p.locator('#workspace-reg-search').fill(item.title);assert.equal(await p.locator('.ws-picker-row button').isDisabled(),true);await p.locator('#workspace-picker-close').click();
 await p.reload();assert.equal(await editor.locator('.ws-inline-reg').count(),1);
 await caret('후속 조치');await p.locator('.ws-memo-insert-menu > summary').click();await p.locator('.ws-memo-insert-menu').getByRole('button',{name:'글머리 목록',exact:true}).click();assert.equal(await editor.locator('ul li').count(),1);
 await p.locator('.ws-memo-insert-menu > summary').click();await p.locator('.ws-memo-insert-menu').getByRole('button',{name:'구분선',exact:true}).click();assert.equal(await editor.locator('hr').count(),1);
 await editor.evaluate(root=>{const r=document.createRange();r.selectNodeContents(root);getSelection().removeAllRanges();getSelection().addRange(r);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
 await p.getByLabel('메모 글자 크기',{exact:true}).selectOption('16');
 await p.getByText('자동 저장됨',{exact:true}).waitFor();
 await p.reload();assert.equal(await editor.locator('.ws-inline-reg').count(),1);
 await p.screenshot({path:path.join(out,'inline-regulation-desktop.png')});
 await p.locator('#workspace-more-menu > summary').click();const downloadEvent=p.waitForEvent('download');await p.locator('#workspace-export').click();const download=await downloadEvent;const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 await p.locator('#workspace-import-file').setInputFiles({name:'inline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.locator('#workspace-confirm-apply').click();assert.equal(await editor.locator('.ws-inline-reg').count(),1);
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,'inline-regulation-mobile.png')});
 await editor.locator('.ws-inline-reg-remove').click();await p.getByText('자동 저장됨',{exact:true}).waitFor();assert.equal(await editor.locator('.ws-inline-reg').count(),0);data=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);assert.match(data.blocks[0].content,/검토 방향/);assert.match(data.blocks[0].content,/후속 조치/);
 assert.deepEqual(errors,[]);console.log('PASS inline insertion at caret, continued writing, emphasized rule, internal/original links, global dedup, list/divider, save/reload/backup/restore, removal and mobile.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
