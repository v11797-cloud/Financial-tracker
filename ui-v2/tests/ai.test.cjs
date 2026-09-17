const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../ai-analysis.js');
const TODAY = '2026-09-16';
const item = (extra = {}) => ({ id: 'ai-test', title: '내부통제 규정 개정', dept: '준법감시', category: '공포법령', date: TODAY, enf_date: TODAY, ...extra });
const values = new Map();
global.localStorage = { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,v) };
global.REGWATCH_AI_CONFIG = { enabled: true, endpoint: 'https://worker.example/analyze', cacheTtlMs: 86400000, timeoutMs: 100 };

test('rule score bounds, invalid/missing/past/future dates and category-specific deadlines', () => {
  assert.equal(A.calculateRuleScore(item(), TODAY), 50);
  assert.equal(A.ruleBreakdown(item({enf_date:'2026-02-30'}), TODAY).effective, 0);
  assert.equal(A.ruleBreakdown(item({enf_date:'2026-09-15'}), TODAY).effective, 0);
  assert.equal(A.ruleBreakdown(item({date:'2026-10-01'}), TODAY).recency, 0);
  assert.equal(A.ruleBreakdown(item({category:'보도자료'}), TODAY).effective, 0);
  assert.equal(A.ruleBreakdown(item({category:'입법예고',notice_end_date:TODAY}), TODAY).deadline, 10);
  assert.equal(A.calculateFinalPriorityScore(-2, NaN), 0);
  assert.equal(A.calculateFinalPriorityScore(100, 100), 100);
});
test('deterministic fallback preserves metadata-only and maps all specified taxonomies', () => {
  for (const [title,key] of [['AML','aml'],['내부통제','internal_control'],['광고','compliance'],['전자금융','it'],['개인정보','privacy'],['펀드','investment']]) {
    const a = A.buildFallbackAIAnalysis(item({title}),TODAY);
    assert.equal(a.affected_functions[key],5); assert.equal(a.analysis_level,'metadata_only'); assert.ok(A.matches(a));
    assert.deepEqual(a,A.buildFallbackAIAnalysis(item({title}),TODAY)); assert.ok(a.confidence <= 40);
  }
  assert.equal(A.buildFallbackAIAnalysis(item({content:'본문'}),TODAY).analysis_level,'metadata_only');
});
test('schema rejects extra keys, NaN, incorrect scores, omitted areas and wrong action types', () => {
  const a = A.buildFallbackAIAnalysis(item(),TODAY);
  const { asset_management_impact, ...oldSchema } = a;
  assert.ok(asset_management_impact.length > 0);
  assert.equal(A.matches(oldSchema), false);
  assert.equal(A.matches({...a,asset_management_impact:[]}), false);
  assert.equal(A.matches({...a,ai_impact_score:41}),false);
  assert.equal(A.matches({...a,confidence:NaN}),false);
  assert.equal(A.matches({...a,extra:'bad'}),false);
  assert.equal(A.matches({...a,affected_functions:{aml:5}}),false);
  assert.equal(A.matches({...a,recommended_actions:['bad']}),false);
});
test('content hash invalidates for metadata and entire content, payload is truncated to 12000', async () => {
  assert.notEqual(await A.hashRegulation(item()),await A.hashRegulation(item({dept:'IT'})));
  const content = 'a'.repeat(12000);
  assert.notEqual(await A.hashRegulation(item({content:content+'1'})),await A.hashRegulation(item({content:content+'2'})));
  assert.equal(A.normalize(item({content:content+'tail'})).content.length,12000);
});
test('cache TTL, corrupt cache, missing storage, and metadata validation', async () => {
  const r = item({id:'cache'}), a = A.buildFallbackAIAnalysis(r,TODAY);
  await A.setAICache(r,a); assert.deepEqual(await A.getAICache(r),a);
  assert.equal(await A.getAICache({...r,title:'changed'}),null);
  const originalNow = Date.now;
  Date.now = () => originalNow() + 86400001;
  assert.equal(await A.getAICache(r),null); Date.now = originalNow;
  const bad = item({id:'corrupt'}), key = `regwatch_ai_v2_${bad.id}_${await A.hashRegulation(bad)}`;
  values.set(key,'{'); assert.equal(await A.getAICache(bad),null);
  await A.setAICache(bad,{...a,analysis_level:'content_based'}); assert.equal(await A.getAICache(bad),null);
  const storage = global.localStorage; global.localStorage = {getItem(){throw Error();},setItem(){throw Error();}};
  await A.setAICache(item({id:'memory'}),a); assert.deepEqual(await A.getAICache(item({id:'memory'})),a);
  global.localStorage = storage;
});
test('request deduplication, max two simultaneous calls, view-independent cache and no database payload', async () => {
  let running = 0, max = 0, calls = 0;
  const fetch = global.fetch;
  global.fetch = async (url, options) => {
    running++; max = Math.max(max,running); calls++;
    const body = JSON.parse(options.body); assert.equal(body.work_view,'all'); assert.equal(Array.isArray(body.regulation),false);
    await new Promise(resolve => setTimeout(resolve,10)); running--;
    return Response.json(A.buildFallbackAIAnalysis(body.regulation,TODAY));
  };
  const r = item({id:'dedupe'});
  const answers = await Promise.all([A.requestAIAnalysis(r),A.requestAIAnalysis(r),...Array.from({length:5},(_,i)=>A.requestAIAnalysis(item({id:'parallel'+i})))]);
  assert.equal(calls,6); assert.equal(max,2); assert.ok(answers.every(a=>a.source==='ai'));
  await A.requestAIAnalysis(r,{work_view:'aml'}); assert.equal(calls,6);
  global.fetch = fetch;
});
test('timeout, HTTP errors, malformed JSON/schema, no endpoint and ineligible items always fall back', async () => {
  const fetch = global.fetch;
  for (const [id,mock] of [
    ['429',async()=>new Response('',{status:429})], ['500',async()=>new Response('',{status:500})],
    ['parse',async()=>new Response('{')], ['schema',async()=>Response.json({ai_impact_score:40})],
    ['confidence',async()=>Response.json({...A.buildFallbackAIAnalysis(item(),TODAY),confidence:99})],
    ['timeout',async(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Error('timeout'))))]
  ]) { global.fetch=mock; const r=await A.requestAIAnalysis(item({id})); assert.equal(r.source,'rule'); assert.equal(r.status,'unavailable'); }
  let calls=0; global.fetch=async()=>{calls++;throw Error();};
  await A.requestAIAnalysis(item({id:'not-eligible'}),{eligible:false});
  global.REGWATCH_AI_CONFIG.endpoint=''; await A.requestAIAnalysis(item({id:'no-endpoint'})); assert.equal(calls,0);
  global.REGWATCH_AI_CONFIG.endpoint='https://worker.example/analyze'; global.fetch=fetch;
});
test('AI HTML renderers escape model-provided content', () => {
  const a = A.buildFallbackAIAnalysis(item(),TODAY);
  a.recommended_actions[0].action='<img src=x onerror=alert(1)>';
  assert.ok(!A.renderAIRecommendations(a).includes('<img'));
});
test('KOFIA content-based cache requires matching source and hashes the verified body', async () => {
  const r=item({id:'kofia_notice_900',source:'KOFIA'});
  const doc={id:r.id,title:r.title,published_date:r.date,content:'실제 본문 확인용 테스트 자료입니다. '.repeat(10),content_hash:'a'.repeat(64),source_url:'https://law.kofia.or.kr/service/revisionNotice/revisionNoticeView.do',kind:'notice_body',retrieved_at:new Date().toISOString(),truncated:false,attachments_included:false};
  const data={...A.buildFallbackAIAnalysis(r,TODAY),analysis_level:'content_based',confidence:65};
  await A.setAICache(r,data);assert.equal(await A.getAICache(r),null);
  await A.setAICache(r,data,doc);assert.deepEqual(await A.getAICache(r),data);
  assert.deepEqual((await A.getAICache(r,true)).sourceDocument,doc);
  const key=await A.hashRegulation({...r,content:doc.content,source_hash:doc.content_hash});
  assert.ok(values.has(`regwatch_ai_v2_${r.id}_${key}`));
  assert.equal(A.validSourceDocument({...doc,title:'다른 제목'},r),false);
  assert.equal(A.validSourceDocument({...doc,source_url:'https://evil.test/'},r),false);
  assert.equal(await A.getAICache({...r,date:'2026-09-18'}),null);
});
