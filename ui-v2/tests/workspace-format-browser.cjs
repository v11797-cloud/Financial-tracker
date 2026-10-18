const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.WORKSPACE_TEST_URL || 'http://127.0.0.1:8765/Financial-tracker/ui-v2/';
const out=path.resolve('../../work/my-workspace');
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true});try{
  const p=await b.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
  // Start from an actual v1 plain-text backup, not preformatted test-only markup.
  await p.addInitScript(()=>{if(!localStorage.getItem('regwatch_workspace_v1'))localStorage.setItem('regwatch_workspace_v1',JSON.stringify({version:1,collapsed:false,updatedAt:null,blocks:[{id:'old-memo',type:'text',content:'기존 메모\n내용 유지'}]}));});
  await p.goto(base);const editor=p.getByRole('textbox',{name:'자유 메모 내용',exact:true});assert.equal(await editor.innerText(),'기존 메모\n내용 유지');
  await editor.fill('첫 줄\n\n빈 줄 뒤 내용');await p.getByText('자동 저장됨',{exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('regwatch_workspace_v1')).blocks[0].content),'첫 줄\n\n빈 줄 뒤 내용');
  await p.reload();assert.equal(await editor.evaluate(root=>window.RegWatchWorkspaceFormat.plainText(window.RegWatchWorkspaceFormat.readDOM(root))),'첫 줄\n\n빈 줄 뒤 내용');
  await editor.fill('줄바꿈');await p.keyboard.press('End');await p.keyboard.press('Shift+Enter');
  await p.getByText('자동 저장됨',{exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('regwatch_workspace_v1')).blocks[0].content),'줄바꿈\n');
  await editor.fill('이번 주 검토사항\n당사 적용 대상 검토\n다음 회의에서 의견 정리');
  const selectText=async text=>editor.evaluate((root,text)=>{
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()) if(node.nodeValue.includes(text)) {
      const start=node.nodeValue.indexOf(text),range=document.createRange();range.setStart(node,start);range.setEnd(node,start+text.length);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return;
    }
    throw Error('Missing selected text');
  },text);
  await selectText('이번 주 검토사항');await p.getByLabel('메모 문단 스타일',{exact:true}).selectOption('h3');
  assert.equal(await editor.locator('h3').innerText(),'이번 주 검토사항');
  await selectText('당사 적용 대상 검토');await p.getByLabel('메모 글자 크기',{exact:true}).selectOption('24');
  assert.equal(await editor.locator('[style*="font-size: 24px"]').innerText(),'당사 적용 대상 검토');
  await p.getByRole('button',{name:'메모 굵게',exact:true}).click();assert.equal(await editor.locator('b,strong').innerText(),'당사 적용 대상 검토');
  await p.getByText('자동 저장됨',{exact:true}).waitFor();
  const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('regwatch_workspace_v1')));
  assert.equal(before.blocks.length,1);assert.equal(before.blocks[0].id,'old-memo');
  assert.equal(before.blocks[0].content,'이번 주 검토사항\n당사 적용 대상 검토\n다음 회의에서 의견 정리');
  await p.reload();assert.equal(await editor.locator('h3').innerText(),'이번 주 검토사항');
  assert.equal(await editor.locator('[style*="font-size: 24px"]').innerText(),'당사 적용 대상 검토');
  assert.equal(await editor.locator('strong').innerText(),'당사 적용 대상 검토');
  // Clipboard HTML is ignored; only the literal plain-text value is inserted.
  await editor.evaluate(root=>{
    root.focus();const range=document.createRange();range.selectNodeContents(root);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);
    root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
    const data=new DataTransfer();data.setData('text/plain','\n<script>window.wsRichXss=true</script>');data.setData('text/html','<img src="bad" onerror="window.wsRichXss=true">');
    root.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  });
  assert.equal(await editor.locator('script,img').count(),0);assert.equal(await p.evaluate(()=>window.wsRichXss),undefined);
  await p.getByText('자동 저장됨',{exact:true}).waitFor();
  await p.locator('#workspace-more-menu > summary').click();const event=p.waitForEvent('download');await p.locator('#workspace-export').click();const download=await event;
  const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.ok(backup.blocks[0].format);assert.match(backup.blocks[0].content,/<script>/);
  await p.locator('#workspace-import-file').setInputFiles({name:'formatted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await p.locator('#workspace-confirm-apply').click();await p.getByText('자동 저장됨',{exact:true}).waitFor();assert.equal(await editor.locator('h3').count(),1);
  await p.screenshot({path:path.join(out,'formatted-memo-desktop.png')});
  await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:path.join(out,'formatted-memo-mobile.png')});assert.deepEqual(errors,[]);
  console.log('PASS: legacy memo, inline heading, selected font size/bold, exact text preservation, autosave/reload, formatted backup/restore, plain-text paste, XSS and mobile.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
