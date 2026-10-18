const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../gemini-analysis.js'),G=require('../gemini-enterprise.js');
const item={id:'rule-123',title:'금융투자업규정',date:'2026-10-16',url:'https://example.com/rule'};
const sample=()=>({schema_version:1,regulation_id:item.id,regulation_title:item.title,summary:'업무 영향 검토 필요',key_changes:['확인된 변경사항'],business_impacts:['내규 영향 가능성'],recommended_checks:['당사 적용 여부 확인'],uncertainties:['원문 대조 필요'],source_urls:['https://example.com/rule']});
const wrap=v=>`보고서 원문\n[REGWATCH_EXPORT_V1]\n${JSON.stringify(v)}\n[/REGWATCH_EXPORT_V1]`;
const memory=()=>{const values=new Map();return{values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('export prompt preserves ID, dates, work viewpoint and public content, without private fields',()=>{
 const p=G.buildGeminiRegulationPrompt({...item,content:'공개된 상세내용',userMemo:'PRIVATE_SECRET',analyses:['PRIVATE_ANALYSIS']},'compliance');
 assert.match(p,/규제 ID:\nrule-123/);assert.match(p,/준법감시/);assert.match(p,/공개된 상세내용/);assert.ok(!p.includes('PRIVATE_'));
 const parsed=A.parseGeminiAnalysis(p);assert.equal(parsed.format,'structured');assert.equal(parsed.declaredId,item.id);assert.match(p,/임의로 생성하지/);
});
test('parses marked/fenced/raw JSON, preserving the entire pasted report exactly',()=>{
 for(const raw of [wrap(sample()),'```json\n'+JSON.stringify(sample())+'\n```','[REGWATCH_EXPORT_V1]\n```json\n'+JSON.stringify(sample())+'\n```\n[/REGWATCH_EXPORT_V1]']){const p=A.parseGeminiAnalysis(raw);assert.equal(p.format,'structured');assert.equal(p.rawText,raw);assert.deepEqual(p.data,sample());}
});
test('plain text and malformed JSON fall back without generating or truncating analysis',()=>{
 for(const raw of ['<script>evil()</script>\n일반 분석','[REGWATCH_EXPORT_V1]{broken}[/REGWATCH_EXPORT_V1]',wrap({...sample(),key_changes:42}),wrap({...sample(),source_urls:['javascript:alert(1)']})]){const p=A.parseGeminiAnalysis(raw);assert.equal(p.format,'text');assert.equal(p.rawText,raw);assert.equal(p.data,null);}
 assert.throws(()=>A.parseGeminiAnalysis(' '));
});
test('import accepts string version, extra metadata and explicit camelCase aliases without loosening backups',()=>{
 const value={schemaVersion:'1',regulationId:item.id,regulationTitle:item.title,summary:'요약',keyChanges:['변경'],businessImpacts:['영향'],recommendedChecks:['검토'],uncertainties:[],sourceUrls:[item.url],analysis_type:'asset',extra:{untrusted:'<img src=x onerror=alert(1)>'}};
 const raw=wrap(value),p=A.parseGeminiAnalysis(raw);assert.equal(p.format,'structured');assert.equal(p.declaredId,item.id);assert.equal(p.data.schema_version,1);assert.deepEqual(p.data.key_changes,['변경']);assert.equal(p.rawText,raw);assert.match(p.warnings.join('\n'),/추가 필드/);assert.throws(()=>A.validateGeminiAnalysis(value));
 const store=A.createStore(memory()),saved=A.saveGeminiAnalysis(store,item,p);assert.deepEqual(saved.structuredResult,p.data);assert.equal(saved.rawText,raw);assert.equal(A.validateData(store.data).analyses.length,1);
});
test('missing optional fields and a single text list are preserved without invented content',()=>{
 const p=A.parseGeminiAnalysis(JSON.stringify({regulation_id:item.id,key_changes:'첫 줄\n둘째 줄',business_impacts:null}));
 assert.equal(p.format,'structured');assert.equal(p.data.summary,'');assert.equal(p.data.regulation_title,'');assert.deepEqual(p.data.key_changes,['첫 줄\n둘째 줄']);assert.deepEqual(p.data.business_impacts,[]);assert.match(p.warnings.join('\n'),/빈 값/);
 assert.equal(A.parseGeminiAnalysis(JSON.stringify({regulation_id:item.id})).format,'text');
});
test('reported Enterprise alternate export maps department impacts/actions/questions and keeps missing ID explicit',()=>{
 const value=require('./fixtures/gemini-alternate-export.json'),raw=wrap(value),p=A.parseGeminiAnalysis(raw);
 assert.equal(p.format,'structured');assert.equal(p.declaredId,'');assert.equal(p.data.regulation_id,'');assert.equal(p.data.regulation_title,value.title);assert.equal(p.data.summary,value.summary);assert.deepEqual(p.data.key_changes,value.key_changes);
 assert.equal(p.data.business_impacts.length,4);assert.match(p.data.business_impacts[0],/부서: 준법감시부 · 영향도: 높음 · 근거 및 영향: 업무 감독/);
 assert.equal(p.data.recommended_checks.length,9);assert.match(p.data.recommended_checks[0],/우선순위: 1순위 · 검토사항: 업무지침 내규 체계 검토 · 담당 부서: 준법감시부 \/ AML 부서 · 검토 시점: 즉시/);assert.deepEqual(p.data.recommended_checks.slice(4),value.checklist_questions);
 assert.deepEqual(p.data.uncertainties,[]);assert.deepEqual(p.data.source_urls,[]);assert.match(p.warnings.join('\n'),/department_impacts/);assert.match(p.warnings.join('\n'),/추가 필드/);
 const store=A.createStore(memory());assert.throws(()=>A.saveGeminiAnalysis(store,item,p),/별도 확인/);const saved=A.saveGeminiAnalysis(store,item,p,true);assert.equal(saved.regulationId,item.id);assert.equal(saved.rawText,raw);assert.equal(saved.structuredResult.regulation_id,'');assert.ok(saved.rawText.includes('internal_rules_impact'));
 for(const v of [{...value,department_impacts:42},{...value,action_items:[{action:42}]},{...value,checklist_questions:[{}]}]){const parsed=A.parseGeminiAnalysis(wrap(v));assert.equal(parsed.format,'text');assert.equal(parsed.rawText,wrap(v));}
});
test('fenced report JSON and supported wrapper objects import canonical results',()=>{
 for(const value of [sample(),{analysis:sample()},{result:sample()},{structuredResult:sample()},{regulationId:item.id,analysis:{summary:'분석 요약'}}]){
  const raw='보고서 본문\n```json\n'+JSON.stringify(value)+'\n```\n추가 설명';const p=A.parseGeminiAnalysis(raw);
  assert.equal(p.format,'structured');assert.equal(p.declaredId,item.id);assert.equal(p.rawText,raw);A.saveGeminiAnalysis(A.createStore(memory()),item,p);
 }
});
test('unsupported versions, object lists and broken JSON explain the actual field or syntax',()=>{
 for(const [value,field]of [[{...sample(),schema_version:2},'schema_version'],[{...sample(),key_changes:[{text:'변경'}]},'key_changes'],[{...sample(),summary:42},'summary'],[{...sample(),source_urls:['javascript:evil()']},'source_urls'],[{schema_version:2,analysis:sample()},'schema_version']]){
  const p=A.parseGeminiAnalysis(wrap(value));assert.equal(p.format,'text');assert.ok(p.warnings.join('\n').includes(field));assert.equal(p.declaredId,item.id);
 }
 assert.match(A.parseGeminiAnalysis('{broken}').warnings.join('\n'),/JSON 문법/);
});
test('alias and wrapper IDs cannot bypass the selected regulation guard even when other fields fail',()=>{
 for(const value of [{regulationId:'wrong',summary:42},{analysis:{regulationId:'wrong',summary:'요약'}},{regulationId:'wrong',analysis:{summary:'요약'}}])assert.throws(()=>A.saveGeminiAnalysis(A.createStore(memory()),item,A.parseGeminiAnalysis(wrap(value)),true),/다른 안건/);
 for(const value of [{...sample(),regulationId:'wrong'},{regulation_id:item.id,analysis:{...sample(),regulation_id:'wrong'}}]){
  const p=A.parseGeminiAnalysis(wrap(value));assert.match(p.blockingReason,/규제 ID/);
  assert.throws(()=>A.saveGeminiAnalysis(A.createStore(memory()),item,p,true),/규제 ID/);
  assert.throws(()=>A.saveGeminiAnalysis(A.createStore(memory()),item,{...p,blockingReason:''},true),/규제 ID/);
 }
});
test('multiple JSON candidates remain raw and cannot be saved by confirming an unknown ID',()=>{
 for(const raw of [wrap(sample())+'\n'+wrap(sample()),'```json\n'+JSON.stringify(sample())+'\n```\n```json\n'+JSON.stringify(sample())+'\n```',JSON.stringify({analysis:sample(),result:sample()})]){
  const p=A.parseGeminiAnalysis(raw);assert.equal(p.format,'text');assert.equal(p.rawText,raw);assert.match(p.blockingReason,/여러 개/);assert.throws(()=>A.saveGeminiAnalysis(A.createStore(memory()),item,p,true),/여러 개/);
 }
});
test('selection wins; wrong IDs are blocked even on invalid structured input, unknown ID needs confirmation',()=>{
 const store=A.createStore(memory());for(const s of [{...sample(),regulation_id:'wrong'},{...sample(),regulation_id:'wrong',key_changes:42}])assert.throws(()=>A.saveGeminiAnalysis(store,item,A.parseGeminiAnalysis(wrap(s)),true),/다른 안건/);
 const plain=A.parseGeminiAnalysis('일반 분석 원문');assert.throws(()=>A.saveGeminiAnalysis(store,item,plain),/별도 확인/);const a=A.saveGeminiAnalysis(store,item,plain,true);assert.equal(a.regulationId,item.id);assert.equal(a.summary,'');assert.equal(a.rawText,plain.rawText);
});
test('history appends by stable ID; renamed title, private memo/status, deletion and reload remain independent',()=>{
 const storage=memory(),store=A.createStore(storage),parsed=A.parseGeminiAnalysis(wrap(sample()));A.saveReview(store,item,{userMemo:'내 의견',status:'progress'});
 const a=A.saveGeminiAnalysis(store,item,parsed,false,()=> '2026-10-16T01:00:00Z');const b=A.saveGeminiAnalysis(store,{...item,title:'수정된 제목'},parsed,false,()=> '2026-10-17T01:00:00Z');
 assert.equal(A.getLatestGeminiAnalysis(store,item.id).id,b.id);assert.equal(A.getGeminiAnalysesForRegulation(store,item.id).length,2);assert.equal(A.reviewFor(store,item).userMemo,'내 의견');
 A.deleteGeminiAnalysis(store,a.id);const reloaded=A.createStore(storage);assert.equal(A.getLatestGeminiAnalysis(reloaded,item.id).id,b.id);assert.equal(A.reviewFor(reloaded,item).status,'progress');assert.equal(reloaded.data.reviews.length,1);
});
test('quota failure preserves old data and full paste for retry; no unrelated keys are changed',()=>{
 const storage=memory(),store=A.createStore(storage),p=A.parseGeminiAnalysis(wrap(sample()));storage.setItem('regwatch_workspace_v1','my-private-note');A.saveGeminiAnalysis(store,item,p);const before=storage.getItem(A.KEY),old=storage.setItem;
 storage.setItem=(k,v)=>{if(k===A.KEY)throw new DOMException('full','QuotaExceededError');old(k,v);};assert.throws(()=>A.saveGeminiAnalysis(store,item,p),/저장 공간/);assert.equal(storage.getItem(A.KEY),before);assert.equal(store.data.analyses.length,1);assert.equal(p.rawText,wrap(sample()));assert.equal(storage.getItem('regwatch_workspace_v1'),'my-private-note');storage.setItem=old;A.saveGeminiAnalysis(store,item,p);assert.equal(store.data.analyses.length,2);
});
test('corrupt data and concurrent tabs cannot be silently overwritten',()=>{
 const storage=memory();storage.setItem(A.KEY,'{broken');const broken=A.createStore(storage);assert.throws(()=>A.saveGeminiAnalysis(broken,item,A.parseGeminiAnalysis('report'),true));assert.equal(storage.getItem(A.KEY),'{broken');assert.equal(broken.invalidRaw,'{broken');
 storage.removeItem(A.KEY);const first=A.createStore(storage),second=A.createStore(storage);A.saveReview(first,item,{userMemo:'first',status:'before'});assert.throws(()=>A.saveReview(second,item,{userMemo:'second',status:'before'}),/다른 탭/);
});
test('combined backup is validated; partial quota failure restores both previous keys',()=>{
 const storage=memory();storage.setItem('workspace','old notes');storage.setItem(A.KEY,'old analyses');const original=storage.setItem;storage.setItem=(k,v)=>{if(k==='workspace'&&v==='new notes')throw new DOMException('full','QuotaExceededError');original(k,v);};
 assert.throws(()=>A.commitBackup(storage,[[A.KEY,'new analyses'],['workspace','new notes']]),/기존 데이터/);assert.equal(storage.getItem('workspace'),'old notes');assert.equal(storage.getItem(A.KEY),'old analyses');
 for(const v of [{version:2,analyses:[],reviews:[]},{version:1,analyses:[],reviews:[{regulationId:'x',regulationTitle:'x',userMemo:'',status:'invalid'}]}])assert.throws(()=>A.validateData(v));
});
test('analysis-only import deduplicates IDs, preserves opinions, and older backups do not become latest',()=>{
 const store=A.createStore(memory()),p=A.parseGeminiAnalysis(wrap(sample()));A.saveReview(store,item,{userMemo:'keep',status:'complete'});
 const newest=A.saveGeminiAnalysis(store,item,p,false,()=> '2026-10-17T01:00:00Z'),old={...newest,id:'older',importedAt:'2026-10-01T01:00:00Z'};
 const backup={version:1,analyses:[old],reviews:[{...A.reviewFor(store,item),userMemo:'overwrite attempt'}]};A.mergeBackup(store,backup);A.mergeBackup(store,backup);
 assert.equal(store.data.analyses.length,2);assert.equal(A.getLatestGeminiAnalysis(store,item.id).id,newest.id);assert.equal(A.reviewFor(store,item).userMemo,'keep');assert.throws(()=>A.mergeBackup(store,{...backup,analyses:[{...old,summary:'different'}]}),/같은 분석 ID/);
 const ambiguous=A.parseGeminiAnalysis(wrap(sample())+'\n'+wrap(sample()));assert.equal(ambiguous.format,'text');assert.match(ambiguous.warnings[0],/여러 개/);
});
