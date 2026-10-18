const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const KEY='regwatch_workspace_v1',today=require('../app.js').kstToday();
const first={id:'remove-rule-1',title:'금융소비자보호 감독규정',institution:'금융위원회',date:today,url:'https://example.com/rule/1'};
const second={...first,id:'remove-rule-2',title:'금융투자업규정',url:'https://example.com/rule/2'};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://api.github.com/**',r=>r.fulfill({json:{workflow_runs:[]}}));
 await p.route('**/data/regulatory_data.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.regulatoryData=${JSON.stringify([first,second].map(r=>({...r,dept:r.institution,category:'공포법령',enf_date:today})))};window.lastUpdated='${today} 08:00 KST';`}));
 await p.route('**/data/kofia_data.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.kofiaData={schema_version:1,source:"KOFIA",items:[]};'}));
 await p.goto('http://127.0.0.1:8765/Financial-tracker/ui-v2/');
 const editor=p.getByRole('textbox',{name:'자유 메모 내용',exact:true});
 const saved=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
 const seed=async children=>{await p.evaluate(({key,children})=>localStorage.setItem(key,JSON.stringify({version:1,collapsed:false,updatedAt:null,blocks:[{id:'delete-memo',type:'text',title:'유지할 제목',regulations:[],content:'',format:{version:1,children}}]})),{key:KEY,children});await p.reload();};
 const remove=()=>editor.getByRole('button',{name:`${first.title} 메모에서 규제 링크 삭제`,exact:true});
 // Newly inserted, without reload or a prior text selection.
 await editor.fill('앞 문장');await p.getByRole('button',{name:'메모 안에 규제 링크 추가',exact:true}).click();await p.locator('#workspace-reg-search').fill(first.title);await p.locator('.ws-picker-row button').click();
 await remove().click();assert.equal(await editor.locator('[data-ws-reference]').count(),0,'fresh insertion must be removable');
 await p.getByText('자동 저장됨',{exact:true}).waitFor();assert.match((await saved()).blocks[0].content,/앞 문장/);
 const scenarios=[
  ['plain text',[{text:'앞 문장'},{regulation:first},{text:'뒤 문장'}]],
  ['formatted heading',[{tag:'h3',children:[{text:'앞 문장'},{regulation:first},{text:'뒤 문장'}]}]],
  ['adjacent links and checklist',[{text:'앞 문장'},{regulation:first},{regulation:second},{checklist:{items:[{id:'task-1',text:'유지할 할 일',completed:true}],draft:'작성 중'}},{text:'뒤 문장'}]],
  ['only link',[{regulation:first}]]
 ];
 for(const [name,children] of scenarios){
  await seed(children);const before=await saved();
  await remove().click();assert.equal(await editor.locator('[data-ws-reference]').filter({hasText:first.title}).count(),0,`${name}: only the clicked link is removed`);
  await p.getByText('자동 저장됨',{exact:true}).waitFor();const data=await saved();assert.equal(data.blocks[0].title,'유지할 제목');
  if(name!=='only link'){assert.match(data.blocks[0].content,/앞 문장/);assert.match(data.blocks[0].content,/뒤 문장/);}
  if(name==='adjacent links and checklist'){assert.equal(await editor.locator('[data-ws-reference]').count(),1);assert.equal(await editor.getByRole('checkbox').isChecked(),true);assert.equal(data.blocks[0].format.children.find(n=>n.checklist).checklist.draft,'작성 중');}
  assert.notDeepEqual(data.blocks,before.blocks);await p.reload();assert.equal(await editor.locator('[data-ws-reference]').filter({hasText:first.title}).count(),0,`${name}: deletion persists`);
 }
 // Keyboard activation and mobile taps also delete while preserving neighboring text.
 await seed([{text:'앞 문장'},{regulation:first},{text:'뒤 문장'}]);await remove().focus();await p.keyboard.press('Enter');assert.equal(await editor.locator('[data-ws-reference]').count(),0);await p.getByText('자동 저장됨',{exact:true}).waitFor();
 await seed([{text:'앞 문장'},{regulation:first},{text:'뒤 문장'}]);await p.setViewportSize({width:390,height:844});await remove().click();assert.equal(await editor.locator('[data-ws-reference]').count(),0);
 await p.keyboard.type('이어서 작성');await p.getByText('자동 저장됨',{exact:true}).waitFor();assert.match((await saved()).blocks[0].content,/이어서 작성/);
 assert.deepEqual(errors,[]);console.log('PASS body regulation deletion after insertion/reload, formatted heading, adjacent links/checklist, sole link, keyboard/mobile, continued writing and saved deletion.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
