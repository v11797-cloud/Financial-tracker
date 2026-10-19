/* Public, identity-checked excerpts for Gemini handoff. No model or remote-site calls. */
(function(root){
  'use strict';
  const text=v=>typeof v==='string'?v.trim():'';
  const MAX_TEXT=32000;
  const labels={amendment_document:'공식 개정 첨부파일 발췌',revision_summary:'협회 공식 제·개정 요약',version_fulltext:'해당 개정 시점 규정 전문 발췌',law_reasons:'공식 제·개정이유',notice:'공식 예고문 발췌',press:'공식 보도자료 본문 발췌',provided_content:'게시물에 제공된 상세내용'};
  function officialURL(value){
    try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['law.kofia.or.kr','www.law.go.kr','www.fsc.go.kr','www.fss.or.kr'].includes(u.hostname)?u:null;}catch{return null;}
  }
  function stableURL(value){
    const u=officialURL(value);if(!u)return '';
    for(const k of [...u.searchParams.keys()])if(/^(srch|curPage$|pageIndex$|menuNo$)/.test(k))u.searchParams.delete(k);
    u.searchParams.sort();return u.href;
  }
  function ready(value,kind,record={}){
    const body=text(value),limited=body.slice(0,MAX_TEXT).replace(/[\uD800-\uDBFF]$/,'');
    return {status:'ready',text:limited,kind,label:labels[kind],source_url:text(record.source_url),content_url:text(record.content_url)||text(record.source_url),collected_at:text(record.collected_at),truncated:record.truncated===true||body.length>limited.length};
  }
  const missing=(status='missing')=>({status,text:'',label:'분석에 사용할 원문 본문 미확보'});
  function validate(item,payload,kind){
    const r=payload?.schema_version===1?payload.items?.[item.id]:null;
    if(!r)return missing();
    const keys=kind==='kofia'?['id','title','date','law_seq','history_seq','source_group']:kind==='law'?['id','law_name','prom_no','date']:['title','date'];
    if(!keys.every(k=>typeof item[k]==='string'&&r[k]===item[k]))return missing('mismatch');
    if(r.status!==(kind==='law'?'available':'ready'))return missing(r.status==='pending'?'pending':'unavailable');
    if(kind==='kofia'){
      const original=`https://law.kofia.or.kr/service/revision/revisionView.do?historySeq=${item.history_seq}`;
      if(payload.source!=='KOFIA'||!/^kofia_revision_\d{1,12}$/.test(item.id)||item.id!==`kofia_revision_${item.history_seq}`||!/^\d{1,12}$/.test(item.law_seq)||!['협회규정','모범규준'].includes(item.source_group)||r.source_url!==original)return missing('mismatch');
      const u=officialURL(r.content_url);
      if(!u||u.hostname!=='law.kofia.or.kr'||!text(r.text))return missing('mismatch');
      const valid=r.kind==='revision_summary'?u.href===original:r.kind==='amendment_document'?u.pathname==='/download.do'&&u.searchParams.get('gubun')==='104'&&/^\d{1,12}$/.test(u.searchParams.get('seq')||''):r.kind==='version_fulltext'&&u.pathname==='/service/law/lawFullScreenContent.do'&&u.searchParams.get('seq')===item.law_seq&&u.searchParams.get('historySeq')===item.history_seq;
      return valid?ready(r.text,r.kind,r):missing('mismatch');
    }
    const u=officialURL(r.source_url);
    if(!u)return missing('mismatch');
    if(kind==='law')return u.hostname==='www.law.go.kr'&&['/LSW/lsRvsDocInfoR.do','/LSW/admRulRvsInfoR.do'].includes(u.pathname)&&/^\d+$/.test(u.searchParams.get('lsiSeq')||u.searchParams.get('admRulSeq')||'')&&text(r.text)?ready(r.text,'law_reasons',r):missing('mismatch');
    const kofiaNotice=item.source==='KOFIA'&&/^kofia_notice_\d+$/.test(item.id)&&item.id===`kofia_notice_${item.notice_seq}`&&u.href==='https://law.kofia.or.kr/service/revisionNotice/revisionNoticeView.do';
    if(!kofiaNotice&&(!stableURL(item.url)||stableURL(r.source_url)!==stableURL(item.url)))return missing('mismatch');
    const content=[text(r.purpose),text(r.changes)].filter(Boolean).join('\n\n');
    return content?ready(content,kind,r):missing('unavailable');
  }
  function createResolver({load,lawReasons=()=>root.lawReasons}={}){
    const pending=new Map();
    const get=kind=>{if(!pending.has(kind))pending.set(kind,Promise.resolve().then(()=>load(kind)).catch(()=>{pending.delete(kind);return null;}));return pending.get(kind);};
    return async item=>{
      const kind=item.source==='KOFIA'&&item.category==='공포법령'?'kofia':item.category==='공포법령'?'law':item.category==='입법예고'?'notice':item.category==='보도자료'?'press':null;
      if(kind){
        let payload;try{payload=kind==='law'?lawReasons():await get(kind);}catch{return missing('unavailable');}
        const result=validate(item,payload,kind);
        if(result.status!=='missing'||!text(item.content))return payload?result:missing('unavailable');
      }
      return text(item.content)?ready(item.content,'provided_content'):missing();
    };
  }
  const resolve=createResolver({load:async kind=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{const r=await root.fetch(`./data/${kind}_summaries.json`,{cache:'no-cache',signal:controller.signal});if(!r.ok)throw Error('unavailable');return await r.json();}finally{clearTimeout(timer);}
  }});
  const api={MAX_TEXT,labels,validate,createResolver,resolve};root.RegWatchGeminiSource=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
