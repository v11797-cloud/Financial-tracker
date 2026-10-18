/* Local import/validation only. No model calls, DOM scraping or network access. */
(function(root) {
  'use strict';
  const KEY='regwatch_gemini_analyses_v1', HANDOFF_KEY='regwatch_gemini_handoff_v1';
  const empty=()=>({version:1,analyses:[],reviews:[]});
  const uid=()=>`analysis-${globalThis.crypto.randomUUID()}`;
  const isString=v=>typeof v==='string';
  const url=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const list=v=>{if(!Array.isArray(v)||!v.every(isString))throw Error('분석 목록 필드의 형식이 올바르지 않습니다.');return [...v];};
  function validateGeminiAnalysis(v) {
    const keys=['schema_version','regulation_id','regulation_title','summary','key_changes','business_impacts','recommended_checks','uncertainties','source_urls'];
    if(!v||v.schema_version!==1||Object.keys(v).some(k=>!keys.includes(k))||!['regulation_id','regulation_title','summary'].every(k=>isString(v[k])))throw Error('분석 JSON의 버전 또는 필드를 확인하세요.');
    const result={schema_version:1,regulation_id:v.regulation_id,regulation_title:v.regulation_title,summary:v.summary};
    for(const k of keys.slice(4))result[k]=list(v[k]);
    if(result.source_urls.some(v=>!url(v)))throw Error('분석 출처에는 HTTP/HTTPS 주소만 사용할 수 있습니다.');
    return result;
  }
  // Import compatibility is separate from strict saved-data/backup validation.
  const importFields={schema_version:['schema_version','schemaVersion','version'],regulation_id:['regulation_id','regulationId'],regulation_title:['regulation_title','regulationTitle','title'],summary:['summary'],key_changes:['key_changes','keyChanges'],business_impacts:['business_impacts','businessImpacts'],recommended_checks:['recommended_checks','recommendedChecks'],uncertainties:['uncertainties'],source_urls:['source_urls','sourceUrls']};
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const wrappers=['structuredResult','analysis','result'];
  function importObjects(value,depth=0){
    if(!object(value))return [];
    return [value,...(depth<2?wrappers.flatMap(k=>importObjects(value[k],depth+1)):[])];
  }
  function supplementaryList(value,key,labels,required,warnings){
    if(value===undefined||value===null)return [];
    const entries=isString(value)?[value]:value;
    if(!Array.isArray(entries))throw Error(`${key}: 목록 형식이 필요합니다.`);
    return entries.map(v=>{
      if(isString(v))return v;
      if(!object(v)||!required.every(k=>isString(v[k])&&v[k].trim())||Object.keys(labels).some(k=>Object.hasOwn(v,k)&&!isString(v[k])))throw Error(`${key}: ${required.join(', ')} 등 텍스트 필드가 필요합니다.`);
      if(Object.keys(v).some(k=>!Object.hasOwn(labels,k)))warnings.push(`${key}의 추가 속성은 원문에 보관합니다.`);
      return Object.entries(labels).filter(([k])=>v[k]).map(([k,label])=>`${label}: ${v[k]}`).join(' · ');
    });
  }
  function normalizeImport(value,warnings){
    if(!object(value))throw Error('JSON 최상위에는 분석 객체가 필요합니다.');
    const result={};
    for(const [key,aliases]of Object.entries(importFields)){
      const present=aliases.filter(k=>Object.hasOwn(value,k));
      if(present.length>1&&present.some(k=>JSON.stringify(value[k])!==JSON.stringify(value[present[0]])))throw Error(`${key}: 같은 필드의 값이 서로 다릅니다.`);
      let v=present.length?value[present[0]]:undefined;
      if(present.length&&present[0]!==key)warnings.push(`${present[0]} → ${key} 형식으로 읽었습니다.`);
      if(key==='schema_version'){
        if(v===undefined){v=1;warnings.push('schema_version이 없어 V1 필드 형식으로 확인했습니다.');}
        if(v==='1'){v=1;warnings.push('문자열 버전 "1"을 숫자 1로 읽었습니다.');}
        if(v!==1)throw Error('schema_version: 지원하는 버전은 1입니다. 새 Prompt로 분석을 요청하세요.');
      }else if(['regulation_id','regulation_title','summary'].includes(key)){
        if(v===undefined||v===null){v='';warnings.push(`${key}가 없어 빈 값으로 두었습니다. 내용을 추정하지 않았습니다.`);}
        if(!isString(v))throw Error(`${key}: 문자열이 필요합니다.`);
        if(key==='regulation_id')v=v.trim();
      }else{
        let supplemental=[];
        if(key==='business_impacts'&&Object.hasOwn(value,'department_impacts')){
          supplemental=supplementaryList(value.department_impacts,'department_impacts',{department:'부서',impact_level:'영향도',rationale:'근거 및 영향'},['department','rationale'],warnings);
          warnings.push('department_impacts를 업무 영향으로 읽었습니다.');
        }
        if(key==='recommended_checks'){
          if(Object.hasOwn(value,'action_items')){supplemental.push(...supplementaryList(value.action_items,'action_items',{priority:'우선순위',action:'검토사항',assigned_department:'담당 부서',timeline:'검토 시점'},['action'],warnings));warnings.push('action_items를 검토사항으로 읽었습니다.');}
          if(Object.hasOwn(value,'checklist_questions')){
            const questions=value.checklist_questions;
            if(questions!==null&&!(isString(questions)||Array.isArray(questions)&&questions.every(isString)))throw Error('checklist_questions: 문자열 목록이 필요합니다.');
            supplemental.push(...(isString(questions)?[questions]:questions||[]));warnings.push('checklist_questions를 추가 확인 질문으로 읽었습니다.');
          }
        }
        if(v===undefined||v===null){v=[];if(!supplemental.length)warnings.push(`${key}가 없어 빈 목록으로 두었습니다.`);}
        if(isString(v)){v=v.trim()?[v]:[];warnings.push(`${key}의 텍스트를 목록으로 읽었습니다.`);}
        if(!Array.isArray(v)||!v.every(isString))throw Error(`${key}: 문자열 목록이 필요합니다. 객체나 숫자는 자동 변환하지 않습니다.`);
        v=[...v,...supplemental];
      }
      result[key]=v;
    }
    if(Object.keys(value).some(k=>![...Object.values(importFields).flat(),'department_impacts','action_items','checklist_questions'].includes(k)))warnings.push('추가 필드는 붙여넣은 원문에 그대로 보관합니다.');
    if(result.source_urls.some(v=>!url(v)))throw Error('source_urls: HTTP/HTTPS 출처 주소만 사용할 수 있습니다.');
    return validateGeminiAnalysis(result);
  }
  function parseGeminiAnalysis(rawText) {
    if(!isString(rawText)||!rawText.trim())throw Error('Gemini 분석 결과를 붙여넣으세요.');
    const warnings=[],trimmed=rawText.trim(),matches=[...rawText.matchAll(/\[REGWATCH_EXPORT_V1\]([\s\S]*?)\[\/REGWATCH_EXPORT_V1\]/g)];
    let declaredId='',blockingReason='';
    const fallback=()=>({format:'text',data:null,declaredId,blockingReason,rawText,warnings});
    const ambiguous=()=>{blockingReason='구조화된 결과 블록이 여러 개입니다. 저장할 분석 하나만 붙여넣으세요.';warnings.push(`${blockingReason} 일반 텍스트로 전체 원문을 보존합니다.`);return fallback();};
    if((rawText.match(/\[REGWATCH_EXPORT_V1\]/g)||[]).length>1)return ambiguous();
    let candidate=(matches.length?matches[0][1]:trimmed).trim();
    if(!matches.length&&!candidate.startsWith('{')){
      const fences=[...candidate.matchAll(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/gi)].filter(m=>m[1].trim().startsWith('{'));
      if(fences.length>1)return ambiguous();
      if(fences.length)candidate=fences[0][1].trim();
    }
    candidate=candidate.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    if(matches.length||candidate.startsWith('{'))try{
      let value;
      try{value=JSON.parse(candidate);}catch{throw Error('JSON 문법을 확인하세요. 쉼표·따옴표·괄호가 올바른 JSON 블록을 붙여넣거나 새 Prompt로 다시 요청하세요.');}
      const objects=importObjects(value),ids=[...new Set(objects.flatMap(v=>['regulation_id','regulationId'].map(k=>v[k]).filter(isString).map(v=>v.trim()).filter(Boolean)))];
      declaredId=ids[0]||'';
      if(ids.length>1){blockingReason='분석 안의 규제 ID가 서로 다릅니다. 같은 안건의 결과인지 확인하세요.';throw Error(blockingReason);}
      const candidates=objects.filter(v=>Object.values(importFields).slice(1).flat().some(k=>Object.hasOwn(v,k)));
      // A wrapper may carry only the regulation ID. Prefer the actual analysis body.
      const bodies=candidates.filter(v=>['summary','key_changes','keyChanges','business_impacts','businessImpacts','recommended_checks','recommendedChecks'].some(k=>Object.hasOwn(v,k)));
      if(bodies.length>1)return ambiguous();
      const body=bodies[0];
      if(!body)throw Error('summary, key_changes 등 분석 필드를 찾지 못했습니다. 새 Prompt의 결과 JSON을 붙여넣으세요.');
      // Do not silently discard an explicit incompatible wrapper version.
      for(const o of objects)for(const k of importFields.schema_version)if(Object.hasOwn(o,k)&&o[k]!==1&&o[k]!=='1')throw Error(`${k}: 지원하는 버전은 1입니다.`);
      const data=normalizeImport(body,warnings);
      if(body!==value)warnings.push('감싸진 분석 객체를 읽었습니다. 전체 답변 원문도 보관합니다.');
      return {format:'structured',data,declaredId,blockingReason,rawText,warnings};
    }catch(e){warnings.push(`구조화된 결과를 읽지 못했습니다. 일반 텍스트로 원문을 보존합니다. ${e.message}`);}
    return fallback();
  }
  function validateData(v) {
    if(!v||v.version!==1||!Array.isArray(v.analyses)||!Array.isArray(v.reviews))throw Error('지원하는 Gemini 분석 백업 형식이 아닙니다.');
    const ids=new Set(),reviews=new Set();
    const analyses=v.analyses.map(a=>{
      if(!a||!['id','regulationId','regulationTitle','importedAt','rawText','summary'].every(k=>isString(a[k]))||!a.id.trim()||!a.regulationId.trim()||ids.has(a.id)||!Number.isFinite(Date.parse(a.importedAt))||a.provider!=='gemini_enterprise'||a.importMethod!=='manual_paste'||!['structured','text'].includes(a.format))throw Error('저장된 Gemini 분석의 형식이 올바르지 않습니다.');
      ids.add(a.id);
      const next={id:a.id,regulationId:a.regulationId,regulationTitle:a.regulationTitle,provider:a.provider,importMethod:a.importMethod,importedAt:a.importedAt,format:a.format,summary:a.summary,rawText:a.rawText};
      for(const k of ['keyChanges','businessImpacts','recommendedChecks','uncertainties','sourceUrls'])next[k]=list(a[k]);
      if(next.sourceUrls.some(v=>!url(v)))throw Error('안전하지 않은 분석 출처 주소입니다.');
      if(a.analysisType!==undefined){if(!['asset','amendments','controls','trends','unspecified'].includes(a.analysisType))throw Error('지원하지 않는 분석 유형입니다.');next.analysisType=a.analysisType;}
      if(a.requestId!==undefined){if(!isString(a.requestId))throw Error('분석 요청 식별자가 올바르지 않습니다.');next.requestId=a.requestId;}
      if(a.source!==undefined){if(a.source!=='gemini_enterprise_manual')throw Error('지원하지 않는 분석 출처입니다.');next.source=a.source;}
      if(a.structuredResult!==undefined){next.structuredResult=a.structuredResult===null?null:validateGeminiAnalysis(a.structuredResult);if(next.structuredResult?.regulation_id&&next.structuredResult.regulation_id!==a.regulationId)throw Error('구조화 결과의 규제 ID가 일치하지 않습니다.');}
      return next;
    });
    const notes=v.reviews.map(n=>{
      if(!n||!['regulationId','regulationTitle','userMemo'].every(k=>isString(n[k]))||!n.regulationId.trim()||reviews.has(n.regulationId)||!['before','progress','complete'].includes(n.status))throw Error('규제 검토 노트의 형식이 올바르지 않습니다.');
      reviews.add(n.regulationId);return {regulationId:n.regulationId,regulationTitle:n.regulationTitle,userMemo:n.userMemo,status:n.status};
    });
    return {version:1,analyses,reviews:notes};
  }
  function createStore(storage) {
    let data=empty(),raw=null,invalidRaw=null,error='';
    function reload(){try{raw=storage.getItem(KEY);data=raw===null?empty():validateData(JSON.parse(raw));invalidRaw=null;error='';}catch(e){invalidRaw=raw;error='기존 Gemini 분석 데이터를 읽지 못했습니다. 기존 데이터를 덮어쓰지 않습니다.';}}
    reload();
    function commit(next){
      const valid=validateData(next);
      try{
        if(error&&invalidRaw!==null)throw Error(error);
        if(storage.getItem(KEY)!==raw)throw Error('다른 탭의 분석 데이터가 변경됐습니다. 입력 내용을 내보낸 뒤 화면을 새로고침하세요.');
        const serialized=JSON.stringify(valid);storage.setItem(KEY,serialized);data=valid;raw=serialized;error='';return valid;
      }catch(e){error=e.name==='QuotaExceededError'?'브라우저 저장 공간이 부족합니다. 입력은 유지됩니다. 내보내기로 보관하거나 이전 분석을 삭제한 후 다시 저장하세요.':e.message||'분석을 저장할 수 없습니다. 입력 내용을 내보내세요.';throw Error(error);}
    }
    return {get data(){return data;},get error(){return error;},get invalidRaw(){return invalidRaw;},commit,reload};
  }
  function getGeminiAnalysesForRegulation(store,id){return store.data.analyses.map((a,index)=>({a,index})).filter(v=>v.a.regulationId===id).sort((x,y)=>Date.parse(y.a.importedAt)-Date.parse(x.a.importedAt)||y.index-x.index).map(v=>v.a);}
  function getLatestGeminiAnalysis(store,id){return getGeminiAnalysesForRegulation(store,id)[0]||null;}
  function reviewFor(store,item){return store.data.reviews.find(n=>n.regulationId===item.id)||{regulationId:item.id,regulationTitle:item.title,userMemo:'',status:'before'};}
  function saveReview(store,item,fields){const next=structuredClone(store.data),note={...reviewFor(store,item),...fields,regulationId:item.id,regulationTitle:item.title};next.reviews=next.reviews.filter(n=>n.regulationId!==item.id);next.reviews.push(note);store.commit(next);return note;}
  function saveGeminiAnalysis(store,item,parsed,confirmUnknown=false,now=()=>new Date().toISOString(),context={}){
    if(!item||!isString(item.id)||!item.id.trim())throw Error('선택한 규제 ID를 확인할 수 없습니다.');
    if(parsed.declaredId&&parsed.declaredId!==item.id)throw Error(`다른 안건의 분석입니다 (${parsed.declaredId}). 선택한 규제에는 저장할 수 없습니다.`);
    if(!parsed.declaredId&&!confirmUnknown)throw Error('규제 ID를 확인할 수 없어 선택한 노트에 저장한다는 별도 확인이 필요합니다.');
    // Reparse rather than trusting a caller-supplied parsed object.
    const checked=parseGeminiAnalysis(parsed.rawText);if(checked.blockingReason)throw Error(checked.blockingReason);if(checked.declaredId!==parsed.declaredId)throw Error('분석 입력이 변경됐습니다. 다시 미리보기하세요.');
    const d=checked.data,a={id:uid(),regulationId:item.id,regulationTitle:item.title,provider:'gemini_enterprise',importMethod:'manual_paste',source:'gemini_enterprise_manual',analysisType:context.analysisType||'unspecified',requestId:context.requestId||'',structuredResult:d,importedAt:now(),format:checked.format,summary:d?.summary||'',keyChanges:d?.key_changes||[],businessImpacts:d?.business_impacts||[],recommendedChecks:d?.recommended_checks||[],uncertainties:d?.uncertainties||[],sourceUrls:d?.source_urls||[],rawText:checked.rawText};
    const next=structuredClone(store.data);next.analyses.push(a);
    if(!next.reviews.some(n=>n.regulationId===item.id))next.reviews.push(reviewFor(store,item));
    store.commit(next);return a;
  }
  function deleteGeminiAnalysis(store,id){const next=structuredClone(store.data);next.analyses=next.analyses.filter(a=>a.id!==id);store.commit(next);}
  function mergeBackup(store,value){
    const imported=validateData(value),next=structuredClone(store.data);
    for(const a of imported.analyses){const existing=next.analyses.find(v=>v.id===a.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(a))throw Error('같은 분석 ID에 다른 내용이 있습니다. 기존 분석을 덮어쓰지 않았습니다.');if(!existing)next.analyses.push(a);}
    for(const note of imported.reviews)if(!next.reviews.some(n=>n.regulationId===note.regulationId))next.reviews.push(note);
    store.commit(next);
  }
  // Commit a combined backup without leaving one half restored after quota errors.
  function commitBackup(storage,entries){
    const before=entries.map(([key])=>[key,storage.getItem(key)]),written=[];
    try{for(const [key,value]of entries){storage.setItem(key,value);written.push(key);}}
    catch(e){let rollbackFailed=false;for(const key of written.reverse()){const value=before.find(v=>v[0]===key)[1];try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{rollbackFailed=true;}}
      throw Error(rollbackFailed?'백업 복원과 원상복구를 완료하지 못했습니다. 기존 백업을 보관하고 저장소 상태를 확인하세요.':'백업을 저장하지 못해 기존 데이터를 유지했습니다. 저장 공간과 브라우저 저장 권한을 확인하세요.');}
  }
  const api={KEY,HANDOFF_KEY,empty,url,validateGeminiAnalysis,parseGeminiAnalysis,validateData,createStore,getGeminiAnalysesForRegulation,getLatestGeminiAnalysis,reviewFor,saveReview,saveGeminiAnalysis,deleteGeminiAnalysis,mergeBackup,commitBackup};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RegWatchGeminiAnalysis=api;
})(typeof window!=='undefined'?window:globalThis);
