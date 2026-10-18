const test=require('node:test'),assert=require('node:assert/strict');
const Agent=require('../regwatch-agent.js'),A=require('../gemini-analysis.js');
const item={id:'stable-01',title:'금융투자업규정 일부개정',dept:'금융위원회',category:'공포법령',date:'2026-10-16',enf_date:'2026-11-01',url:'https://example.com/rule',content:'공개된 원문 일부',userMemo:'PRIVATE_MEMO',apiKey:'SECRET_KEY',format:{secret:'PRIVATE_FORMAT'}};
test('all four Agent prompt types reuse export schema and include only public data',()=>{
 const expected={asset:'집합투자업·투자일임업',amendments:'신설·삭제·변경',controls:'AML/KYC',trends:'단일 안건만 제공'};
 const prompts=new Set();for(const type of Object.keys(Agent.analysisTypes)){
  const prompt=Agent.buildRegWatchAgentPrompt(item,type,'compliance');prompts.add(prompt);assert.ok(prompt.includes(expected[type]));assert.match(prompt,/stable-01/);assert.match(prompt,/2026-11-01/);assert.match(prompt,/준법감시/);assert.equal((prompt.match(/\[REGWATCH_EXPORT_V1\]/g)||[]).length,1);assert.ok(!/PRIVATE_|SECRET_KEY/.test(prompt));assert.equal(A.parseGeminiAnalysis(prompt).format,'structured');
 }assert.equal(prompts.size,4);assert.throws(()=>Agent.publicRegulation({title:'ID 없음'}));assert.equal(Object.hasOwn(Agent.publicRegulation(item),'userMemo'),false);
});
test('new request metadata and structured result survive storage/backups; legacy analyses remain valid',()=>{
 const values=new Map(),store=A.createStore({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}),parsed=A.parseGeminiAnalysis(Agent.buildRegWatchAgentPrompt(item,'controls'));
 const a=A.saveGeminiAnalysis(store,item,parsed,false,()=> '2026-10-16T01:00:00Z',{analysisType:'controls',requestId:'request-1'});
 assert.equal(a.analysisType,'controls');assert.equal(a.requestId,'request-1');assert.equal(a.source,'gemini_enterprise_manual');assert.equal(a.structuredResult.regulation_id,item.id);
 const restored=A.validateData(JSON.parse(values.get(A.KEY)));assert.deepEqual(restored.analyses[0],a);
 const old=structuredClone(a);for(const key of ['analysisType','requestId','source','structuredResult'])delete old[key];assert.equal(A.validateData({version:1,analyses:[old],reviews:[]}).analyses[0].rawText,old.rawText);
 for(const change of [r=>r.analysisType='unknown',r=>r.requestId=1,r=>r.source='verified-api',r=>r.structuredResult.regulation_id='other']){const bad=structuredClone(a);change(bad);assert.throws(()=>A.validateData({version:1,analyses:[bad],reviews:[]}));}
});
