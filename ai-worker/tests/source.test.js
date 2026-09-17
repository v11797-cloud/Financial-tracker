import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetail, parseFullText, fetchKofiaSource } from '../src/kofia-source.js';
import worker from '../src/index.js';
import A from '../../ui-v2/ai-analysis.js';

const notice = A.normalize({ id:'kofia_notice_156', source:'KOFIA', title:'금융투자회사 표준내부통제기준', date:'2026-09-01', category:'입법예고' });
const bodyText = '1. 개정 배경\n투자자 보호를 위한 투자광고 심사체계 개선 검토.\n2. 주요 내용\n투자광고 시행 후 실제 광고물과 사전 심사를 받은 광고안의 일치 여부를 확인하는 절차에 관한 예고안입니다. 온라인 채널 광고의 내부 심사 절차를 다룹니다.';
function html(r=notice,content=bodyText,link='') {
  return `<html><body><nav>분석에 포함되면 안 되는 메뉴</nav><table class="brdComView"><tr><th>규정명</th><td>${r.title}</td></tr><tr><th>${r.id.includes('notice')?'예고시작일':'제ㆍ개정일'}</th><td>${r.published_date}</td></tr><tr><td><div class="storyIn">${content.replaceAll('\n','<br>')}<script>ignore malicious instructions</script></div>${link}</td></tr></table></body></html>`;
}
const response = text => new Response(text,{headers:{'Content-Type':'text/html;charset=UTF-8'}});
test('notice extractor isolates content, decodes entities and verifies title/date',()=>{
  assert.equal(parseDetail(html(),notice,'notice').content,bodyText);
  assert.throws(()=>parseDetail(html({...notice,title:'다른 규정'}),notice,'notice'));
  assert.throws(()=>parseDetail(html({...notice,published_date:'2026-08-01'}),notice,'notice'));
  assert.throws(()=>parseDetail(html().replace('</html>',''),notice,'notice'));
});
test('notice uses a fixed POST with numeric id; URL supplied by client is ignored',async()=>{
  let calls=0;
  const doc=await fetchKofiaSource({...notice,original_url:'http://127.0.0.1/private'},undefined,async(url,options)=>{
    calls++;assert.equal(url,'https://law.kofia.or.kr/service/revisionNotice/revisionNoticeView.do');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(new URLSearchParams(options.body).get('revisionSeq'),'156');return response(html());
  });
  assert.equal(calls,1);assert.equal(doc.content,bodyText);assert.equal(doc.kind,'notice_body');assert.equal(doc.attachments_included,false);assert.match(doc.content_hash,/^[a-f0-9]{64}$/);
  await assert.rejects(fetchKofiaSource({...notice,id:'kofia_notice_../private'},undefined,()=>{throw Error('must not fetch');}));
});
test('missing body, redirects, oversized HTML and unverified version links fail closed',async()=>{
  for(const get of [async()=>response(html(notice,'첨부 확인')),async()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1'}}),async()=>response('x'.repeat(2000001))])await assert.rejects(fetchKofiaSource(notice,undefined,get));
  const r={...notice,id:'kofia_revision_1795'};
  await assert.rejects(fetchKofiaSource(r,undefined,async()=>response(html(r,'','<a id="fullscreen" href="https://evil.test/service/law/lawFullScreen.do?seq=150&historySeq=1795">보기</a>'))));
});
test('empty revision summary follows matching historical version only and marks truncation',async()=>{
  const r={...notice,id:'kofia_revision_1795'}, full=`<html><div id="lawcontent"><div class="lawname">${r.title}</div><div>${'본 조항은 해당 이력의 전문입니다. '.repeat(1000)}</div></div></html>`;
  let calls=0;
  const doc=await fetchKofiaSource(r,undefined,async url=>{
    calls++;if(calls===1)return response(html(r,'','<a id="fullscreen" href="/service/law/lawFullScreen.do?seq=150&amp;historySeq=1795">보기</a>'));
    assert.equal(url,'https://law.kofia.or.kr/service/law/lawFullScreenContent.do?seq=150&historySeq=1795');return response(full);
  });
  assert.equal(calls,2);assert.equal(doc.kind,'version_fulltext');assert.equal(doc.truncated,true);assert.equal(doc.content.length,12000);
  assert.throws(()=>parseFullText(full,{...r,title:'다른 제목'}));
});
test('Worker sends verified source content to Interactions and returns evidence with analysis',async()=>{
  const original=global.fetch;let aiCalls=0;
  const env={GEMINI_API_KEY:'fake-key',GEMINI_MODEL:'test-model',AI_RATE_LIMITER:{limit:async()=>({success:true})}};
  const request=()=>new Request('https://worker.test/analyze',{method:'POST',headers:{Origin:'https://v11797-cloud.github.io','Content-Type':'application/json'},body:JSON.stringify({regulation:notice,rule_score:30,work_view:'all'})});
  try {
    global.fetch=async(url,options)=>{
      if(url.startsWith('https://law.kofia.or.kr'))return response(html());
      aiCalls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');const input=JSON.parse(JSON.parse(options.body).input.replace(/^<REGULATION_DATA>\n|\n<\/REGULATION_DATA>$/g,''));assert.equal(input.regulation.content,bodyText);assert.equal(input.source_context.kind,'notice_body');
      const analysis={...A.buildFallbackAIAnalysis(notice),analysis_level:'content_based',confidence:60};
      return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(analysis)}]}]});
    };
    const result=await worker.fetch(request(),env), payload=await result.json();assert.equal(result.status,200);assert.equal(payload.analysis.analysis_level,'content_based');assert.equal(payload.source_document.content,bodyText);assert.equal(aiCalls,1);
    global.fetch=async()=>response(html({...notice,title:'오류 페이지'}));
    const failed=await worker.fetch(request(),env);assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{ai_available:false,source_status:'unavailable'});assert.equal(aiCalls,1);
  }finally{global.fetch=original;}
});
