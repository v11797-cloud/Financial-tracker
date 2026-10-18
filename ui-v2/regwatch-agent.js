/* A local launcher. Public regulation context only; no chat, iframe or API client. */
(function(root){
  'use strict';
  const G=typeof module!=='undefined'&&module.exports?require('./gemini-enterprise.js'):root.RegWatchGemini;
  function publicRegulation(item){
    const r=G.normalizeRegulationForGemini({...item,source:item?.source||item?.institution,dept:item?.dept||item?.institution});
    if(!r.id)throw Error('규제 ID를 확인할 수 없습니다.');
    return {id:r.id,title:r.title,source:r.source,dept:r.department,category:r.type,date:r.published_date,effective_date:r.effective_date,comment_deadline:r.comment_deadline,keywords:r.keywords,content:r.content,url:r.original_url};
  }
  function buildRegWatchAgentPrompt(item,type='asset',view='all'){return G.buildGeminiRegulationPrompt(publicRegulation(item),view,type);}
  if(typeof module!=='undefined'&&module.exports){module.exports={publicRegulation,buildRegWatchAgentPrompt,analysisTypes:G.analysisTypes};return;}
  let api={},selected=null,freeMode=false,launching=false,panel,trigger,previousFocus;
  const $=id=>document.getElementById(id);
  const fresh=item=>{const current=api.getItems?.().find(r=>r.id===item.id);return publicRegulation(current||item);};
  function getSelectedAgentRegulation(){if(!selected)return null;selected=fresh(selected);return selected;}
  function resetResultHint(){if(panel){$('agent-panel-status').textContent='';$('agent-manual-open').hidden=true;}}
  function setSelectedAgentRegulation(item){if(!item)return;try{const next=fresh(item);if(freeMode||selected?.id!==next.id)resetResultHint();selected=next;freeMode=false;if($('agent-reg-source')?.value==='free')$('agent-reg-source').value='all';if(panel?.open)renderContext();}catch{}}
  function listItems(){
    const scope=$('agent-reg-source').value;
    const source=scope==='priority'?(api.getPriorityItems?.()||[]):scope==='workspace'?(api.getWorkspaceRegulations?.()||[]):(api.getItems?.()||[]);
    const query=$('agent-reg-search').value.trim().toLowerCase(),seen=new Set();
    return source.filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return `${r.title} ${r.dept||r.institution||''}`.toLowerCase().includes(query);});
  }
  function renderChoices(){
    const list=$('agent-reg-choice');list.replaceChildren();
    const nextFree=$('agent-reg-source').value==='free';if(nextFree!==freeMode)resetResultHint();freeMode=nextFree;
    $('agent-reg-search').hidden=freeMode;list.hidden=freeMode;$('agent-choice-count').hidden=freeMode;
    if(freeMode){selected=null;renderContext();return;}
    const matches=listItems();
    const placeholder=document.createElement('option');placeholder.textContent=matches.length?'목록에서 규제를 선택하세요.':'선택할 규제가 없습니다. 다른 목록을 선택하세요.';placeholder.value='';placeholder.disabled=true;placeholder.selected=true;list.append(placeholder);
    for(const item of matches.slice(0,80)){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.title;list.append(opt);}
    $('agent-choice-count').textContent=`${matches.length}건${matches.length>80?' · 80건 표시, 검색어를 입력해 좁혀 보세요.':''}`;
  }
  function renderContext(){
    const item=getSelectedAgentRegulation();
    $('agent-context-title').textContent=item?item.title:freeMode?'규제 선택 없이 직접 질문':'분석할 규제를 선택하세요.';
    $('agent-context-meta').textContent=item?[item.source==='KOFIA'?'금융투자협회':item.source||item.dept,item.category,item.date].filter(Boolean).join(' · '):freeMode?'규제 정보와 프롬프트를 전달하지 않고 회사 Agent만 엽니다.':'우선검토·My Workspace·전체 피드에서 선택할 수 있습니다.';
    $('agent-reg-picker').hidden=Boolean(item);$('agent-type-field').hidden=!item;$('agent-prompt-preview').hidden=!item;
    $('agent-launch').textContent=freeMode?'Agent 열기':'Prompt 복사 + Agent 열기';
    $('agent-launch').disabled=launching||(!item&&!freeMode);$('agent-import').disabled=!item;
    $('agent-change-regulation').hidden=!item&&!freeMode;
    updateURL();
    if($('agent-prompt-preview').open&&item)updatePreview();
  }
  function updatePreview(){
    const item=getSelectedAgentRegulation();if(!item)return;
    $('agent-prompt').value=buildRegWatchAgentPrompt(item,$('agent-analysis-type').value,$('scope-select')?.value||'all');
  }
  function updateURL(){
    const configured=Boolean(G.getAgentUrl());$('agent-url-state').textContent=configured?'회사 Agent 주소 등록됨':'Gemini Enterprise Agent 주소가 설정되지 않았습니다. 우측 위 ⚙에서 등록하세요.';
  }
  function openRegWatchAgentPanel(item){
    if(!panel)return;if(item)setSelectedAgentRegulation(item);previousFocus=document.activeElement;
    for(const id of ['detail-dialog','ga-review','gemini-preview']){const d=$(id);if(d?.open){d.dataset.agentNavigation='true';d.close();}}
    renderChoices();renderContext();if(!panel.open)panel.show();trigger.setAttribute('aria-expanded','true');document.body.classList.add('rw-agent-open');
    (selected?$('agent-analysis-type'):$('agent-reg-source')).focus({preventScroll:true});
  }
  function afterClose(){trigger.setAttribute('aria-expanded','false');document.body.classList.remove('rw-agent-open');(previousFocus?.isConnected&&!previousFocus.closest('dialog:not([open])')?previousFocus:trigger).focus({preventScroll:true});}
  function closeRegWatchAgentPanel(){if(!panel?.open)return;panel.close();afterClose();}
  async function launchGeminiEnterpriseAgent(){
    const item=getSelectedAgentRegulation();if(!item&&!freeMode)return;
    if(!G.getAgentUrl()){$('agent-panel-status').textContent='먼저 회사 Gemini Agent 주소를 등록하세요.';G.openAgentSettings();return;}
    if(freeMode){const opened=G.openGeminiAgent();$('agent-panel-status').textContent=opened?'회사 Agent를 열었습니다. Gemini에서 직접 질문을 입력하세요.':'새 탭이 차단되었습니다. 아래 수동 열기 링크를 이용하세요.';manualLink();return;}
    const context={analysisType:$('agent-analysis-type').value,requestId:`request-${crypto.randomUUID()}`};
    launching=true;$('agent-launch').disabled=true;
    try{const result=await G.openGeminiEnterpriseAnalysis(item,context);$('agent-panel-status').textContent=result?.opened&&result?.copied?'프롬프트를 복사하고 Agent를 열었습니다. Gemini에서 Ctrl+V 후 분석한 답변을 복사해 결과를 가져오세요.':'프롬프트 미리보기에서 복사 및 새 탭 열기 안내를 확인하세요.';manualLink();}
    catch{$('agent-panel-status').textContent='Agent 실행을 준비하지 못했습니다. 잠시 후 다시 시도하세요.';}
    finally{setTimeout(()=>{launching=false;if(panel?.open)renderContext();},1500);}
  }
  function manualLink(){const a=$('agent-manual-open'),url=G.getAgentUrl();a.hidden=!url;if(url)a.href=url;}
  function openAgentImportModal(){const item=getSelectedAgentRegulation();if(!item){$('agent-panel-status').textContent='결과를 저장할 규제를 먼저 선택하세요.';return;}root.RegWatchGeminiAnalyses.openGeminiImportModal(item);}
  function init(options){
    api=options;panel=$('regwatch-agent-panel');trigger=$('regwatch-agent-trigger');if(!panel||!trigger)return;
    for(const [key,value]of Object.entries(G.analysisTypes)){const opt=document.createElement('option');opt.value=key;opt.textContent=value.label;$('agent-analysis-type').append(opt);}
    try{const h=JSON.parse(sessionStorage.getItem(root.RegWatchGeminiAnalysis.HANDOFF_KEY)||'null');if(h?.regulationId){selected=fresh({id:h.regulationId,title:h.regulationTitle});if(G.analysisTypes[h.analysisType])$('agent-analysis-type').value=h.analysisType;}}catch{}
    trigger.addEventListener('click',()=>panel.open?closeRegWatchAgentPanel():openRegWatchAgentPanel());
    $('agent-panel-close').addEventListener('click',closeRegWatchAgentPanel);
    $('agent-settings').addEventListener('click',()=>G.openAgentSettings());
    $('agent-change-regulation').addEventListener('click',()=>{selected=null;freeMode=false;$('agent-reg-source').value='priority';renderChoices();renderContext();$('agent-reg-source').focus();});
    $('agent-reg-source').addEventListener('change',()=>{renderChoices();renderContext();});$('agent-reg-search').addEventListener('input',renderChoices);
    $('agent-reg-choice').addEventListener('change',()=>{const item=listItems().find(r=>r.id===$('agent-reg-choice').value);if(item){setSelectedAgentRegulation(item);$('agent-analysis-type').focus();}});
    $('agent-analysis-type').addEventListener('change',()=>{resetResultHint();if($('agent-prompt-preview').open)updatePreview();});
    $('scope-select')?.addEventListener('change',()=>{if(panel.open&&$('agent-prompt-preview').open)updatePreview();});
    $('agent-prompt-preview').addEventListener('toggle',()=>{if($('agent-prompt-preview').open)updatePreview();});
    $('agent-launch').addEventListener('click',launchGeminiEnterpriseAgent);$('agent-import').addEventListener('click',openAgentImportModal);
    panel.addEventListener('close',()=>{if(!panel.open&&trigger.getAttribute('aria-expanded')==='true')afterClose();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.open&&!document.querySelector('dialog[open]:not(#regwatch-agent-panel)')){event.preventDefault();closeRegWatchAgentPanel();}});
    root.addEventListener('regwatch:agent-url-changed',updateURL);
  }
  root.RegWatchAgent={init,publicRegulation,buildRegWatchAgentPrompt,setSelectedAgentRegulation,getSelectedAgentRegulation,openRegWatchAgentPanel,closeRegWatchAgentPanel,launchGeminiEnterpriseAgent,openAgentImportModal};
})(typeof window!=='undefined'?window:globalThis);
