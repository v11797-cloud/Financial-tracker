import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {allowedOrigin} from '../src/index.js';
import A from '../../ui-v2/ai-analysis.js';
const origin='https://v11797-cloud.github.io';
const env={GEMINI_API_KEY:'test-secret',GEMINI_MODEL:'test-model',AI_RATE_LIMITER:{limit:async()=>({success:true})}};
const body=()=>({regulation:A.normalize({id:'worker-test',title:'내부통제 개정',category:'입법예고',date:'2026-09-16'}),rule_score:28,work_view:'all'});
const req=(payload=body(),extra={})=>new Request('https://worker.test/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload),...extra});
const complete=a=>Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(a)}]}]});
test('CORS exact host, local opt-in, absent origin and preflight',async()=>{
  assert.ok(allowedOrigin(origin,env));
  for(const o of ['', 'null', origin+'.evil.test','https://evil.test','http://localhost:8000'])assert.equal(allowedOrigin(o,env),false);
  assert.ok(allowedOrigin('http://127.0.0.1:8765',{ALLOW_LOCALHOST:'true'}));
  assert.equal(allowedOrigin('http://localhost.evil.test:8765',{ALLOW_LOCALHOST:'true'}),false);
  const denied=await worker.fetch(req(body(),{headers:{Origin:'https://evil.test','Content-Type':'application/json'}}),env);
  assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  const preflight=await worker.fetch(new Request('https://worker.test/analyze',{method:'OPTIONS',headers:{Origin:origin}}),env);
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
});
test('validation, byte limit, missing secrets and throttling reject without upstream calls',async()=>{
  let calls=0;const saved=global.fetch;global.fetch=async()=>{calls++;throw Error();};
  assert.equal((await worker.fetch(req({}),env)).status,400);
  const tooLong=body();tooLong.regulation.content='x'.repeat(12001);assert.equal((await worker.fetch(req(tooLong),env)).status,400);
  assert.equal((await worker.fetch(req({...body(),extra:'x'.repeat(80001)}),env)).status,400);
  assert.equal((await worker.fetch(req(),{})).status,503);
  assert.equal((await worker.fetch(req(),{...env,AI_RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);
  assert.equal(calls,0);global.fetch=saved;
});
test('Interactions strict schema, no storage/tools, secret server-side, metadata-only guard',async()=>{
  const saved=global.fetch;
  global.fetch=async(url,options)=>{
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(options.headers['x-goog-api-key'],'test-secret');
    const payload=JSON.parse(options.body);assert.equal(payload.model,'test-model');assert.equal(payload.store,false);
    assert.equal(payload.response_format.mime_type,'application/json');assert.equal(payload.response_format.type,'text');assert.equal(payload.tools,undefined);
    return complete(A.buildFallbackAIAnalysis(body().regulation,'2026-09-16'));
  };
  const response=await worker.fetch(req(),env);assert.equal(response.status,200);assert.ok(A.matches(await response.json()));
  global.fetch=async()=>complete({...A.buildFallbackAIAnalysis(body().regulation),analysis_level:'content_based'});
  assert.equal((await (await worker.fetch(req(),env)).json()).error_code,'AI_RESPONSE_SCHEMA_ERROR');
  const withContent=body();withContent.regulation.content='提供された実際の本文';
  assert.equal((await worker.fetch(req(withContent),env)).status,200);
  global.fetch=saved;
});
test('upstream 429/500, refusal, incomplete, JSON/schema and abort fail closed without leaking errors',async()=>{
  const saved=global.fetch;
  for(const mock of [async()=>new Response('',{status:429}),async()=>new Response('',{status:500}),async()=>new Response('{'),async()=>Response.json({status:'incomplete'}),async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}),async()=>complete({bad:true}),async()=>{throw new DOMException('timeout','AbortError');}]){
    global.fetch=mock; const result=await worker.fetch(req(),env);assert.equal(result.status,503);const failed=await result.json();assert.equal(failed.ai_available,false);assert.match(failed.error_code,/^AI_/);assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);
  }
  global.fetch=saved;
});
