/* Private, local-only notes. No network or AI calls. */
(() => {
  'use strict';
  const KEY = 'regwatch_workspace_v1';
  const Format = typeof module !== 'undefined' && module.exports ? require('./workspace-format.js') : window.RegWatchWorkspaceFormat;
  let sequence = 0;
  const uid = () => `ws-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}`}`;
  const validURL = value => {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
  };
  const initial = () => ({version:1, collapsed:false, updatedAt:null, blocks:[
    {id:uid(), type:'text', title:'', regulations:[], content:''}
  ]});
  function validate(value) {
    const fail = () => { throw new Error('지원하는 Workspace JSON 형식이 아닙니다.'); };
    if (!value || value.version !== 1 || typeof value.collapsed !== 'boolean' || !Array.isArray(value.blocks) || !(value.updatedAt === null || (typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))))) fail();
    const ids = new Set(), regulations = new Set();
    const id = v => { if (typeof v !== 'string' || !v.trim() || ids.has(v)) fail(); ids.add(v); return v; };
    const str = v => { if (typeof v !== 'string') fail(); return v; };
    const blocks = value.blocks.map(b => {
      if (!b || typeof b !== 'object') fail();
      const result = {id:id(b.id), type:b.type};
      if (b.type === 'text' || b.type === 'heading') {
        result.content = str(b.content);
        if (b.type === 'text') {
          if (b.title !== undefined) result.title = str(b.title);
          if (b.regulations !== undefined) {
            if (!Array.isArray(b.regulations)) fail();
            result.regulations = b.regulations.map(r => { const next = Format.validateRegulation(r); if (regulations.has(next.id)) fail(); regulations.add(next.id); return next; });
          }
        }
        if (b.type === 'text' && b.format !== undefined) {
          result.format = Format.validate(b.format); result.content = Format.plainText(result.format);
          for (const r of Format.references(result.format)) { if (regulations.has(r.id)) fail(); regulations.add(r.id); }
        }
      }
      else if (b.type === 'checklist') {
        if (!Array.isArray(b.items)) fail();
        result.draft = b.draft === undefined ? '' : str(b.draft);
        result.items = b.items.map(t => {
          if (!t || typeof t.completed !== 'boolean') fail();
          return {id:id(t.id), text:str(t.text), completed:t.completed};
        });
      } else if (b.type === 'regulation') {
        const r = b.regulation;
        if (!r || typeof r.id !== 'string' || !r.id.trim() || regulations.has(r.id) || typeof r.title !== 'string' || !r.title.trim()) fail();
        regulations.add(r.id);
        const url = str(r.url);
        if (url && !validURL(url)) fail();
        result.regulation = {id:r.id, title:r.title, institution:str(r.institution), date:str(r.date), url:url ? validURL(url) : ''};
        result.content = str(b.content);
      } else fail();
      return result;
    });
    return {version:1, collapsed:value.collapsed, updatedAt:value.updatedAt, blocks};
  }
  function createStore(storage, now = () => new Date().toISOString()) {
    let data = initial(), raw = null, invalidRaw = null, dirty = false, blocked = false, conflict = false, error = '';
    try {
      raw = storage.getItem(KEY);
      if (raw !== null) data = validate(JSON.parse(raw));
    } catch {
      blocked = true; invalidRaw = raw;
      error = raw === null ? '저장소에 접근할 수 없습니다. 작성 내용은 내보내기로 보관하세요.' : '기존 저장 데이터를 읽지 못해 덮어쓰지 않았습니다. 기존 데이터와 작성 내용을 내보내기로 보관하세요.';
    }
    return {
      get data() { return data; }, get dirty() { return dirty; }, get error() { return error; },
      get invalidRaw() { return invalidRaw; }, get conflict() { return conflict; },
      change() { dirty = true; },
      save() {
        if (!dirty) return !error;
        try {
          if (blocked && invalidRaw !== null) throw new Error(error);
          if (conflict || storage.getItem(KEY) !== raw) { conflict = true; throw new Error('다른 탭의 Workspace가 변경됐습니다. 작성 내용을 내보낸 뒤 다른 탭 내용을 불러오세요.'); }
          const next = {...data, updatedAt:now()};
          const serialized = JSON.stringify(next);
          storage.setItem(KEY, serialized);
          data.updatedAt = next.updatedAt; raw = serialized; dirty = false; error = ''; blocked = false;
          return true;
        } catch (e) {
          error = e?.name === 'QuotaExceededError' ? '브라우저 저장 공간이 부족합니다. 입력 내용은 화면에 유지됩니다. 내보내기로 보관하세요.' : e.message || '저장소에 접근할 수 없습니다. 내보내기로 보관하세요.';
          return false;
        }
      },
      replace(value) { const next = validate(value), currentRaw = storage.getItem(KEY); data = next; raw = currentRaw; blocked = false; conflict = false; invalidRaw = null; dirty = true; error = ''; },
      adoptSaved(value,serialized) { data = validate(value); raw = serialized; blocked = false; conflict = false; invalidRaw = null; dirty = false; error = ''; },
      receive(value, editing) {
        if (value === raw) return;
        if (dirty || editing) { conflict = true; error = '다른 탭의 Workspace가 변경됐습니다. 작성 내용을 내보낸 뒤 다른 탭 내용을 불러오세요.'; return; }
        try { const next = value === null ? initial() : validate(JSON.parse(value)); data = next; raw = value; error = ''; conflict = false; blocked = false; invalidRaw = null; }
        catch { conflict = true; error = '다른 탭의 저장 데이터를 읽지 못했습니다. 현재 내용은 유지됩니다.'; }
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {KEY, validate, createStore, initial, validURL}; return; }

  let api, store, host, body, blocksHost, timer, undo = null, importCandidate = null, lastFocus, pickerTarget = null, pickerPlacement = 'body', pickerSource = 'priority', activeMemo = null;
  const memoEditors = new Map();
  const $ = id => document.getElementById(id);
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const button = (text, label, action) => { const b = el('button','ws-button',text); b.type = 'button'; if (label) b.setAttribute('aria-label',label); b.addEventListener('click',action); return b; };
  const closeMenus = () => host.querySelectorAll('details[open]').forEach(n => { n.open = false; });
  function status() {
    const failed = Boolean(store.error);
    const node = $('workspace-status');
    const large = !store.dirty && new Blob([JSON.stringify(store.data)]).size > 2500000;
    node.textContent = failed ? `저장 실패 · ${store.error}` : store.dirty ? '저장 중…' : store.data.updatedAt ? `자동 저장됨${large ? ' · 저장 용량이 큽니다. 내보내기로 백업하세요.' : ''}` : '입력하면 자동 저장됩니다.';
    node.classList.toggle('ws-error',failed);
    $('workspace-retry').hidden = !failed || store.conflict || store.invalidRaw !== null;
    $('workspace-conflict').hidden = !store.conflict;
    $('workspace-raw-export').hidden = store.invalidRaw === null;
  }
  function flush() { clearTimeout(timer); const saved = store.save(); status(); return saved; }
  function changed() { store.change(); clearTimeout(timer); timer = setTimeout(flush,400); status(); counts(); }
  function counts() {
    const tasks = store.data.blocks.flatMap(b => b.type === 'checklist' ? b.items : b.type === 'text' ? Format.checklists(b.format).flatMap(c => c.items) : []);
    const notes = store.data.blocks.filter(b => b.type === 'text').length;
    $('workspace-summary').textContent = `${notes}개 메모${tasks.length ? ` · 할 일 ${tasks.length}건 중 ${tasks.filter(t => t.completed).length}건 완료` : ''}`;
  }
  function resize(input) { input.style.height = 'auto'; input.style.height = `${Math.max(input.scrollHeight,38)}px`; }
  function editor(value, label, placeholder, update, heading = false) {
    const input = el('textarea',heading ? 'ws-editor ws-heading' : 'ws-editor');
    input.rows = 1; input.value = value; input.placeholder = placeholder; input.setAttribute('aria-label',label);
    input.addEventListener('input',() => { update(input.value); resize(input); changed(); });
    return input;
  }
  function focusEditor(id) {
    const block = [...blocksHost.children].find(n => n.dataset.blockId === id);
    (block?.querySelector('.ws-note-title') || block?.querySelector('[contenteditable="true"]') || block?.querySelector('textarea') || block?.querySelector('.ws-reg-link') || block?.querySelector('summary'))?.focus({preventScroll:true});
    block?.scrollIntoView({block:'nearest'});
  }
  function rememberDelete(value) { undo = value; $('workspace-undo').hidden = false; $('workspace-notice').textContent = '삭제했습니다.'; }
  function render() {
    body.hidden = store.data.collapsed;
    $('workspace-toggle').textContent = store.data.collapsed ? '⌄' : '⌃';
    $('workspace-toggle').setAttribute('aria-expanded',String(!store.data.collapsed));
    $('workspace-toggle').setAttribute('aria-label',store.data.collapsed ? 'My Workspace 펼치기' : 'My Workspace 접기');
    blocksHost.replaceChildren(); memoEditors.clear(); counts();
    if (!store.data.blocks.length) {
      const empty = el('div','ws-empty'); empty.append(el('p','','아직 작성한 내용이 없습니다. 자유롭게 메모를 추가해 보세요.'),button('+ 첫 메모 추가','첫 텍스트 메모 추가',() => addBlock('text'))); blocksHost.append(empty);
    }
    store.data.blocks.forEach((b,index) => {
      const block = el('section','ws-block'); block.dataset.blockId = b.id;
      const bar = el('div','ws-block-bar'), name = {text:'자유 메모',checklist:'할 일',heading:'소제목',regulation:'관련 규제'}[b.type];
      bar.append(el('span','ws-block-type',name));
      const menu = el('details','ws-menu'); const summary = el('summary','','⋯'); summary.setAttribute('aria-label',`${name} 블록 ${index+1} 관리`); menu.append(summary);
      const options = el('div','ws-menu-options');
      for (const [label,delta] of [['위로 이동',-1],['아래로 이동',1]]) {
        const move = button(label,`${name} ${label}`,() => {
          const a = store.data.blocks, next = index+delta; [a[index],a[next]] = [a[next],a[index]]; changed(); render();
          [...blocksHost.children].find(n => n.dataset.blockId === b.id)?.querySelector('summary')?.focus({preventScroll:true});
        }); move.disabled = index+delta < 0 || index+delta >= store.data.blocks.length; options.append(move);
      }
      options.append(button('삭제',`${name} 블록 삭제`,() => {
        store.data.blocks.splice(index,1); rememberDelete({type:'block',value:b,index}); changed(); render();
        if (store.data.blocks.length) focusEditor(store.data.blocks[Math.min(index,store.data.blocks.length-1)].id); else $('workspace-add').focus();
      })); menu.append(options); bar.append(menu); block.append(bar);
      if (b.type === 'text') {
        const heading = el('div','ws-note-heading');
        const title = editor(b.title || '','메모 제목','제목을 입력하거나 아래에 규제를 연결하세요.',value => { b.title = value; }); title.classList.add('ws-note-title');
        const linked = el('div','ws-note-regulations');
        const renderLinks = () => {
          linked.replaceChildren();
          for (const r of b.regulations || []) {
            const node = Format.regulationNode(document,r);
            node.querySelector('[data-ws-reg-open]').addEventListener('click',() => openSavedRegulation(r));
            node.querySelector('[data-ws-reg-remove]').addEventListener('click',() => { b.regulations = b.regulations.filter(i => i.id !== r.id); changed(); renderLinks(); });
            linked.append(node);
          }
        };
        const connect = button('+ 우선검토 규제 연결','메모 상단에 우선검토 규제 링크 추가',() => openPicker(b.id,'heading')); connect.classList.add('ws-reg-insert');
        heading.append(title,linked,connect); block.append(heading); renderLinks();
        const memo = Format.createEditor(b,changed,{pickRegulation:() => openPicker(b.id),openRegulation:r => {
          openSavedRegulation(r);
        }});
        memo.wsEditor.insertHeadingRegulation = r => { (b.regulations ||= []).push(r); renderLinks(); changed(); linked.lastElementChild?.scrollIntoView({block:'nearest'}); };
        memoEditors.set(b.id,memo.wsEditor); block.append(memo);
        block.addEventListener('focusin',() => { activeMemo = b.id; });
      }
      if (b.type === 'heading') block.append(editor(b.content,'소제목 내용','소제목을 입력하세요.',value => { b.content = value; },true));
      if (b.type === 'checklist') {
        const list = el('div','ws-tasks'); block.append(list);
        b.items.forEach((task,taskIndex) => {
          const row = el('div',`ws-task${task.completed ? ' is-complete' : ''}`); row.dataset.taskId = task.id;
          const check = el('input'); check.type = 'checkbox'; check.checked = task.completed; check.setAttribute('aria-label','할 일 완료');
          check.addEventListener('change',() => { task.completed = check.checked; row.classList.toggle('is-complete',task.completed); changed(); });
          const text = editor(task.text,'할 일 내용','할 일을 입력하세요.',value => { task.text = value; });
          row.append(check,text,button('×','할 일 삭제',() => {
            b.items.splice(taskIndex,1); rememberDelete({type:'task',blockId:b.id,value:task,index:taskIndex}); changed(); render(); focusEditor(b.id);
          })); list.append(row);
        });
        const form = el('form','ws-task-add');
        const draft = el('textarea','ws-editor'); draft.rows = 1; draft.value = b.draft || ''; draft.placeholder = '할 일을 추가하세요.'; draft.setAttribute('aria-label','추가할 할 일');
        draft.addEventListener('input',() => { b.draft = draft.value; resize(draft); changed(); });
        const submit = el('button','ws-button','+ 항목 추가'); submit.type = 'submit';
        form.addEventListener('submit',event => {
          event.preventDefault(); if (!draft.value.trim()) { draft.focus(); return; }
          b.items.push({id:uid(),text:draft.value,completed:false}); b.draft = ''; changed(); render();
          [...blocksHost.children].find(n => n.dataset.blockId === b.id)?.querySelector('.ws-task-add textarea')?.focus({preventScroll:true});
        });
        draft.addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
        form.append(draft,submit); block.append(form);
      }
      if (b.type === 'regulation') {
        const r = b.regulation;
        const titleLink = button(r.title,`${r.title} 규제 상세보기`,() => {
          if (!api.getItems().some(item => item.id === r.id)) { $('workspace-notice').textContent = '현재 피드에 없는 게시물입니다. 저장된 원문 링크를 이용하세요.'; return; }
          api.openDetail(r.id);
        }); titleLink.classList.add('ws-reg-link'); block.append(titleLink);
        const meta = el('p','ws-reg-meta',`${r.institution || '기관 미수집'}${r.date ? ` · ${r.date}` : ''}`);
        if (r.url) { const a = el('a','','원문 보기 ↗'); a.href = validURL(r.url); a.target = '_blank'; a.rel = 'noopener noreferrer'; meta.append(' · ',a); }
        block.append(meta,editor(b.content,'관련 규제 메모','이 규제에 대한 메모를 작성하세요.',value => { b.content = value; }));
      }
      blocksHost.append(block);
    });
    if (!body.hidden) blocksHost.querySelectorAll('textarea').forEach(resize);
  }
  function openSavedRegulation(r) {
    if (api.getItems().some(item => item.id === r.id)) api.openDetail(r.id);
    else $('workspace-notice').textContent = '현재 피드에 없는 게시물입니다. 저장된 공식 원문을 이용하세요.';
  }
  function addBlock(type) {
    closeMenus();
    if (type === 'regulation') { openPicker(); return; }
    const block = {id:uid(),type,...(type === 'checklist' ? {items:[],draft:''} : type === 'text' ? {title:'',regulations:[],content:''} : {content:''})};
    store.data.blocks.push(block); store.data.collapsed = false; changed(); render(); focusEditor(block.id);
  }
  function linkedBlock(id) {
    return store.data.blocks.find(b => b.type === 'regulation' && b.regulation.id === id || b.type === 'text' && [...(b.regulations || []),...Format.references(b.format)].some(r => r.id === id));
  }
  function addRegulation(item) {
    return linkToMemo(item);
  }
  function regulationInfo(item) {
    const info = api.regulationInfo(item);
    return {id:item.id,title:item.title,institution:info.institution || '',date:item.date || '',url:validURL(info.url) || ''};
  }
  function linkToMemo(item) {
    const existing = linkedBlock(item.id);
    let target = existing || store.data.blocks.find(b => b.id === activeMemo && b.type === 'text') || store.data.blocks.find(b => b.type === 'text');
    let redraw = store.data.collapsed;
    if (!target) { target = {id:uid(),type:'text',title:'',regulations:[],content:''}; store.data.blocks.push(target); redraw = true; }
    if (store.data.collapsed) { store.data.collapsed = false; changed(); }
    if (redraw) render();
    if (existing) { focusEditor(existing.id); return false; }
    activeMemo = target.id;
    memoEditors.get(target.id).insertHeadingRegulation(regulationInfo(item));
    $('workspace-notice').textContent = '선택한 메모 상단에 규제 링크를 추가했습니다. 여러 규제를 함께 연결할 수 있습니다.';
    return true;
  }
  function openPicker(target = null, placement = 'body') {
    pickerTarget = target; pickerPlacement = placement; pickerSource = 'priority'; closeMenus(); lastFocus = document.activeElement; $('workspace-reg-search').value = ''; pickerResults(); $('workspace-picker').showModal(); $('workspace-reg-search').focus();
  }
  function pickerResults() {
    const query = $('workspace-reg-search').value.trim().toLowerCase(), result = $('workspace-reg-results'); result.replaceChildren();
    const source = pickerSource === 'priority' ? api.getPriorityItems() : api.getItems();
    document.querySelectorAll('[data-ws-source]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.wsSource === pickerSource)));
    const matches = source.filter(i => `${i.title} ${i.dept || ''} ${api.regulationInfo(i).institution || ''}`.toLowerCase().includes(query));
    $('workspace-reg-count').textContent = `${pickerSource === 'priority' ? '우선검토 전체 후보' : '전체 규제'} ${matches.length}건${matches.length > 30 ? ' · 30건 표시, 검색으로 좁혀 보세요.' : ''}`;
    for (const item of matches.slice(0,30)) {
      const row = el('div','ws-picker-row'); row.append(el('span','',item.title));
      const exists = Boolean(linkedBlock(item.id));
      const add = button(exists ? '추가됨' : '추가',`${item.title} Workspace에 추가`,() => {
        if (pickerTarget) {
          const target = memoEditors.get(pickerTarget);
          if (!target) { $('workspace-reg-count').textContent = '메모가 변경되었습니다. 닫고 다시 선택해 주세요.'; return; }
          if (linkedBlock(item.id)) { pickerResults(); return; }
          const returnFocus = lastFocus; lastFocus = null; $('workspace-picker').close();
          if (pickerPlacement === 'heading') { target.insertHeadingRegulation(regulationInfo(item)); if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true}); }
          else target.insertRegulation(regulationInfo(item));
          $('workspace-notice').textContent = pickerPlacement === 'heading' ? '메모 상단에 규제 링크를 추가했습니다. 같은 메모에 계속 연결할 수 있습니다.' : '메모 안에 규제 링크를 추가했습니다.'; return;
        }
        addRegulation(item); $('workspace-picker').close();
      }); add.disabled = exists; row.append(add); result.append(row);
    }
    if (!matches.length) result.append(el('p','',pickerSource === 'priority' ? '해당하는 우선검토 안건이 없습니다. 우선검토에 안건을 추가하거나 전체 규제에서 찾아보세요.' : '검색 결과가 없습니다.'));
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([value],{type:'application/json;charset=utf-8'}));
    const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),10000);
  }
  function showConfirm(kind, value) {
    closeMenus(); lastFocus = document.activeElement; importCandidate = value;
    const dialog = $('workspace-confirm'); dialog.dataset.kind = kind;
    $('workspace-confirm-text').textContent = kind === 'import' ? '가져온 파일로 현재 Workspace 전체를 덮어쓸까요? 필요한 내용은 먼저 내보내기로 백업하세요.' : kind === 'remote' ? '현재 화면의 작성 내용을 다른 탭에 저장된 Workspace로 바꿀까요? 저장하지 못한 내용은 먼저 내보내세요.' : 'Workspace의 모든 메모와 할 일을 비울까요? 필요한 내용은 먼저 내보내기로 백업하세요. RegWatch 확인 기록과 우선검토 설정은 유지됩니다.';
    if (kind === 'import') $('workspace-confirm-text').textContent += value.geminiAnalyses ? ' 포함된 Gemini 분석 이력과 규제별 개인 의견도 백업 내용으로 바뀝니다.' : ' 이전 형식의 백업이므로 현재 Gemini 분석 이력과 규제별 개인 의견은 유지됩니다.';
    if (kind === 'clear') $('workspace-confirm-text').textContent += ' Gemini 분석 이력과 규제별 개인 의견은 분석 보관함에 유지됩니다.';
    dialog.showModal(); $('workspace-confirm-cancel').focus();
  }
  function init(options) {
    api = options; host = $('my-workspace'); if (!host || store) return;
    body = $('workspace-body'); blocksHost = $('workspace-blocks');
    // Access to the storage property itself can throw in restricted browsers.
    store = createStore({getItem:key => localStorage.getItem(key),setItem:(key,value) => localStorage.setItem(key,value)});
    $('workspace-add').addEventListener('click',() => addBlock('text'));
    host.addEventListener('toggle',event => { const d = event.target; if (d.matches('details.ws-menu') && d.open) host.querySelectorAll('details.ws-menu[open]').forEach(other => { if (other !== d) other.open = false; }); },true);
    host.addEventListener('keydown',event => { if (event.key === 'Escape') { const active = document.activeElement.closest('details'); closeMenus(); active?.querySelector('summary')?.focus(); } });
    document.addEventListener('click',event => { if (!host.contains(event.target)) closeMenus(); });
    $('workspace-toggle').addEventListener('click',() => { store.data.collapsed = !store.data.collapsed; changed(); render(); });
    $('workspace-export').addEventListener('click',() => { closeMenus(); download(JSON.stringify({...store.data,...(window.RegWatchGeminiAnalyses ? {geminiAnalyses:window.RegWatchGeminiAnalyses.exportData()} : {})},null,2),`regwatch-workspace-${new Date().toISOString().slice(0,10)}.json`); });
    $('workspace-raw-export').addEventListener('click',() => download(store.invalidRaw,'regwatch-workspace-original.json'));
    $('workspace-clear').addEventListener('click',() => showConfirm('clear'));
    $('workspace-import').addEventListener('click',() => { closeMenus(); $('workspace-import-file').click(); });
    $('workspace-import-file').addEventListener('change',async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        if (file.size > 20*1024*1024) throw new Error('파일이 너무 큽니다. 20MB 이하의 Workspace JSON 파일을 선택하세요.');
        const parsed = JSON.parse(await file.text()), next = validate(parsed);
        const geminiAnalyses = parsed.geminiAnalyses === undefined ? null : window.RegWatchGeminiAnalysis.validateData(parsed.geminiAnalyses);
        showConfirm('import',{workspace:next,geminiAnalyses});
      } catch (e) { $('workspace-notice').textContent = `가져오기 실패 · ${e.message}`; }
      finally { event.target.value = ''; }
    });
    $('workspace-confirm-cancel').addEventListener('click',() => $('workspace-confirm').close());
    $('workspace-confirm-apply').addEventListener('click',() => {
      const kind = $('workspace-confirm').dataset.kind;
      try {
        const next = validate(kind === 'clear' ? {version:1,collapsed:false,updatedAt:null,blocks:[]} : kind === 'remote' ? JSON.parse(localStorage.getItem(KEY) || JSON.stringify(initial())) : importCandidate.workspace);
        if (kind === 'import' && importCandidate.geminiAnalyses) {
          const saved = {...next,updatedAt:new Date().toISOString()}, raw = JSON.stringify(saved), analyses = window.RegWatchGeminiAnalysis.validateData(importCandidate.geminiAnalyses);
          window.RegWatchGeminiAnalysis.commitBackup(localStorage,[[window.RegWatchGeminiAnalysis.KEY,JSON.stringify(analyses)],[KEY,raw]]);
          clearTimeout(timer); store.adoptSaved(saved,raw); window.RegWatchGeminiAnalyses.reload(true);
        } else { store.replace(next); flush(); }
        undo = null; $('workspace-undo').hidden = true; $('workspace-confirm').close();
        render(); status(); $('workspace-notice').textContent = kind === 'clear' ? 'Workspace를 비웠습니다. Gemini 분석·규제별 개인 의견은 분석 보관함에 유지됩니다.' : 'Workspace 내용을 불러왔습니다.'; $('workspace-toggle').focus();
      } catch (e) { $('workspace-notice').textContent = `변경하지 못했습니다 · ${e.message}`; $('workspace-confirm').close(); }
    });
    $('workspace-confirm').addEventListener('close',() => { importCandidate = null; if (lastFocus?.isConnected) lastFocus.focus({preventScroll:true}); });
    $('workspace-reg-search').addEventListener('input',pickerResults);
    document.querySelectorAll('[data-ws-source]').forEach(b => b.addEventListener('click',() => { pickerSource = b.dataset.wsSource; pickerResults(); }));
    $('workspace-picker-close').addEventListener('click',() => $('workspace-picker').close());
    $('workspace-picker').addEventListener('close',() => { if (lastFocus?.isConnected) lastFocus.focus({preventScroll:true}); });
    $('workspace-retry').addEventListener('click',flush);
    $('workspace-conflict').addEventListener('click',() => showConfirm('remote'));
    $('workspace-undo').addEventListener('click',() => {
      if (!undo) return;
      if (undo.type === 'block') {
        const same = undo.value.type === 'regulation' && linkedBlock(undo.value.regulation.id);
        if (same) {
          if (undo.value.content && !same.content.includes(undo.value.content)) {
            if (same.type === 'text') store.data.blocks.splice(store.data.blocks.indexOf(same)+1,0,{id:uid(),type:'text',content:undo.value.content});
            else same.content = [same.content,undo.value.content].filter(Boolean).join('\n\n');
          }
        } else {
          const restored = undo.value;
          if (restored.type === 'text') {
            restored.regulations = (restored.regulations || []).filter(r => !linkedBlock(r.id));
            if (restored.format) {
              const clean = nodes => nodes.map(n => n.regulation && linkedBlock(n.regulation.id) ? {text:`[이미 연결된 규제] ${n.regulation.title}`} : n.children ? {...n,children:clean(n.children)} : n);
              restored.format = {...restored.format,children:clean(restored.format.children)}; restored.content = Format.plainText(restored.format);
            }
          }
          store.data.blocks.splice(Math.min(undo.index,store.data.blocks.length),0,restored);
        }
      }
      else {
        const block = store.data.blocks.find(b => b.id === undo.blockId);
        if (!block) { $('workspace-notice').textContent = '할 일이 있던 블록이 삭제되어 복원할 수 없습니다.'; return; }
        block.items.splice(Math.min(undo.index,block.items.length),0,undo.value);
      }
      undo = null; $('workspace-undo').hidden = true; $('workspace-notice').textContent = '삭제를 되돌렸습니다.'; changed(); render();
    });
    window.addEventListener('pagehide',() => { if (store.dirty) flush(); });
    document.addEventListener('visibilitychange',() => { if (document.hidden && store.dirty) flush(); });
    window.addEventListener('beforeunload',event => { if (store.dirty) { flush(); if (store.dirty) { event.preventDefault(); event.returnValue = ''; } } });
    window.addEventListener('storage',event => {
      if (event.key !== KEY && event.key !== null) return;
      store.receive(event.key === null ? null : event.newValue,host.contains(document.activeElement));
      if (!store.conflict) render(); status();
    });
    window.RegWatchGeminiAnalyses?.init({getItem:id => api.getItems().find(i => i.id === id)});
    render(); status();
  }
  function getLinkedRegulations() {
    return store.data.blocks.flatMap(b => b.type === 'regulation' ? [b.regulation] : b.type === 'text' ? [...(b.regulations || []),...Format.references(b.format)] : []);
  }
  function convertGeminiChecksToTasks(item,analysis) {
    linkToMemo(item);
    let block = linkedBlock(item.id);
    if (block.type === 'regulation') {
      const replacement = {id:block.id,type:'text',title:'',regulations:[block.regulation],content:block.content};
      store.data.blocks.splice(store.data.blocks.indexOf(block),1,replacement); block = replacement;
    }
    const existing = new Set(store.data.blocks.flatMap(b => b.type === 'text' ? Format.checklists(b.format).flatMap(c => c.items.map(t => t.id)) : b.type === 'checklist' ? b.items.map(t => t.id) : []));
    const tasks = analysis.recommendedChecks.map((text,i) => ({id:`gemini-task-${analysis.id}-${i}`,text,completed:false})).filter(t => !existing.has(t.id));
    if (!tasks.length) return 0;
    const format = block.format || {version:1,children:block.content ? [{text:block.content}] : []};
    block.format = {...format,children:[...format.children,{checklist:{items:tasks,draft:''}}]}; block.content = Format.plainText(block.format);
    changed(); render(); return tasks.length;
  }
  window.RegWatchWorkspace = {init, addRegulation, linkToMemo, getLinkedRegulations, convertGeminiChecksToTasks, hasRegulation:id => Boolean(linkedBlock(id)), saveNow:flush};
})();
