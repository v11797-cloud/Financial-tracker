/* Explicit clipboard handoff/import, local history and personal review notes. */
(() => {
  'use strict';
  const A=window.RegWatchGeminiAnalysis;if(!A)return;
  const store=A.createStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)});
  const pending=new Map(),drafts=new Map();let options={},memoTimer;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const btn=(text,action,cls='small-button')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',action);return b;};
  const date=value=>new Date(value).toLocaleString('ko-KR');
  const resolve=item=>options.getItem?.(item.id)||item;
  const notify=message=>{const n=document.getElementById('workspace-gemini-status');if(n)n.textContent=message;};
  function download(value,name){const url=URL.createObjectURL(new Blob([value],{type:'application/json;charset=utf-8'})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function dialog(id,title){
    const old=document.getElementById(id);if(old){old.close();old.remove();}
    const previous=document.activeElement,d=el('dialog','ws-dialog ga-dialog');d.id=id;d.setAttribute('aria-labelledby',`${id}-title`);
    const top=el('header'),h=el('h2','',title);h.id=`${id}-title`;const close=btn('닫기',()=>d.close(),'ws-button');close.setAttribute('aria-label',`${title} 닫기`);top.append(h,close);d.append(top);
    d.addEventListener('close',()=>{d.remove();if(!d.dataset.agentNavigation&&previous?.isConnected)previous.focus({preventScroll:true});});document.body.append(d);return d;
  }
  function section(host,title,value){const s=el('section','ga-section');s.append(el('h3','',title));if(Array.isArray(value)){if(value.length){const ul=el('ul');value.forEach(t=>ul.append(el('li','',t)));s.append(ul);}else s.append(el('p','ga-muted','제공된 내용 없음'));}else s.append(el('p','ga-preserve',value||'제공된 내용 없음'));host.append(s);}
  function renderAnalysis(host,record){
    host.replaceChildren();
    if(record.format==='structured'){
      section(host,'핵심 요약',record.summary);section(host,'주요 변경사항',record.keyChanges);section(host,'예상 업무 영향',record.businessImpacts);section(host,'검토 필요사항',record.recommendedChecks);section(host,'불확실한 사항',record.uncertainties);
      if(record.sourceUrls.length){const s=el('section','ga-section');s.append(el('h3','','분석에 기재된 출처 · 접근 여부 미검증'));record.sourceUrls.forEach(u=>{if(!A.url(u))return;const a=el('a','ga-source',u);a.href=A.url(u);a.target='_blank';a.rel='noopener noreferrer';s.append(a);});host.append(s);}
    }else section(host,'일반 텍스트 분석 결과','핵심 요약과 업무 영향을 임의로 생성하지 않았습니다. 아래 붙여넣은 원문을 확인하세요.');
    const raw=el('details','ga-raw'),summary=el('summary','','Gemini 원본 분석');raw.append(summary,el('pre','ga-preserve',record.rawText));if(record.format==='text')raw.open=true;host.append(raw);
  }
  function renderGeminiAnalysisSummary(atom,r){
    atom.querySelector('.ga-summary')?.remove();const group=el('span','ga-summary'),latest=A.getLatestGeminiAnalysis(store,r.id),review=A.reviewFor(store,r);
    if(latest){
      const result=el('span','ga-saved-result'),header=el('span','ga-result-header'),view=btn('분석 보기',()=>openReview(r),'small-button ga-view-analysis');
      view.title=`${r.title} · 저장된 Gemini 분석 보기`;
      header.append(el('span','ga-result-title','Gemini 분석 결과'),view);
      result.append(header,el('span','ga-summary-text',latest.format==='structured'?(latest.summary||'저장된 분석 내용을 확인하세요.'):'일반 텍스트 분석 결과 · 원문 보기'),el('span','ga-muted',`가져온 시각 ${date(latest.importedAt)}`));group.append(result);
    }else group.append(el('span','ga-flow-help','① Gemini에서 분석 → 답변 복사 → ② Workspace에 저장'));
    const row=el('span','ga-actions ga-flow-actions');row.setAttribute('role','group');row.setAttribute('aria-label',`${r.title} Gemini 분석 연결`);
    const start=btn(latest?'① Gemini로 다시 분석':'① Gemini로 분석하기',()=>window.RegWatchAgent.openRegWatchAgentPanel(resolve(r)),'small-button ga-start-button');
    start.dataset.gaStart=r.id;
    row.append(start,btn('② 결과 가져오기',()=>openGeminiImportModal(r),'small-button ga-import-start'));
    const secondary=el('span','ga-actions ga-note-actions');if(!latest)secondary.append(btn('내 의견 작성',()=>openReview(r),'text-button'));secondary.append(el('span','ga-muted',{before:'검토 전',progress:'검토 중',complete:'검토 완료'}[review.status]));
    group.append(row,secondary);atom.append(group);
  }
  function refresh(){
    document.querySelectorAll('[data-ws-reference]').forEach(atom=>{try{renderGeminiAnalysisSummary(atom,JSON.parse(atom.dataset.wsReference));}catch{}});
    if(store.error)notify(store.error);
  }
  function savePending(id,statusNode){
    const value=pending.get(id);if(!value)return true;
    try{A.saveReview(store,value.item,value.fields);pending.delete(id);if(statusNode)statusNode.textContent='개인 의견 저장됨';refresh();return true;}
    catch(e){if(statusNode)statusNode.textContent=`저장 실패 · ${e.message}`;notify(e.message);return false;}
  }
  function openReview(input){
    const item=resolve(input),d=dialog('ga-review',item.title),all=A.getGeminiAnalysesForRegulation(store,item.id),note={...A.reviewFor(store,item),...pending.get(item.id)?.fields};
    d.append(el('p','ga-muted',`규제 ID: ${item.id}`),el('p','ga-muted','사용자가 Gemini Enterprise 결과로 가져온 참고자료입니다. 분석 출처·사실관계·법률 해석의 정확성을 검증한 결과가 아닙니다.'));
    d.append(el('p','ga-flow-help','Gemini에서 분석 → 답변 복사 → 분석 결과 가져오기 → Workspace에 저장'));
    const actions=el('div','ga-actions');actions.append(btn('Gemini Enterprise 심층분석',()=>window.RegWatchAgent.openRegWatchAgentPanel(resolve(item)),'small-button ga-start-button'),btn('분석 결과 가져오기',()=>openGeminiImportModal(item)));d.append(actions);
    const stateLabel=el('label','ga-field','검토 상태'),state=el('select');state.setAttribute('aria-label','규제 검토 상태');
    for(const [value,text]of [['before','검토 전'],['progress','검토 중'],['complete','검토 완료']]){const opt=el('option','',text);opt.value=value;state.append(opt);}state.value=note.status;stateLabel.append(state);d.append(stateLabel);
    const history=el('details','ga-history');history.append(el('summary','',`이전 분석 보기 · ${Math.max(0,all.length-1)}건`));
    const chooser=el('select');chooser.setAttribute('aria-label','Gemini 분석 이력');all.forEach((a,i)=>{const opt=el('option','',`${i===0?'최신 · ':''}${date(a.importedAt)} · ${i+1}/${all.length}`);opt.value=a.id;chooser.append(opt);});history.append(chooser);if(all.length>1)d.append(history);
    const analysisHost=el('div'),analysisActions=el('div','ga-actions'),analysisStatus=el('p','ga-muted');analysisStatus.setAttribute('role','status');d.append(analysisHost,analysisActions,analysisStatus);
    function paintAnalysis(){
      const a=all.find(v=>v.id===chooser.value)||all[0];analysisActions.replaceChildren();
      if(!a){analysisHost.replaceChildren(el('p','ga-muted','아직 가져온 분석이 없습니다. Gemini에서 답변을 복사한 뒤 분석 결과 가져오기를 이용하세요.'));return;}
      analysisStatus.textContent=`${window.RegWatchGemini.analysisTypes[a.analysisType]?.label||'분석 유형 미지정'} · 가져온 시각: ${date(a.importedAt)} · Gemini의 실제 생성 시각이 아닙니다.`;renderAnalysis(analysisHost,a);
      analysisActions.append(btn('원문 복사',async()=>{const ok=await window.RegWatchGemini.copyPromptToClipboard(a.rawText);analysisStatus.textContent=ok?'분석 원문을 복사했습니다.':'자동 복사가 제한됐습니다. Gemini 원본 분석에서 직접 복사하세요.';}),btn('분석 내보내기',()=>download(JSON.stringify({version:1,analyses:[a],reviews:[A.reviewFor(store,item)]},null,2),`gemini-analysis-${a.id}.json`)),btn('분석 삭제',()=>confirmDelete(a,item)));
      if(a.format==='structured'&&a.recommendedChecks.length)analysisActions.append(btn('검토사항을 할 일로 추가',()=>{const count=window.RegWatchWorkspace.convertGeminiChecksToTasks(item,a);analysisStatus.textContent=count?`${count}개 검토사항을 Workspace 본문 체크리스트에 추가했습니다.`:'이미 추가한 검토사항입니다.';}));
    }
    chooser.addEventListener('change',paintAnalysis);paintAnalysis();
    const label=el('label','ga-field','내 검토 메모 · AI 분석과 별도 저장'),memo=el('textarea','ws-editor ga-user-memo');memo.setAttribute('aria-label','규제별 내 검토 메모');memo.rows=5;memo.value=note.userMemo;label.append(memo);d.append(label);
    const saveStatus=el('p','ga-muted',pending.has(item.id)?'저장하지 못한 의견이 유지되고 있습니다.':'입력하면 자동 저장됩니다.');saveStatus.setAttribute('role','status');
    const queue=()=>{pending.set(item.id,{item,fields:{userMemo:memo.value,status:state.value}});saveStatus.textContent='저장 중…';clearTimeout(memoTimer);memoTimer=setTimeout(()=>savePending(item.id,saveStatus),400);};
    memo.addEventListener('input',queue);state.addEventListener('change',queue);
    d.append(saveStatus,btn('개인 의견 저장 다시 시도',()=>savePending(item.id,saveStatus)),btn('개인 의견 내보내기',()=>download(JSON.stringify({regulationId:item.id,userMemo:memo.value,status:state.value},null,2),'regwatch-personal-review.json')));
    d.addEventListener('close',()=>{clearTimeout(memoTimer);savePending(item.id);});d.showModal();memo.scrollTop=0;
  }
  function confirmDelete(a,item){
    const d=dialog('ga-delete','분석 삭제 확인'),message=el('p','',`${date(a.importedAt)}에 가져온 분석을 삭제할까요? 개인 의견과 Workspace 메모·체크리스트는 유지됩니다.`);d.append(message);
    const actions=el('div','ga-actions');actions.append(btn('취소',()=>d.close()),btn('삭제',()=>{try{A.deleteGeminiAnalysis(store,a.id);d.close();refresh();openReview(item);}catch(e){message.textContent=e.message;}}));d.append(actions);d.showModal();actions.firstChild.focus();
  }
  function openGeminiImportModal(input){
    const item=resolve(input);if(!item.id){notify('연결할 규제 ID를 확인할 수 없습니다.');return;}
    const d=dialog('ga-import','Gemini Enterprise 분석 결과 가져오기');let parsed=null;
    d.append(el('p','',`연결할 규제: ${item.title}`),el('p','ga-muted',`규제 ID: ${item.id}`),el('p','','Gemini에서 생성한 답변을 복사해 붙여넣으세요. 미리보기를 확인하고 저장해야 반영됩니다.'));
    d.append(el('p','ga-muted','답변 마지막의 [REGWATCH_EXPORT_V1] JSON 블록까지 함께 복사하세요. 블록이 없으면 RegWatch에서 새 Prompt를 복사해 Gemini에 다시 요청하세요. 일반 텍스트로 저장해도 원문은 보존됩니다.'));
    const inputArea=el('textarea','ga-paste');inputArea.setAttribute('aria-label','Gemini 분석 결과 붙여넣기');inputArea.value=drafts.get(item.id)||'';d.append(inputArea);
    const warning=el('p','ga-import-warning');warning.setAttribute('role','status');d.append(warning);
    const preview=el('div','ga-import-preview');preview.hidden=true;d.append(preview);
    const consentLabel=el('label','ga-consent'),consent=el('input');consent.type='checkbox';consentLabel.append(consent,document.createTextNode('결과의 규제 ID를 확인할 수 없습니다. 위에 표시된 선택 규제의 분석 자료로 저장하겠습니다.'));consentLabel.hidden=true;d.append(consentLabel);
    let request={};try{const h=JSON.parse(sessionStorage.getItem(A.HANDOFF_KEY)||'null');if(h?.regulationId===item.id)request={analysisType:h.analysisType||'unspecified',requestId:h.requestId||''};}catch{}
    const commitResult=()=>{
      if(!parsed)return;
      try{
        const record=A.saveGeminiAnalysis(store,item,parsed,consent.checked,()=>new Date().toISOString(),request);
        window.RegWatchWorkspace?.addRegulation(item);const workspaceSaved=window.RegWatchWorkspace?.saveNow();drafts.delete(item.id);inputArea.value='';d.close();refresh();notify(workspaceSaved?'분석 결과를 새 이력으로 저장했습니다. 개인 의견은 유지됩니다.':'분석 이력은 저장했지만 Workspace 연결을 저장하지 못했습니다. 메모를 내보내고 저장을 다시 시도하세요.');openReview(item);return record;
      }catch(e){warning.textContent=`저장 실패 · ${e.message}`;}
    };
    const save=btn('분석 결과 저장',()=>{
      if(!parsed||save.disabled)return;
      if(window.RegWatchWorkspace?.hasRegulation(item.id)){commitResult();return;}
      const confirm=dialog('ga-connect-confirm','Workspace 연결 확인');confirm.append(el('p','',`이 규제를 Workspace에 추가하고 분석 결과를 저장할까요? ${item.title}`));
      const actions=el('div','ga-actions');actions.append(btn('추가 후 저장',()=>{confirm.close();commitResult();}),btn('취소',()=>confirm.close()));confirm.append(actions);confirm.showModal();actions.lastChild.focus();
    });save.disabled=true;
    const ready=()=>{save.disabled=!parsed||Boolean(parsed.blockingReason)||Boolean(parsed.declaredId&&parsed.declaredId!==item.id)||(!parsed.declaredId&&!consent.checked);};consent.addEventListener('change',ready);
    inputArea.addEventListener('input',()=>{drafts.set(item.id,inputArea.value);parsed=null;preview.hidden=true;consent.checked=false;consentLabel.hidden=true;warning.textContent='';ready();});
    const actions=el('div','ga-actions');actions.append(btn('취소',()=>d.close()),btn('미리보기',()=>{
      try{
        parsed=A.parseGeminiAnalysis(inputArea.value);drafts.set(item.id,inputArea.value);preview.hidden=false;consent.checked=false;consentLabel.hidden=Boolean(parsed.declaredId);
        const x=parsed.data;renderAnalysis(preview,{format:parsed.format,summary:x?.summary||'',keyChanges:x?.key_changes||[],businessImpacts:x?.business_impacts||[],recommendedChecks:x?.recommended_checks||[],uncertainties:x?.uncertainties||[],sourceUrls:x?.source_urls||[],rawText:parsed.rawText});
        warning.textContent=parsed.blockingReason||(parsed.declaredId&&parsed.declaredId!==item.id?`다른 안건의 분석입니다. 결과 ID: ${parsed.declaredId} / 선택한 ID: ${item.id}. 저장할 수 없습니다.`:parsed.warnings.join('\n')||'미리보기를 확인한 후 저장하세요.');ready();
      }catch(e){warning.textContent=e.message;save.disabled=true;}
    }),save,btn('붙여넣은 원문 내보내기',()=>download(inputArea.value,'gemini-unsaved-analysis.txt')));d.append(actions);
    // Keep an unsaved paste even if Escape or Close is used. No automatic clipboard reads.
    d.addEventListener('close',()=>{if(inputArea.value)drafts.set(item.id,inputArea.value);});d.showModal();inputArea.focus();
  }
  function startHandoff(item,context={}){
    sessionStorage.setItem(A.HANDOFF_KEY,JSON.stringify({regulationId:item.id,regulationTitle:item.title,analysisType:context.analysisType||'asset',requestId:context.requestId||`request-${crypto.randomUUID()}`,requestedAt:new Date().toISOString()}));renderHandoff();
  }
  function renderHandoff(){
    const host=document.getElementById('workspace-gemini-handoff');if(!host)return;host.replaceChildren();
    try{const h=JSON.parse(sessionStorage.getItem(A.HANDOFF_KEY)||'null');if(!h||typeof h.regulationId!=='string'||typeof h.regulationTitle!=='string')return;
      host.append(el('span','ga-muted',`Gemini 분석 요청 준비됨: ${h.regulationTitle} · ${window.RegWatchGemini.analysisTypes[h.analysisType]?.label||'심층분석'} · 실제 분석 진행상태는 확인하지 않습니다.`),btn('분석 결과 가져오기',()=>openGeminiImportModal({id:h.regulationId,title:h.regulationTitle}),'text-button'),btn('안내 닫기',()=>{sessionStorage.removeItem(A.HANDOFF_KEY);host.replaceChildren();},'text-button'));
    }catch{}
  }
  function openLibrary(){
    const d=dialog('ga-library','Gemini 분석 보관함'),byId=new Map();
    const controls=el('div','ga-actions'),file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.setAttribute('aria-label','Gemini 분석 JSON 가져오기');
    controls.append(btn('분석 JSON 가져오기',()=>file.click()),btn('전체 분석 내보내기',()=>download(JSON.stringify(exportData(),null,2),'regwatch-gemini-analyses.json')),file);d.append(controls);
    const status=el('p','ga-import-warning');status.setAttribute('role','status');d.append(status);
    file.addEventListener('change',async()=>{
      const selected=file.files[0];if(!selected)return;
      try{
        if(selected.size>20*1024*1024)throw Error('20MB 이하의 JSON 파일을 선택하세요.');
        const parsed=JSON.parse(await selected.text()),value=A.validateData(parsed.geminiAnalyses||parsed),confirm=dialog('ga-backup-confirm','분석 JSON 가져오기 확인');
        const message=el('p','',`분석 ${value.analyses.length}건을 현재 보관함에 합칠까요? 기존 개인 의견과 같은 ID의 동일한 분석은 유지됩니다.`);confirm.append(message);
        const actions=el('div','ga-actions');actions.append(btn('취소',()=>confirm.close()),btn('가져오기',()=>{try{A.mergeBackup(store,value);confirm.close();d.close();refresh();openLibrary();notify('Gemini 분석 JSON을 가져왔습니다. 기존 개인 의견은 유지됩니다.');}catch(e){message.textContent=e.message;}}));confirm.append(actions);confirm.showModal();
      }catch(e){status.textContent=`가져오기 실패 · ${e.message}`;}finally{file.value='';}
    });
    for(const r of window.RegWatchWorkspace?.getLinkedRegulations()||[])byId.set(r.id,r);
    for(const r of store.data.reviews)if(!byId.has(r.regulationId))byId.set(r.regulationId,{id:r.regulationId,title:r.regulationTitle});
    for(const a of store.data.analyses)if(!byId.has(a.regulationId))byId.set(a.regulationId,{id:a.regulationId,title:a.regulationTitle});
    d.append(el('p','ga-muted','우선검토에서 제외하거나 메모의 규제 링크를 제거해도 저장된 분석·개인 의견은 이곳에 남습니다.'));
    if(store.error)d.append(el('p','ga-import-warning',store.error));
    if(store.invalidRaw!==null)d.append(btn('읽지 못한 기존 데이터 내보내기',()=>download(store.invalidRaw,'regwatch-gemini-original.json')));
    if(!byId.size)d.append(el('p','','연결한 규제가 없습니다. 우선검토나 피드에서 안건을 선택하세요.'));
    for(const r of byId.values()){const row=el('div','ga-library-row');row.append(btn(r.title,()=>openReview(r),'text-button'),el('span','ga-muted',`분석 ${A.getGeminiAnalysesForRegulation(store,r.id).length}건`));d.append(row);}d.showModal();
  }
  function exportData(){const next=structuredClone(store.data);for(const {item,fields}of pending.values()){next.reviews=next.reviews.filter(r=>r.regulationId!==item.id);next.reviews.push({...A.reviewFor(store,item),...fields});}return A.validateData(next);}
  function init(value){options=value;renderHandoff();document.getElementById('workspace-gemini-library')?.addEventListener('click',openLibrary);if(store.error)notify(store.error);}
  window.addEventListener('beforeunload',event=>{for(const id of pending.keys())savePending(id);if(pending.size||[...drafts.values()].some(v=>v.trim())){event.preventDefault();event.returnValue='';}});
  window.addEventListener('storage',event=>{if(event.key!==A.KEY&&event.key!==null)return;if(pending.size||document.getElementById('ga-review')){notify('다른 탭의 분석이 변경됐습니다. 현재 입력을 내보내고 화면을 새로고침하세요.');return;}store.reload();refresh();});
  window.RegWatchGeminiAnalyses={init,startHandoff,openGeminiImportModal,openReview,openLibrary,renderGeminiAnalysisSummary,exportData,reload:restored=>{if(restored){clearTimeout(memoTimer);pending.clear();document.getElementById('ga-review')?.close();}store.reload();refresh();},getStore:()=>store};
})();
