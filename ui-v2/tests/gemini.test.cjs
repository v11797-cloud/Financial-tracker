const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../gemini-enterprise.js');
test('allowlist, native field mapping, missing content and AML viewpoint',()=>{
 const p=G.buildGeminiRegulationPrompt({title:'자금세탁방지 관련 제도 개선',source:'금융위원회',dept:'담당부서',date:'2026-09-17',keywords:['AML','고객확인'],internalMemo:'PRIVATE_SECRET',content:''},'aml');
 assert.match(p,/현재 선택된 업무 관점:\nAML/);assert.match(p,/상세 본문이 제공되지 않았습니다/);assert.match(p,/공식 원문:\n제공되지 않음/);assert.ok(!/undefined|null|PRIVATE_SECRET/.test(p));assert.match(p,/담당부서:\n담당부서/);
});
test('content and official URL retained; dates not fabricated',()=>{
 const p=G.buildGeminiRegulationPrompt({title:'원문 검토',content:'실제 제공된 상세내용',original_url:'https://example.org/regulation',category:'입법예고',enf_date:'2026-10-01',notice_end_date:'2026-09-30'},'investment');
 assert.match(p,/실제 제공된 상세내용/);assert.match(p,/https:\/\/example.org\/regulation/);assert.match(p,/시행예정일:\n제공되지 않음/);assert.match(p,/의견제출 마감:\n2026-09-30/);assert.throws(()=>G.buildGeminiRegulationPrompt({}));assert.equal(G.normalizeRegulationForGemini({title:'기관',id:'no123'}).source,'금융위원회');
});
test('agent URL validation and storage-independent config',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','http://example.org','https://user:pass@example.org'])assert.throws(()=>G.setAgentUrl(url));
 G.setAgentUrl('https://enterprise.example.org/agent');assert.equal(G.getAgentUrl(),'https://enterprise.example.org/agent');G.setAgentUrl('');assert.equal(G.getAgentUrl(),'');
});
