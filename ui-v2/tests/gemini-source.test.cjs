const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../gemini-source.js'),G=require('../gemini-enterprise.js'),Agent=require('../regwatch-agent.js');
const item={id:'kofia_revision_1817',title:'금융소비자보호 표준내부통제기준',source:'KOFIA',category:'공포법령',date:'2026-10-15',law_seq:'346',history_seq:'1817',source_group:'모범규준',url:'https://law.kofia.or.kr/service/revision/revisionView.do?historySeq=1817',userMemo:'PRIVATE_MEMO'};
const record={...Object.fromEntries(['id','title','date','law_seq','history_seq','source_group'].map(k=>[k,item[k]])),status:'ready',kind:'amendment_document',text:'광고 의사결정 과정에 소비자보호책임자가 참여하도록 내부통제체계를 개선합니다.',source_url:item.url,content_url:'https://law.kofia.or.kr/download.do?gubun=104&seq=1813',collected_at:'2026-10-19T01:06:32Z'};
const payload=r=>({schema_version:1,source:'KOFIA',items:{[item.id]:r}});
test('Agent preserves public revision identity; prompt embeds actual source with provenance, excludes notes',async()=>{
 const publicItem=Agent.publicRegulation(item);assert.equal(publicItem.law_seq,'346');assert.equal(publicItem.source_group,'모범규준');assert.ok(!Object.hasOwn(publicItem,'userMemo'));
 const source=await S.createResolver({load:async()=>payload(record)})(publicItem);
 assert.equal(source.status,'ready');
 const prompt=Agent.buildRegWatchAgentPrompt(publicItem,'amendments','asset',source);
 assert.ok(prompt.includes(record.text));assert.ok(prompt.includes(record.content_url));assert.ok(prompt.includes(record.collected_at));assert.ok(!prompt.includes('PRIVATE_MEMO'));assert.ok(!prompt.includes('상세 본문이 제공되지 않았습니다'));
 assert.match(prompt,/외부 링크에 접근할 수 없다는 이유만으로 분석 전체를 중단/);assert.match(prompt,/REGWATCH_EXPORT_V1/);
});
test('reject wrong revision identity, status, unsafe sources; never substitute another amendment',()=>{
 for(const change of [{date:'2025-10-15'},{title:'다른 규정'},{history_seq:'1816'},{law_seq:'150'},{source_group:'협회규정'},{source_url:'https://example.org'},{content_url:'https://law.kofia.or.kr.evil.example/download.do?gubun=104&seq=1'},{content_url:'javascript:alert(1)'},{kind:'version_fulltext',content_url:'https://law.kofia.or.kr/service/law/lawFullScreenContent.do?seq=346&historySeq=1816'}])assert.equal(S.validate(item,payload({...record,...change}),'kofia').status,'mismatch');
 assert.equal(S.validate(item,payload({...record,status:'pending'}),'kofia').status,'pending');
 assert.equal(S.validate(item,payload({...record,status:'unavailable'}),'kofia').text,'');
 const full=S.validate(item,payload({...record,kind:'version_fulltext',content_url:'https://law.kofia.or.kr/service/law/lawFullScreenContent.do?seq=346&historySeq=1817'}),'kofia');assert.equal(full.status,'ready');assert.match(full.label,/전문/);
});
test('notice, press, statutes and administrative rules use the matching official cache',async()=>{
 const fixtures=[
  {i:{id:'fss_notice_4305',title:'감독규정 시행세칙',date:'2026-09-04',category:'입법예고',source:'FSS',url:'https://www.fss.or.kr/fss/job/lrgRegItnPrvntc/view.do?lrgSlno=4305&menuNo=200489&pageIndex=1'},kind:'notice',url:'https://www.fss.or.kr/fss/job/lrgRegItnPrvntc/view.do?lrgSlno=4305&menuNo=200489'},
  {i:{id:'no123',title:'금융 보도자료',date:'2026-10-15',category:'보도자료',url:'https://www.fsc.go.kr/no010101/123?curPage=1&srchText='},kind:'press',url:'https://www.fsc.go.kr/no010101/123'},
  {i:{id:'law_test',title:'자본시장법',law_name:'자본시장법',prom_no:'123',date:'2026-10-15',category:'공포법령'},kind:'law',url:'https://www.law.go.kr/LSW/lsRvsDocInfoR.do?lsiSeq=123&lsRvsGubun=Rsn'},
  {i:{id:'admrul_test',title:'감독규정',law_name:'감독규정',prom_no:'1',date:'2026-10-15',category:'공포법령'},kind:'law',url:'https://www.law.go.kr/LSW/admRulRvsInfoR.do?admRulSeq=456'}
 ];
 for(const {i,kind,url}of fixtures){const p={schema_version:1,items:{[i.id]:{...i,status:kind==='law'?'available':'ready',source_url:url,text:'공식 개정이유',purpose:'공식 개정 취지',changes:'실제 변경 내용'}}},resolver=S.createResolver({load:async k=>{assert.equal(k,kind);return p;},lawReasons:()=>p}),source=await resolver(i);assert.equal(source.status,'ready');assert.match(source.text,/공식/);const bad=structuredClone(p);bad.items[i.id].date='2025-01-01';assert.equal(S.validate(i,bad,kind).status,'mismatch');}
 const i={id:'kofia_notice_157',notice_seq:'157',source:'KOFIA',title:'개정예고',date:'2026-09-01'};assert.equal(S.validate(i,{schema_version:1,items:{[i.id]:{title:i.title,date:i.date,status:'ready',source_url:'https://law.kofia.or.kr/service/revisionNotice/revisionNoticeView.do',purpose:'공식 예고문'}}},'notice').status,'ready');
});
test('missing data and fetch failures remain explicit, retries work, long excerpts are labelled',async()=>{
 let calls=0;const resolve=S.createResolver({load:async()=>{if(++calls===1)throw Error('offline');return payload(record);}});
 assert.equal((await resolve(item)).status,'unavailable');assert.equal((await resolve(item)).status,'ready');assert.equal(calls,2);
 let loads=0;const shared=S.createResolver({load:async()=>{loads++;return payload(record);}});await Promise.all([shared(item),shared(item)]);assert.equal(loads,1);
 const long=S.validate(item,payload({...record,text:'가'.repeat(S.MAX_TEXT+10)}),'kofia');assert.equal(long.text.length,S.MAX_TEXT);assert.equal(long.truncated,true);assert.match(G.buildGeminiRegulationPrompt(item,'all','asset',long),/분량 제한으로 일부만 제공/);
 const native=await S.createResolver({load:async()=>({schema_version:1,items:{}}),lawReasons:()=>null})({title:'직접 제공된 자료',content:'공개 게시물 상세내용'});assert.equal(native.kind,'provided_content');
});
