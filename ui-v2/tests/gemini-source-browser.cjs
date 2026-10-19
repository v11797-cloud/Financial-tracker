// Isolated browser; mock popup and clipboard, never submit to a company Agent.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const items=[
 {id:'kofia_revision_1817',source:'KOFIA',source_group:'모범규준',classification_path:['모범규준','소비자보호'],title:'금융투자회사의 금융소비자보호 표준내부통제기준',category:'공포법령',date:'2026-10-15',law_seq:'346',history_seq:'1817',url:'https://law.kofia.or.kr/service/revision/revisionView.do?historySeq=1817'},
 {id:'no123',title:'검증용 보도자료',category:'보도자료',date:'2026-10-16',url:'https://www.fsc.go.kr/no010101/123'},
 {id:'kofia_revision_1816',source:'KOFIA',source_group:'모범규준',classification_path:['모범규준','내부통제'],title:'검증용 원문 수집 대기 규정',category:'공포법령',date:'2026-10-15',law_seq:'345',history_seq:'1816',url:'https://law.kofia.or.kr/service/revision/revisionView.do?historySeq=1816'}
];
const kofia={schema_version:1,source:'KOFIA',items:Object.fromEntries([items[0],items[2]].map((i,n)=>[i.id,{...Object.fromEntries(['id','title','date','law_seq','history_seq','source_group'].map(k=>[k,i[k]])),status:n?'pending':'ready',text:n?'':'광고 의사결정 과정에 소비자보호책임자(CCO)가 참여하도록 내부통제체계를 개선합니다.\n첨부파일의 뒤쪽 문단도 함께 전달합니다.',kind:'amendment_document',source_url:i.url,content_url:'https://law.kofia.or.kr/download.do?gubun=104&seq=1813',collected_at:'2026-10-19T01:00:00Z'}]))};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],outside=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8765/')&&!r.url().startsWith('https://api.github.com/'))outside.push(r.url());});
 await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 await p.route('**/data/regulatory_data.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.regulatoryData='+JSON.stringify([items[1]])+';'}));
 await p.route('**/data/kofia_data.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.kofiaData='+JSON.stringify({schema_version:1,source:'KOFIA',items:[items[0],items[2]]})+';'}));
 let release;const held=new Promise(r=>release=r);await p.route('**/data/kofia_summaries.json',async r=>{await held;await r.fulfill({json:kofia});});
 await p.route('**/data/press_summaries.json',r=>r.fulfill({json:{schema_version:1,items:{no123:{title:items[1].title,date:items[1].date,status:'ready',source_url:items[1].url,purpose:'보도자료의 확인된 핵심 발표입니다.',changes:'공식 발표의 세부 내용을 함께 검토합니다.'}}}}));
 await p.addInitScript(()=>{window.mockOrder=[];window.mockPrompts=[];window.open=()=>{mockOrder.push('open');return{opener:{},location:{replace(){}},close(){}};};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{mockOrder.push('copy');mockPrompts.push(t);}}});localStorage.setItem('regwatch_gemini_agent_url','https://company.example/agent');localStorage.setItem('regwatch_workspace_v1',JSON.stringify({version:1,collapsed:false,updatedAt:null,blocks:[{id:'note-1',type:'text',title:'비공개 제목',content:'PRIVATE_NOTE_DO_NOT_SEND',regulations:[]}]}));});
 await p.goto(process.env.BASE_URL||'http://127.0.0.1:8765/Financial-tracker/ui-v2/');
 const analyze=id=>p.locator(`#regulation-list [data-action="agent-analyze"][data-id="${id}"]`).click();
 await analyze(items[0].id);await p.getByText('분석에 사용할 원문 본문을 준비하고 있습니다…',{exact:true}).waitFor();
 // Switching while a source request is pending cannot overwrite the current selection.
 await analyze(items[1].id);await p.locator('#agent-source-status').filter({hasText:'공식 보도자료 본문 발췌'}).waitFor();
 release();await p.locator('#agent-prompt-preview > summary').click();await p.waitForFunction(()=>document.getElementById('agent-prompt').value.includes('보도자료의 확인된 핵심 발표'));
 assert.ok(!(await p.locator('#agent-prompt').inputValue()).includes('소비자보호책임자'));
 await analyze(items[0].id);await p.locator('#agent-source-status').filter({hasText:'공식 개정 첨부파일 발췌'}).waitFor();
 const preview=await p.locator('#agent-prompt').inputValue();assert.ok(preview.includes(kofia.items[items[0].id].text));assert.ok(preview.includes('seq=1813'));assert.ok(!preview.includes('PRIVATE_NOTE_DO_NOT_SEND'));
 await p.locator('#agent-analysis-type').selectOption('amendments');await p.waitForFunction(()=>document.getElementById('agent-prompt').value.includes('주요 개정내용 분석'));
 await p.locator('#agent-launch').click();await p.waitForFunction(()=>mockPrompts.length===1);assert.deepEqual(await p.evaluate(()=>mockOrder),['open','copy']);const copied=await p.evaluate(()=>mockPrompts[0]);assert.ok(copied.includes(kofia.items[items[0].id].text));assert.ok(copied.includes('외부 링크에 접근할 수 없다는 이유만으로 분석 전체를 중단'));assert.ok(!copied.includes('상세 본문이 제공되지 않았습니다'));assert.ok(!copied.includes('PRIVATE_NOTE_DO_NOT_SEND'));
 await analyze(items[2].id);await p.locator('#agent-source-status').filter({hasText:'수집 대기'}).waitFor();assert.match(await p.locator('#agent-prompt').inputValue(),/상세 본문이 제공되지 않았습니다/);assert.ok(!(await p.locator('#agent-prompt').inputValue()).includes('소비자보호책임자'));
 // Detail preview and low-level handoff share the resolver, even without opening Agent panel first.
 await p.locator('#agent-panel-close').click();await p.locator('#regulation-list [data-action="detail"][data-id="no123"]').click();await p.locator('.gemini-preview-toggle summary').click();await p.getByText('분석 Prompt 미리보기',{exact:true}).click();await p.waitForFunction(()=>document.getElementById('gemini-prompt').value.includes('보도자료의 확인된 핵심 발표'));
 assert.match(await p.locator('#gemini-prompt').inputValue(),/공식 보도자료 본문 발췌/);await p.locator('#gemini-preview [data-close]').first().click();await p.locator('#close-detail').click();
 await analyze(items[0].id);await p.locator('#agent-source-status').filter({hasText:'공식 개정 첨부파일 발췌'}).waitFor();const out=path.resolve('../../work/gemini-source');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,'desktop.png')});
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,'mobile.png')});assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 console.log('PASS real source in preview and copied prompt, provenance, popup/copy order, pending source, stale-selection race, detail preview, no private notes, no model requests, desktop/mobile.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
