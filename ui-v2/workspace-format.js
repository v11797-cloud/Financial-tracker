/* Small memo formatting control. Only text and explicitly allowed styles are stored. */
(() => {
  'use strict';
  const TAGS = new Set(['p','h3','h4','br','span','strong','em','u','ul','ol','li','hr']);
  const SIZES = [12,14,16,18,20,24,28,32];
  const BLOCKS = new Set(['p','h3','h4','ul','ol','li','hr']);
  function validateRegulation(r) {
    const fail = () => { throw new Error('규제 링크 데이터가 올바르지 않습니다.'); };
    if (!r || !['id','title','institution','date','url'].every(k => typeof r[k] === 'string') || !r.id.trim() || !r.title.trim()) fail();
    if (r.url) {
      try { const u = new URL(r.url); if (!['https:','http:'].includes(u.protocol) || u.username || u.password) fail(); } catch { fail(); }
    }
    return {id:r.id,title:r.title,institution:r.institution,date:r.date,url:r.url};
  }
  function references(format) {
    return (format?.children || []).flatMap(n => n.regulation ? [n.regulation] : references(n));
  }
  function checklists(format) {
    return (format?.children || []).flatMap(n => n.checklist ? [n.checklist] : checklists(n));
  }
  function validateChecklist(value) {
    if (!value || !Array.isArray(value.items) || typeof value.draft !== 'string') throw new Error('체크리스트 데이터가 올바르지 않습니다.');
    const ids = new Set();
    const items = value.items.map(t => {
      if (!t || typeof t.id !== 'string' || !t.id.trim() || ids.has(t.id) || typeof t.text !== 'string' || typeof t.completed !== 'boolean') throw new Error('체크리스트 항목이 올바르지 않습니다.');
      ids.add(t.id); return {id:t.id,text:t.text,completed:t.completed};
    });
    return {items,draft:value.draft};
  }
  function checklistNode(doc,value) {
    const atom = doc.createElement('div'); atom.className = 'ws-inline-checklist'; atom.contentEditable = 'false'; atom.dataset.wsChecklist = 'true';
    const bar = doc.createElement('div'); bar.className = 'ws-checklist-bar';
    const label = doc.createElement('span'); label.textContent = '체크리스트';
    const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'ws-button'; remove.textContent = '×'; remove.setAttribute('aria-label','본문 체크리스트 삭제');
    const notify = () => atom.dispatchEvent(new Event('input',{bubbles:true}));
    remove.addEventListener('click',() => { const root = atom.parentElement.closest('[contenteditable="true"]'); atom.remove(); root?.dispatchEvent(new Event('input',{bubbles:true})); });
    bar.append(label,remove); atom.append(bar);
    const list = doc.createElement('div'); atom.append(list);
    const input = (text,name,placeholder) => { const n = doc.createElement('textarea'); n.className = 'ws-editor'; n.rows = 1; n.value = text; n.placeholder = placeholder; n.setAttribute('aria-label',name); return n; };
    const resize = n => { n.style.height = 'auto'; n.style.height = `${Math.max(n.scrollHeight,36)}px`; };
    const makeItem = task => {
      const row = doc.createElement('div'); row.className = `ws-task${task.completed ? ' is-complete' : ''}`; row.dataset.wsTask = task.id;
      const check = doc.createElement('input'); check.type = 'checkbox'; check.checked = task.completed; check.setAttribute('aria-label','본문 할 일 완료');
      check.addEventListener('change',() => row.classList.toggle('is-complete',check.checked));
      const text = input(task.text,'본문 할 일 내용','할 일을 입력하세요.'); text.addEventListener('input',() => resize(text));
      const del = doc.createElement('button'); del.type = 'button'; del.className = 'ws-button'; del.textContent = '×'; del.setAttribute('aria-label','본문 할 일 삭제');
      del.addEventListener('click',() => { row.remove(); draft.focus({preventScroll:true}); notify(); });
      row.append(check,text,del); list.append(row); return row;
    };
    const form = doc.createElement('div'); form.className = 'ws-task-add';
    const draft = input(value.draft,'본문 추가할 할 일','할 일 입력 후 Enter'); draft.dataset.wsTaskDraft = 'true'; draft.addEventListener('input',() => resize(draft));
    const add = doc.createElement('button'); add.type = 'button'; add.className = 'ws-button'; add.textContent = '+ 항목 추가';
    const submit = () => { if (!draft.value.trim()) { draft.focus(); return; } makeItem({id:`task-${crypto.randomUUID()}`,text:draft.value,completed:false}); draft.value = ''; resize(draft); draft.focus({preventScroll:true}); notify(); };
    add.addEventListener('click',submit);
    draft.addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); } });
    form.append(draft,add); atom.append(form); value.items.forEach(makeItem); return atom;
  }
  function regulationNode(doc,r) {
    const atom = doc.createElement('span'); atom.className = 'ws-inline-reg'; atom.contentEditable = 'false'; atom.dataset.wsReference = JSON.stringify(r);
    const label = doc.createElement('span'); label.className = 'ws-inline-reg-label'; label.textContent = '연결된 규제';
    const title = doc.createElement('button'); title.type = 'button'; title.className = 'ws-inline-reg-title'; title.textContent = r.title; title.dataset.wsRegOpen = 'true'; title.setAttribute('aria-label',`${r.title} 규제 상세보기`);
    const meta = doc.createElement('span'); meta.className = 'ws-reg-meta'; meta.textContent = [r.institution,r.date].filter(Boolean).join(' · ');
    if (r.url) { const link = doc.createElement('a'); link.href = r.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '공식 원문 ↗'; meta.append(' · ',link); }
    const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'ws-inline-reg-remove ws-button'; remove.textContent = '×'; remove.dataset.wsRegRemove = 'true'; remove.setAttribute('aria-label',`${r.title} 메모에서 규제 링크 삭제`);
    atom.append(label,title,meta,remove);
    doc.defaultView?.RegWatchGeminiAnalyses?.renderGeminiAnalysisSummary(atom,r);
    return atom;
  }
  function validate(value) {
    const fail = () => { throw new Error('메모 서식 데이터가 올바르지 않습니다.'); };
    if (!value || value.version !== 1 || !Array.isArray(value.children)) fail();
    const regulationIds = new Set();
    function node(n, depth) {
      if (!n || typeof n !== 'object' || depth > 32) fail();
      if (Object.hasOwn(n,'checklist')) return {checklist:validateChecklist(n.checklist)};
      if (Object.hasOwn(n,'regulation')) { const r = validateRegulation(n.regulation); if (regulationIds.has(r.id)) fail(); regulationIds.add(r.id); return {regulation:r}; }
      if (Object.hasOwn(n,'text')) { if (typeof n.text !== 'string') fail(); return {text:n.text}; }
      if (!TAGS.has(n.tag) || !Array.isArray(n.children) || (n.size !== undefined && !SIZES.includes(n.size))) fail();
      return {tag:n.tag,...(n.size === undefined ? {} : {size:n.size}),children:n.children.map(c => node(c,depth+1))};
    }
    return {version:1,children:value.children.map(n => node(n,0))};
  }
  function plainText(format) {
    const isBlock = n => Boolean(n.regulation || n.checklist) || BLOCKS.has(n.tag);
    function join(nodes) {
      return nodes.map((n,i) => `${i && (isBlock(n) || isBlock(nodes[i-1])) ? '\n' : ''}${n.checklist ? [...n.checklist.items.map(t => `${t.completed ? '☑' : '☐'} ${t.text}`),n.checklist.draft].filter(Boolean).join('\n') : n.regulation ? `[규제] ${n.regulation.title}\n${[n.regulation.institution,n.regulation.date,n.regulation.url].filter(Boolean).join(' · ')}` : Object.hasOwn(n,'text') ? n.text : n.tag === 'br' ? '\n' : n.tag === 'hr' ? '────────' : join(n.children)}`).join('');
    }
    return join(format.children);
  }
  function readDOM(root) {
    function children(parent,depth) {
      const nodes = [...parent.childNodes], last = nodes[nodes.length-1];
      // Contenteditable adds a final BR as a caret placeholder on empty lines.
      if ((parent === root || /^(DIV|P|H[1-4])$/.test(parent.tagName)) && last?.nodeName === 'BR' && (nodes.length === 1 || nodes[nodes.length-2].nodeName === 'BR')) nodes.pop();
      return nodes.map(n => read(n,depth));
    }
    function read(n,depth) {
      if (n.nodeType === 3) return {text:n.nodeValue || ''};
      if (n.nodeType !== 1) return {text:''};
      if (n.dataset.wsChecklist) return {checklist:{items:[...n.querySelectorAll('[data-ws-task]')].map(row => ({id:row.dataset.wsTask,text:row.querySelector('textarea').value,completed:row.querySelector('input').checked})),draft:n.querySelector('[data-ws-task-draft]').value}};
      if (n.dataset.wsReference) { try { return {regulation:validateRegulation(JSON.parse(n.dataset.wsReference))}; } catch { return {text:n.textContent || ''}; } }
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|SVG|IMG|VIDEO|AUDIO)$/.test(n.tagName)) return {text:''};
      if (depth > 24) return {text:n.textContent || ''};
      let tag = n.tagName.toLowerCase();
      tag = ({div:'p',h1:'h3',h2:'h3',b:'strong',i:'em',font:'span'})[tag] || tag;
      if (!TAGS.has(tag)) tag = 'span';
      const size = Number.parseFloat(n.style.fontSize);
      const content = {tag,...(SIZES.includes(size) ? {size} : {}),children:children(n,depth+1)};
      // Browser editing engines may express bold as a styled span.
      return (n.style.fontWeight === 'bold' || Number(n.style.fontWeight) >= 600) && tag !== 'strong' ? {tag:'strong',children:[content]} : content;
    }
    return {version:1,children:children(root,0)};
  }
  function writeDOM(root,format) {
    const doc = root.ownerDocument;
    function make(n) {
      if (n.regulation) return regulationNode(doc,n.regulation);
      if (n.checklist) return checklistNode(doc,n.checklist);
      if (Object.hasOwn(n,'text')) return doc.createTextNode(n.text);
      const element = doc.createElement(n.tag === 'p' ? 'div' : n.tag);
      if (n.size !== undefined) element.style.fontSize = `${n.size}px`;
      for (const child of n.children) element.append(make(child));
      if (BLOCKS.has(n.tag) && !['hr','ul','ol'].includes(n.tag) && !n.children.length) element.append(doc.createElement('br'));
      return element;
    }
    root.replaceChildren(...format.children.map(make));
  }
  function createEditor(block,change,options = {}) {
    const doc = document, group = doc.createElement('div'), toolbar = doc.createElement('div'), root = doc.createElement('div');
    group.className = 'ws-memo'; toolbar.className = 'ws-formatbar'; toolbar.setAttribute('role','group'); toolbar.setAttribute('aria-label','메모 서식');
    root.className = 'ws-editor ws-rich-editor'; root.contentEditable = 'true'; root.spellcheck = false;
    root.setAttribute('role','textbox'); root.setAttribute('aria-label','자유 메모 내용'); root.setAttribute('aria-multiline','true');
    root.setAttribute('aria-placeholder','검토 내용이나 아이디어를 자유롭게 작성하세요.');
    if (block.format) writeDOM(root,block.format); else root.textContent = block.content;
    let range = null;
    const select = (name,entries) => {
      const input = doc.createElement('select'); input.setAttribute('aria-label',name);
      for (const [value,text] of entries) { const option = doc.createElement('option'); option.value = value; option.textContent = text; input.append(option); }
      return input;
    };
    const paragraph = select('메모 문단 스타일',[['p','본문'],['h3','소제목'],['h4','작은 소제목']]);
    const size = select('메모 글자 크기',SIZES.map(n => [String(n),`${n}px`])); size.value = '14';
    const bold = doc.createElement('button'); bold.type = 'button'; bold.className = 'ws-button ws-bold'; bold.textContent = 'B'; bold.setAttribute('aria-label','메모 굵게'); bold.setAttribute('aria-pressed','false');
    function remember() {
      const selection = doc.getSelection();
      if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
      range = selection.getRangeAt(0).cloneRange();
      let node = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
      let blockNode = node;
      while (blockNode && blockNode !== root && !/^(P|DIV|H3|H4)$/.test(blockNode.tagName)) blockNode = blockNode.parentElement;
      paragraph.value = blockNode?.tagName === 'H3' ? 'h3' : blockNode?.tagName === 'H4' ? 'h4' : 'p';
      const pixels = Math.round(parseFloat(getComputedStyle(node).fontSize));
      if (SIZES.includes(pixels)) size.value = String(pixels);
      bold.setAttribute('aria-pressed',String(doc.queryCommandState('bold')));
    }
    function update() {
      block.format = readDOM(root); block.content = plainText(block.format);
      root.dataset.empty = String(!block.content && !root.querySelector('[data-ws-checklist],[data-ws-reference]')); remember(); change();
    }
    function restore() {
      let saved = range?.cloneRange();
      root.focus({preventScroll:true}); const selection = doc.getSelection(); selection.removeAllRanges();
      if (!saved || !root.contains(saved.commonAncestorContainer)) { saved = doc.createRange(); saved.selectNodeContents(root); saved.collapse(false); }
      range = saved; selection.addRange(saved);
    }
    function apply(command,value) {
      restore(); doc.execCommand(command,false,value); update();
    }
    function insert(node) {
      restore(); const selected = doc.getSelection().getRangeAt(0); selected.collapse(false);
      const rest = doc.createRange(); rest.setStart(selected.startContainer,selected.startOffset); rest.setEnd(root,root.childNodes.length);
      const tail = rest.extractContents();
      root.append(node);
      if (!tail.hasChildNodes() || (!tail.textContent && !tail.querySelector('br,[data-ws-reference],[data-ws-checklist]'))) { const paragraph = doc.createElement('div'); paragraph.append(doc.createElement('br')); tail.replaceChildren(paragraph); }
      const next = tail.firstChild; root.append(tail);
      const caret = doc.createRange(); caret.selectNodeContents(next); caret.collapse(true); doc.getSelection().removeAllRanges(); doc.getSelection().addRange(caret);
      range = caret.cloneRange(); update(); root.focus({preventScroll:true}); node.scrollIntoView({block:'nearest'});
    }
    group.wsEditor = {insertRegulation:r => insert(regulationNode(doc,validateRegulation(r)))};
    root.addEventListener('click',event => {
      const atom = event.target.closest('[data-ws-reference]'); if (!atom || !root.contains(atom)) return;
      if (event.target.closest('[data-ws-reg-open]')) { event.preventDefault(); options.openRegulation?.(validateRegulation(JSON.parse(atom.dataset.wsReference))); }
      if (event.target.closest('[data-ws-reg-remove]')) {
        event.preventDefault(); event.stopPropagation();
        // Native delete can leave a noneditable atom in place beside another widget.
        // Remove only this reference and keep the caret at its former position.
        const caret = doc.createRange(); caret.setStartBefore(atom); caret.collapse(true);
        atom.remove(); range = caret; restore(); update();
      }
    });
    paragraph.addEventListener('change',() => { const value = paragraph.value; apply('formatBlock',value); });
    size.addEventListener('change',() => {
      const pixels = Number(size.value); restore();
      doc.execCommand('styleWithCSS',false,false); doc.execCommand('fontSize',false,'7');
      // Keep the selection intact; serialization converts FONT to a safe styled span.
      root.querySelectorAll('font[size="7"]').forEach(n => { n.style.fontSize = `${pixels}px`; n.removeAttribute('size'); });
      update();
    });
    bold.addEventListener('click',() => apply('bold'));
    toolbar.addEventListener('pointerdown',remember);
    root.addEventListener('input',update);
    root.addEventListener('keydown',event => { if (event.target === root && event.key === 'Enter' && event.shiftKey && !event.isComposing) { event.preventDefault(); apply('insertText','\n'); } });
    for (const name of ['keyup','pointerup','blur','focus']) root.addEventListener(name,remember);
    root.addEventListener('paste',event => { if (event.target !== root) return; event.preventDefault(); apply('insertText',event.clipboardData?.getData('text/plain') || ''); });
    root.addEventListener('drop',event => { if (event.target !== root) return; event.preventDefault(); apply('insertText',event.dataTransfer?.getData('text/plain') || ''); });
    root.dataset.empty = String(!block.content && !root.querySelector('[data-ws-checklist],[data-ws-reference]'));
    const actions = doc.createElement('div'); actions.className = 'ws-insert-actions';
    const regulation = doc.createElement('button'); regulation.type = 'button'; regulation.className = 'ws-reg-insert'; regulation.textContent = '+ 규제 링크'; regulation.setAttribute('aria-label','메모 안에 규제 링크 추가');
    regulation.addEventListener('click',() => options.pickRegulation?.());
    const menu = doc.createElement('details'); menu.className = 'ws-menu ws-memo-insert-menu';
    const summary = doc.createElement('summary'); summary.textContent = '+ 내용 추가'; summary.setAttribute('aria-label','메모 안에 내용 추가');
    const choices = doc.createElement('div'); choices.className = 'ws-menu-options';
    for (const [label,action] of [['체크리스트',() => { const node = checklistNode(doc,{items:[],draft:''}); insert(node); node.querySelector('[data-ws-task-draft]').focus({preventScroll:true}); }],['규제 링크',() => options.pickRegulation?.()],['소제목',() => apply('formatBlock','h3')],['글머리 목록',() => apply('insertUnorderedList')],['번호 목록',() => apply('insertOrderedList')],['구분선',() => insert(doc.createElement('hr'))]]) {
      const item = doc.createElement('button'); item.type = 'button'; item.textContent = label;
      if (label === '규제 링크') item.className = 'ws-reg-menu-featured';
      item.addEventListener('click',() => { menu.open = false; action(); }); choices.append(item);
    }
    menu.append(summary,choices); actions.append(regulation,menu);
    toolbar.append(paragraph,size,bold,actions); group.append(toolbar,root); return group;
  }
  const api = {validate,validateRegulation,references,checklists,regulationNode,plainText,readDOM,writeDOM,createEditor};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.RegWatchWorkspaceFormat = api;
})();
