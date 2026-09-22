/* Isolated UI 2.0. Reads the production data globals without modifying them. */
(() => {
  'use strict';
  const DAY = 86400000;
  const CATEGORIES = ['보도자료', '입법예고', '공포법령', '금융시장동향'];
  const LAW_RULES = {
    자본시장: title => title.includes('자본시장과 금융투자업에 관한 법률') || title.includes('자본시장법'),
    금융소비자: title => title.includes('금융소비자 보호에 관한 법률') || title.includes('금소법'),
    금융투자업규정: title => title.includes('금융투자업규정'),
    지배구조: title => title.includes('금융회사의 지배구조에 관한 법률') || title.includes('지배구조법')
  };
  const LAW_LABELS = { all: '전체', 자본시장: '자본시장법', 금융소비자: '금융소비자보호법', 금융투자업규정: '금융투자업규정', 지배구조: '지배구조법', 협회규정: '협회규정', 모범규준: '모범규준' };
  function matchesLaw(item, law = 'all') {
    if (law === '협회규정' || law === '모범규준') return item.source === 'KOFIA' && item.source_group === law;
    return !LAW_RULES[law] || LAW_RULES[law](item.title);
  }
  const ASSET_TERMS = ['자산운용', '집합투자', '펀드', '투자신탁', 'ETF', 'ETN', '자본시장', '금융투자', '증권', '파생상품', '공매도', '의결권'];
  const COMMON_TERMS = ['내부통제', '책무구조도', '지배구조', '금융소비자', '금소법', '자금세탁', '특금법', '전자금융', '개인정보'];
  const CHANGE_RE = /개정|도입|개선|강화|시행|규정|가이드라인|준수|의무|변경/;
  function dayNumber(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (y < 1000) return null;
    const utc = Date.UTC(y, m - 1, d), date = new Date(utc);
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? utc / DAY : null;
  }
  function kstToday(now = new Date()) { return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
  function daysUntil(value, today) {
    const a = dayNumber(value), b = dayNumber(today);
    return a === null || b === null ? null : a - b;
  }
  function dDay(value, today) {
    const n = daysUntil(value, today);
    return n === null ? '시행일 미수집' : n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : '시행일 경과';
  }
  function effectiveDate(item) { return item.category === '공포법령' && dayNumber(item.enf_date) !== null ? item.enf_date : null; }
  function noticeEndDate(item) { return item.category === '입법예고' && dayNumber(item.notice_end_date) !== null ? item.notice_end_date : null; }
  function kofiaItems(payload) {
    if (!payload || payload.schema_version !== 1 || payload.source !== 'KOFIA' || !Array.isArray(payload.items)) return [];
    return payload.items.filter(item => item && item.source === 'KOFIA' && (
      (item.category === '입법예고' && /^kofia_notice_\d+$/.test(item.id) && /^\d{1,12}$/.test(item.notice_seq)) ||
      (item.category === '공포법령' && /^kofia_revision_\d+$/.test(item.id) && ['협회규정', '모범규준'].includes(item.source_group) && Array.isArray(item.classification_path) && item.classification_path[0] === item.source_group)
    ));
  }
  function hasReasonView(item) {
    const name = String(item.law_name || '').replace(/\s+/g, '');
    return item.category === '공포법령' && item.source !== 'KOFIA' && ['자본시장과금융투자업에관한법률', '금융소비자보호에관한법률', '금융투자업규정'].some(prefix => name.startsWith(prefix));
  }
  function sourceURL(item, baseURI) {
    if (hasReasonView(item)) return new URL(`./law-reason.html?id=${encodeURIComponent(item.id)}`, baseURI).href;
    if (item.source === 'KOFIA' && item.category === '입법예고') {
      return /^\d{1,12}$/.test(item.notice_seq) ? new URL(`./kofia-notice.html?revisionSeq=${item.notice_seq}`, baseURI).href : null;
    }
    return safeURL(item.url);
  }
  function safeURL(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
  }
  function stableURL(value) {
    const safe = safeURL(value);
    if (!safe) return '';
    const u = new URL(safe);
    for (const key of [...u.searchParams.keys()]) if (/^(srch|curPage$|pageIndex$|menuNo$)/.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    return u.href;
  }
  function fingerprint(item) {
    const parts = [item.title, item.date, item.enf_date || '', item.dept, item.category, item.law_name || '', item.prom_no || '', stableURL(item.url)];
    // Keep the existing fingerprint unchanged for all pre-KOFIA records.
    if (item.source === 'KOFIA') parts.push(item.notice_end_date || '', item.source_group || '', item.notice_seq || '', item.history_seq || '', item.revision_type || '');
    return JSON.stringify(parts);
  }
  function relevance(item) {
    const text = `${item.title || ''} ${item.dept || ''}`.toLowerCase();
    const direct = ASSET_TERMS.filter(term => text.includes(term.toLowerCase()));
    const common = COMMON_TERMS.filter(term => text.includes(term.toLowerCase()));
    return { direct, common, candidate: direct.length > 0 || common.length > 0 };
  }
  function priority(item, today) {
    const due = daysUntil(effectiveDate(item), today);
    const noticeDue = daysUntil(noticeEndDate(item), today);
    const age = daysUntil(item.date, today);
    const related = relevance(item).candidate;
    if (due !== null && due >= 0 && due <= 30) return { tier: 3, reason: due === 0 ? '오늘 시행 예정' : `${due}일 후 시행 예정` };
    if (noticeDue !== null && noticeDue < 0) return { tier: 0, reason: '예고 기간 종료' };
    if (noticeDue !== null && noticeDue <= 30) return { tier: 2, reason: noticeDue === 0 ? '오늘 예고종료' : `예고종료까지 ${noticeDue}일` };
    if (item.category === '입법예고' && age !== null && age <= 0 && age >= -30 && related) return { tier: 2, reason: '최근 입법예고 · 관련 키워드' };
    if (item.category === '보도자료' && age !== null && age <= 0 && age >= -14 && related && CHANGE_RE.test(item.title)) return { tier: 1, reason: '최근 업무 변경 · 관련 키워드' };
    return { tier: 0, reason: '일반 모니터링' };
  }
  function isRead(item, records) { return Object.prototype.hasOwnProperty.call(records, item.id) && records[item.id] === fingerprint(item); }
  function filterItems(items, state, today, records) {
    return items.filter(item => {
      if (state.scope === 'asset' && !relevance(item).candidate) return false;
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (state.unread && isRead(item, records)) return false;
      if (state.focus === 'today' && item.date !== today) return false;
      if (state.focus === 'priority' && (state.priorityIds ? !state.priorityIds.includes(item.id) : !priority(item, today).tier)) return false;
      if (state.focus === 'unread' && isRead(item, records)) return false;
      if (state.focus === 'upcoming') { const due = daysUntil(effectiveDate(item), today); if (due === null || due < 0 || due > 30) return false; }
      if (!matchesLaw(item, state.law)) return false;
      const search = state.search.trim().toLowerCase();
      return !search || `${item.title} ${item.dept} ${item.category} ${item.law_name || ''}`.toLowerCase().includes(search);
    });
  }
  function sortItems(items, mode, today) {
    const latest = (a, b) => (dayNumber(b.date) ?? -Infinity) - (dayNumber(a.date) ?? -Infinity) || a.id.localeCompare(b.id);
    const dueOrder = item => { const n = daysUntil(effectiveDate(item) || (mode === 'priority' ? noticeEndDate(item) : null), today); return n === null || n < 0 ? Infinity : n; };
    return [...items].sort((a, b) => {
      if (mode === 'priority') return priority(b, today).tier - priority(a, today).tier || dueOrder(a) - dueOrder(b) || latest(a, b);
      if (mode === 'effective') return dueOrder(a) - dueOrder(b) || latest(a, b);
      if (mode === 'oldest') return (dayNumber(a.date) ?? Infinity) - (dayNumber(b.date) ?? Infinity) || a.id.localeCompare(b.id);
      return latest(a, b);
    });
  }
  function calendarCells(year, month) {
    const start = Date.UTC(year, month, 1), firstDay = new Date(start).getUTCDay();
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const count = Math.ceil((firstDay + last) / 7) * 7;
    return Array.from({ length: count }, (_, i) => new Date(start + (i - firstDay) * DAY).toISOString().slice(0, 10));
  }
  // CommonJS exposes pure functions only for the optional, dependency-free test suite.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { dayNumber, kstToday, daysUntil, dDay, effectiveDate, noticeEndDate, kofiaItems, hasReasonView, sourceURL, safeURL, fingerprint, relevance, priority, isRead, filterItems, sortItems, calendarCells, LAW_RULES, matchesLaw };
    return;
  }
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const categoryName = value => value === '공포법령' ? '공포/시행 법령' : value;
  const categoryClass = value => ({ 보도자료: 'press', 입법예고: 'notice', 공포법령: 'law', 금융시장동향: 'trend' }[value] || 'neutral');
  const badge = item => `<span class="badge ${categoryClass(item.category)}">${esc(item.source === 'KOFIA' ? item.source_group || '규정 제·개정예고' : categoryName(item.category))}</span>`;
  const dateLabel = item => item.source === 'KOFIA' ? (item.category === '입법예고' ? '예고시작일' : '제·개정일') : item.category !== '공포법령' ? '게시일' : item.id.startsWith('admrul_') ? '발령일' : '공포일';
  const originalLabel = item => hasReasonView(item) ? '제·개정이유 보기' : item.source === 'KOFIA' ? '협회 원문 보기' : item.category === '공포법령' ? '법령·개정이유 원문' : '원문 보기';
  const dateDisplay = value => dayNumber(value) === null ? '날짜 미수집' : value;
  const lawTitle = item => item.law_name || item.title;
  const STORAGE_KEY = 'financial-tracker:ui-v2:reviews:v1';
  const PAGE_SIZE = 25;
  const personalPriority = window.RegWatchPriority;
  let today = kstToday(), records = Object.create(null), storageAvailable = true, selectedId = null, toastTimer, previousFocus;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [key, value] of Object.entries(saved)) if (typeof value === 'string') records[key] = value;
  } catch { storageAvailable = false; }
  let validBaseData = Array.isArray(window.regulatoryData);
  let extraData = kofiaItems(window.kofiaData);
  let validKofiaData = Boolean(window.kofiaData && window.kofiaData.schema_version === 1 && window.kofiaData.source === 'KOFIA' && Array.isArray(window.kofiaData.items) && extraData.length === window.kofiaData.items.length);
  let validData = validBaseData || validKofiaData;
  let inputData = [...(validBaseData ? window.regulatoryData : []), ...extraData];
  let items = inputData.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string').map(item => ({ ...item, dept: String(item.dept || '담당 부서 미수집'), category: String(item.category || '기타') }));
  let byId = new Map(items.map(item => [item.id, item]));
  let bulkUndo = null;
  // The library opens current official full texts independently of amendment-specific links.
  const primaryNames = new Set(['자본시장과금융투자업에관한법률', '금융소비자보호에관한법률', '금융투자업규정', '금융회사의지배구조에관한법률']);
  // These historical laws have no name-only landing page; their dated official URLs were verified.
  const archiveNames = new Set(['규제재검토기한설정을위한은행법시행령등일부개정령', '국민은행법', '국민은행법시행령', '미군정청에의하여의용된보험업법', '농업은행법', '농업은행법시행령']);
  function rebuildLibrary() {
  const library = new Map();
  for (const item of items) {
    if (item.category !== '공포법령' || item.source === 'KOFIA' || !item.law_name) continue;
    const name = item.law_name.replace(/\s+/g, '');
    let url = safeURL(item.url);
    if (!url || !['law.go.kr', 'www.law.go.kr'].includes(new URL(url).hostname) || primaryNames.has(name)) continue;
    if (library.has(name) && library.get(name).date >= item.date) continue;
    const archived = archiveNames.has(name);
    if (archived) url = `https://www.law.go.kr/법령/${encodeURIComponent(item.law_name)}/(${encodeURIComponent(item.prom_no)},${item.date.replace(/-/g, '')})`;
    library.set(name, { name: archived ? `${item.law_name} (공포 ${item.date})` : item.law_name, url, date: item.date });
  }
  if (library.size) {
    $('law-library-all').innerHTML = [...library.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.name)} <span aria-hidden="true">↗</span></a>`).join('');
    $('law-library-count').textContent = `(${library.size})`;
    $('more-law-links').hidden = false;
  }
  }
  rebuildLibrary();
  window.applyCollectedData = (base, kofia) => {
    const extra = kofiaItems(kofia);
    if (!kofia || kofia.schema_version !== 1 || kofia.source !== 'KOFIA' || !Array.isArray(kofia.items) || !extra.length || extra.length !== kofia.items.length || !extra.every(item => typeof item.title === 'string')) throw new Error('Invalid KOFIA data');
    window.regulatoryData = base.items; window.lastUpdated = base.updated; window.kofiaData = kofia;
    validBaseData = validKofiaData = validData = true; extraData = extra;
    inputData = [...base.items, ...extra];
    items = inputData.map(item => ({ ...item, dept: String(item.dept || '담당 부서 미수집'), category: String(item.category || '기타') }));
    byId = new Map(items.map(item => [item.id, item]));
    rebuildLibrary(); render();
    if (selectedId && byId.has(selectedId)) detailContent(byId.get(selectedId));
  };
  const state = { search: '', category: 'all', law: 'all', scope: 'all', unread: false, focus: 'all', sort: 'latest', view: 'list', page: 1, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
  const focusLabels = { all: '전체 항목', today: '오늘 게시', priority: '우선 검토', upcoming: '30일 내 시행', unread: '미확인 항목' };
  const scopeItems = () => items.filter(item => state.scope !== 'asset' || relevance(item).candidate);
  function toast(message, undo) {
    clearTimeout(toastTimer);
    const host = document.querySelector('dialog[open]') || document.body;
    host.append($('toast')); $('toast').textContent = message; $('toast').hidden = false;
    if (undo) {
      const button = document.createElement('button'); button.textContent = '되돌리기'; button.className = 'text-button';
      button.addEventListener('click', () => { clearTimeout(toastTimer); undo(); $('toast').hidden = true; }, {once:true});
      $('toast').append(button);
    }
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, undo ? 5000 : 3200);
  }
  function priorityButton(item) {
    const active = personalPriority?.isVisiblePriorityItem(item.id) || false;
    return `<button class="priority-toggle" data-action="priority-toggle" data-id="${esc(item.id)}" aria-pressed="${active}" aria-label="${esc(item.title)}을 우선검토${active ? '에서 제외' : '에 추가'}">${active ? '★ 우선검토 중' : '☆ 우선검토에 추가'}</button>`;
  }
  function syncPriorityButtons() {
    document.querySelectorAll('.priority-toggle').forEach(button => {
      const item = byId.get(button.dataset.id); if (!item) return;
      const active = personalPriority?.isVisiblePriorityItem(item.id) || false;
      button.textContent = active ? '★ 우선검토 중' : '☆ 우선검토에 추가';
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',`${item.title}을 우선검토${active ? '에서 제외' : '에 추가'}`);
    });
  }
  function syncPriorityView() {
    state.priorityIds = personalPriority ? personalPriority.getVisiblePriorityRegulations().map(item => item.id) : null;
    syncPriorityButtons();
    if (state.focus === 'priority') {
      controls(); const filtered = filterItems(items,state,today,records);
      if (state.view === 'calendar') renderCalendar(filtered); else renderList(filtered);
    }
  }
  function refreshPriority(id) {
    render(); syncPriorityButtons();
    const host = $('detail-dialog').open ? $('detail-content') : document;
    const button = [...host.querySelectorAll('.priority-toggle')].find(b => b.dataset.id === id);
    (button || $('priority-excluded')).focus({preventScroll:true});
  }
  function priorityWarning() { return personalPriority?.storageAvailable() ? '' : ' 저장이 차단되어 현재 화면에서만 유지됩니다.'; }
  function togglePriorityItem(item, forceExclude = false) {
    if (!personalPriority) return;
    let before;
    if (forceExclude) before = personalPriority.excludePriorityItem(item.id);
    else if (personalPriority.isVisiblePriorityItem(item.id)) {
      before = personalPriority.isManuallyAdded(item.id) ? personalPriority.removeManualPriorityItem(item.id) : personalPriority.excludePriorityItem(item.id);
    } else personalPriority.addManualPriorityItem(item.id);
    refreshPriority(item.id);
    toast((before ? '우선검토에서 제외했습니다.' : '우선검토에 추가했습니다.') + priorityWarning(),
      before ? () => { personalPriority.undoPriorityChange(before); refreshPriority(item.id); } : null);
  }
  function existingExcludedItems() {
    return (personalPriority?.getExcludedPriorityIds() || []).map(id => byId.get(id)).filter(Boolean);
  }
  function renderExcluded() {
    const excluded = existingExcludedItems();
    $('priority-excluded').textContent = `제외한 안건 보기 (${excluded.length})`;
    if (!$('priority-excluded-dialog').open) return;
    $('priority-excluded-list').innerHTML = excluded.length ? excluded.map(item => `<article class="excluded-priority-row"><div><strong>${esc(item.title)}</strong><p>${esc(item.source === 'KOFIA' ? '금융투자협회' : item.dept)} · ${esc(dateDisplay(item.date))}</p></div><button class="small-button" data-action="priority-restore" data-id="${esc(item.id)}" aria-label="${esc(item.title)} 제외 취소">제외 취소</button></article>`).join('') : '<p class="rail-empty">제외한 안건이 없습니다.</p>';
    $('priority-restore-all').disabled = !personalPriority?.getExcludedPriorityIds().length;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); storageAvailable = true; }
    catch { storageAvailable = false; }
    updateStatus();
  }
  function updateStatus() {
    const formatted = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${today}T12:00:00+09:00`));
    $('today-label').textContent = `${formatted} · KST`;
    const kofia = window.kofiaData;
    $('kofia-status').textContent = validKofiaData ? `금융투자협회 수집 ${kofia.updated_at || '시각 미확인'} · 예고 ${extraData.filter(item => item.category === '입법예고').length}건 · 협회규정 ${extraData.filter(item => item.source_group === '협회규정').length}건 · 모범규준 ${extraData.filter(item => item.source_group === '모범규준').length}건` : '금융투자협회 데이터를 불러오지 못했거나 분류를 확인할 수 없습니다. 기존 기관 자료는 계속 이용할 수 있습니다.';
    if (validKofiaData && String(kofia.updated_at).slice(0, 10) !== today) $('kofia-status').textContent += ' · 오늘 협회 수집 여부 미확인';
    $('kofia-status').classList.toggle('source-error', !validKofiaData);
    const status = $('data-status');
    status.classList.remove('fresh', 'error');
    if (!validData || (inputData.length > 0 && !items.length)) {
      status.classList.add('error'); $('data-status-text').textContent = '수집 데이터를 불러오지 못했습니다. 다시 불러오거나 기존 버전을 확인하세요.'; return;
    }
    const raw = typeof window.lastUpdated === 'string' ? window.lastUpdated : '';
    const matches = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}) KST$/.exec(raw);
    const known = matches && dayNumber(matches[1]) !== null && Number(matches[2]) < 24 && Number(matches[3]) < 60;
    const latest = items.reduce((date, item) => dayNumber(item.date) !== null && item.date > date ? item.date : date, '');
    const sameDay = known && matches[1] === today;
    if (sameDay) status.classList.add('fresh');
    let message = `${known && validBaseData ? `기존 기관 수집 ${raw}` : '기존 기관 데이터·수집 시각 미확인'} · 전체 ${items.length.toLocaleString('ko-KR')}건`;
    if (latest) message += ` · 최신 게시 ${latest}`;
    if (!sameDay) message += ' · 오늘 수집 여부 미확인';
    if (inputData.length !== items.length) message += ` · 형식 오류 ${inputData.length - items.length}건 제외`;
    if (!storageAvailable) message += ' · 확인 기록은 현재 화면에서만 유지';
    $('data-status-text').textContent = message;
  }
  function highlight(text) {
    const query = state.search.trim();
    if (!query) return esc(text);
    const source = String(text), lower = source.toLowerCase(), q = query.toLowerCase();
    let out = '', cursor = 0, found;
    while ((found = lower.indexOf(q, cursor)) >= 0) { out += esc(source.slice(cursor, found)) + `<mark>${esc(source.slice(found, found + q.length))}</mark>`; cursor = found + q.length; }
    return out + esc(source.slice(cursor));
  }
  function deadlineHTML(item) {
    const effective = effectiveDate(item);
    if (effective) { const past = daysUntil(effective, today) < 0; return `<span class="deadline-tag${past ? ' past' : ''}">${esc(dDay(effective, today))}</span><small>시행 ${esc(effective)}</small>`; }
    const noticeEnd = noticeEndDate(item);
    if (noticeEnd) { const days = daysUntil(noticeEnd, today); return `<span class="deadline-tag${days < 0 ? ' past' : ''}">${days < 0 ? '예고종료' : days === 0 ? '오늘 예고종료' : `예고 D-${days}`}</span><small>종료 ${esc(noticeEnd)}</small>`; }
    if (item.category === '입법예고') return '<span class="unknown-date">의견 마감 미수집</span><small>원문 확인 필요</small>';
    return '<span class="unknown-date">시행일 미수집</span>';
  }
  function controls() {
    const categories = [...CATEGORIES, ...new Set(items.map(item => item.category).filter(value => !CATEGORIES.includes(value)))];
    const scoped = scopeItems();
    const categoryPool = filterItems(items, { ...state, category: 'all' }, today, records);
    const lawPool = filterItems(items, { ...state, law: 'all' }, today, records);
    $('category-tabs').innerHTML = ['all', ...categories].map(category => `<button data-category="${esc(category)}" aria-pressed="${state.category === category}">${category === 'all' ? '전체' : esc(categoryName(category))}<span>${category === 'all' ? categoryPool.length : categoryPool.filter(item => item.category === category).length}</span></button>`).join('');
    document.querySelectorAll('[data-law]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(state.law === btn.dataset.law));
      btn.querySelector('.option-count').textContent = lawPool.filter(item => matchesLaw(item, btn.dataset.law)).length;
    });
    document.querySelectorAll('[data-view]').forEach(btn => btn.setAttribute('aria-pressed', String(state.view === btn.dataset.view)));
    document.querySelectorAll('[data-focus]').forEach(btn => btn.setAttribute('aria-pressed', String(state.focus === btn.dataset.focus)));
    document.querySelectorAll('[data-workspace]').forEach(btn => {
      const selected = state.view === 'calendar' ? btn.dataset.workspace === 'calendar' : state.focus === btn.dataset.workspace;
      btn.setAttribute('aria-pressed', String(selected)); btn.classList.toggle('active', selected);
    });
    $('unread-only').checked = state.unread;
    $('sort-select').value = state.sort;
    const labels = [focusLabels[state.focus]];
    if (state.category !== 'all') labels.push(categoryName(state.category));
    if (state.law !== 'all') labels.push(LAW_LABELS[state.law]);
    if (state.search.trim()) labels.push('검색 적용');
    if (state.unread && state.focus !== 'unread') labels.push('미확인만');
    $('filter-summary').textContent = labels.join(' · ');
    const activeFilterCount = (state.category !== 'all' ? 1 : 0) + (state.law !== 'all' ? 1 : 0) + (state.unread ? 1 : 0);
    $('toggle-filters').innerHTML = `자료·규정 필터${activeFilterCount ? ` · ${activeFilterCount}개 적용` : ''} <span aria-hidden="true">⌄</span>`;
    $('feed-title').textContent = state.view === 'calendar' ? '시행일 캘린더' : state.focus === 'all' ? '전체 규제 피드' : `${focusLabels[state.focus]} 피드`;
    $('list-view').hidden = state.view !== 'list'; $('calendar-view').hidden = state.view !== 'calendar';
    $('count-today').textContent = validData ? scoped.filter(item => item.date === today).length : '—';
    $('count-priority').textContent = validData ? scoped.filter(item => state.priorityIds ? state.priorityIds.includes(item.id) : priority(item, today).tier > 0).length : '—';
    document.querySelector('.priority-metric .metric-note').textContent = state.priorityIds ? '자동 추천 + 직접 추가' : '일정·키워드 규칙 기반';
    $('count-upcoming').textContent = validData ? scoped.filter(item => { const n = daysUntil(effectiveDate(item), today); return n !== null && n >= 0 && n <= 30; }).length : '—';
    $('count-unread').textContent = validData ? scoped.filter(item => !isRead(item, records)).length : '—';
  }
  function renderList(filtered) {
    const sorted = state.focus === 'priority' && state.priorityIds ? [...filtered].sort((a,b) => state.priorityIds.indexOf(a.id)-state.priorityIds.indexOf(b.id)) : sortItems(filtered, state.sort, today), pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * PAGE_SIZE, pageItems = sorted.slice(start, start + PAGE_SIZE);
    $('result-count').innerHTML = `<strong>${sorted.length.toLocaleString('ko-KR')}건</strong> / 업무 관점 ${scopeItems().length}건${sorted.length ? ` · ${start + 1}–${start + pageItems.length}` : ''}`;
    $('regulation-list').setAttribute('aria-busy', 'false');
    if (!sorted.length) {
      const title = !validData ? '데이터를 불러오지 못했습니다' : !items.length ? '수집된 항목이 없습니다' : '조건에 맞는 항목이 없습니다';
      const description = state.focus === 'today' ? '수집 데이터에서 오늘 날짜의 항목을 찾지 못했습니다. 최근 수집 시각을 확인하세요.' : '검색어를 줄이거나 자료 종류·법령·규정을 전체로 바꿔 보세요.';
      $('regulation-list').innerHTML = `<div class="empty-state"><strong>${title}</strong><p>${!validData ? '상단의 다시 불러오기를 누르거나 기존 버전을 확인하세요.' : description}</p><button class="small-button" data-action="reset">전체 목록 보기</button></div>`;
    } else {
      $('regulation-list').innerHTML = pageItems.map(item => {
        const read = isRead(item, records), p = priority(item, today), href = sourceURL(item, document.baseURI);
        return `<article class="reg-row${read ? ' is-read' : ''}" data-item-id="${esc(item.id)}"><div class="row-content"><div class="row-meta">${read ? '' : '<span class="unread-dot" aria-label="미확인"></span>'}${badge(item)}${p.tier ? `<span class="priority-flag">↑ 우선 검토</span>` : ''}</div><h3><button class="reg-title" data-action="detail" data-id="${esc(item.id)}">${highlight(item.title)}</button></h3><p class="dept-line">${highlight(item.dept)}<span class="mobile-posted">${dateLabel(item)} ${esc(dateDisplay(item.date))}</span></p><div class="row-actions">${priorityButton(item)}${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${originalLabel(item)} ↗</a><button data-action="copy" data-id="${esc(item.id)}" aria-label="${esc(item.title)} 링크 복사">링크 복사</button>` : '<span class="unknown-date">원문 링크 미확인</span>'}</div></div><div class="row-date">${esc(dateDisplay(item.date))}<span class="date-label">${dateLabel(item)}</span></div><div class="row-deadline">${deadlineHTML(item)}</div><button class="read-toggle" data-action="read" data-id="${esc(item.id)}" aria-pressed="${read}" aria-label="${esc(item.title)} ${read ? '미확인으로 변경' : '확인 완료 처리'}" title="${read ? '미확인으로 변경' : '확인 완료 처리'}">${read ? '✓' : '○'}</button></article>`;
      }).join('');
    }
    $('pagination').innerHTML = sorted.length ? `<button class="small-button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>← 이전</button><span>${state.page} / ${pages} 페이지</span><button class="small-button" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>다음 →</button>` : '';
  }
  function renderRail() {
    const scoped = scopeItems();
    const prioritized = sortItems(scoped.filter(item => priority(item, today).tier > 0), 'priority', today);
    personalPriority?.configure(prioritized, scoped);
    const visible = personalPriority ? personalPriority.getVisiblePriorityRegulations() : prioritized.slice(0,3);
    $('priority-list').innerHTML = visible.length ? visible.map((item,i) => `<article class="ai-priority-row"><button class="priority-summary" data-action="detail" data-id="${esc(item.id)}"><span>${i+1}</span><span><strong>${esc(item.title)}</strong><small>${esc(priority(item,today).reason)}</small></span><span aria-hidden="true">→</span></button><button class="priority-remove" data-action="priority-exclude" data-id="${esc(item.id)}" title="우선검토에서 제외" aria-label="${esc(item.title)}을 우선검토에서 제외">×</button></article>`).join('') : `<p class="rail-empty">${validData ? '현재 표시할 우선검토 안건이 없습니다. 제외한 안건을 복원하거나 전체 규제에서 직접 추가할 수 있습니다.' : '데이터 확인이 필요합니다.'}</p>`;
    try { window.RegWatchAIUI?.render({ items: scoped, today, records, isRead, priority, sortItems, scope: state.scope, syncPriorityButtons: syncPriorityView }); } catch { /* Optional AI layer cannot break the rule rail. */ }
    const upcoming = sortItems(scoped.filter(item => { const n = daysUntil(effectiveDate(item), today); return n !== null && n >= 0; }), 'effective', today).slice(0, 3);
    $('upcoming-list').innerHTML = upcoming.length ? upcoming.map(item => `<article class="upcoming-item"><div class="date-block"><small>${Number(item.enf_date.slice(5, 7))}월</small><strong>${item.enf_date.slice(8)}</strong></div><div><button data-action="detail" data-id="${esc(item.id)}">${esc(lawTitle(item))}</button><p><span>${dDay(item.enf_date, today)}</span>제${esc(item.prom_no || '미상')}호 · ${item.enf_date.slice(0, 4)}</p></div></article>`).join('') : '<p class="rail-empty">수집된 향후 시행 일정이 없습니다.</p>';
  }
  function renderCalendar(filtered) {
    const prefix = `${state.year}-${String(state.month + 1).padStart(2, '0')}`;
    const monthItems = filtered.filter(item => effectiveDate(item)?.startsWith(prefix)).sort((a, b) => a.enf_date.localeCompare(b.enf_date) || a.id.localeCompare(b.id));
    $('cal-title').textContent = `${state.year}년 ${state.month + 1}월`;
    $('calendar-caption').textContent = `현재 검색·필터 적용 · 공포법령의 수집된 시행일 ${monthItems.length}건. 날짜 아래 항목을 눌러 상세를 확인하세요.`;
    const map = new Map();
    for (const item of monthItems) { if (!map.has(item.enf_date)) map.set(item.enf_date, []); map.get(item.enf_date).push(item); }
    $('calendar-grid').innerHTML = ['일', '월', '화', '수', '목', '금', '토'].map(day => `<div class="day-heading">${day}</div>`).join('') + calendarCells(state.year, state.month).map(date => {
      const own = date.startsWith(prefix), events = map.get(date) || [];
      return `<div class="day-cell${own ? '' : ' other-month'}${date === today ? ' today' : ''}" ${date === today ? 'aria-current="date"' : ''}><time class="day-number" datetime="${date}">${Number(date.slice(8))}</time>${events.map(item => `<button class="calendar-event" data-action="detail" data-id="${esc(item.id)}" aria-label="${esc(date + ' 시행 ' + lawTitle(item) + ' 제' + item.prom_no + '호')}" title="${esc(item.title)}"><b>${esc(dDay(date, today))}</b> ${esc(lawTitle(item))}</button>`).join('')}</div>`;
    }).join('');
    $('month-agenda').innerHTML = `<h3>이달의 시행 일정 <span class="tiny-label">${monthItems.length}건</span></h3>` + (monthItems.length ? monthItems.map(item => `<div class="agenda-row"><span>${esc(item.enf_date)}</span><div><button data-action="detail" data-id="${esc(item.id)}">${esc(lawTitle(item))}</button><small>제${esc(item.prom_no || '미상')}호 · ${esc(dDay(item.enf_date, today))}</small></div></div>`).join('') : '<p class="rail-empty">현재 조건에서 이달의 시행 일정이 없습니다. 다른 달로 이동하거나 필터를 초기화하세요.</p>');
  }
  function render() {
    const dateChanged = today !== kstToday();
    today = kstToday(); updateStatus();
    renderRail();
    state.priorityIds = personalPriority ? personalPriority.getVisiblePriorityRegulations().map(item => item.id) : null;
    renderExcluded();
    controls();
    const filtered = filterItems(items, state, today, records);
    if (state.view === 'calendar') renderCalendar(filtered); else renderList(filtered);
    const unreadCount = items.filter(item => !isRead(item, records)).length;
    $('bulk-review-open').textContent = `미확인 전체 확인 (${unreadCount.toLocaleString('ko-KR')}건)`;
    $('bulk-review-open').disabled = unreadCount === 0;
    if (dateChanged && selectedId && $('detail-dialog').open) detailContent(byId.get(selectedId));
  }
  function detailContent(item) {
    const href = sourceURL(item, document.baseURI), read = isRead(item, records);
    const normalized = window.RegWatchAI?.normalize(item), source = item.source === 'KOFIA' ? '금융투자협회' : normalized?.source || item.source || item.dept || '기관 미수집';
    const timing = window.RegWatchPresentation?.deadline(normalized || {},today) || '';
    $('detail-content').innerHTML = `<header class="brief-header"><h2 id="detail-title" class="detail-title">${esc(item.title)}</h2><p class="brief-meta">${esc(source)} · ${esc(dateDisplay(item.date))}${timing ? ` · ${esc(timing)}` : ''}</p><button class="text-button brief-review" data-action="read" data-id="${esc(item.id)}" aria-pressed="${read}">${read ? '✓ 확인 완료 · 취소' : '확인 완료로 표시'}</button>${priorityButton(item)}</header><div id="ai-detail-section" class="ai-detail"><section class="brief-section"><h3>검토 요약</h3><p>${esc(priority(item,today).reason)}</p></section><section class="brief-section"><h3>왜 확인해야 하나요?</h3><p>공식 원문과 당사 업무의 관련성을 확인하세요.</p></section><section class="brief-section"><h3>무엇을 확인하면 되나요?</h3><p>당사 적용 대상 여부 · 관련 내규 · 업무 영향 여부</p></section><section class="brief-section"><h3>관련 업무</h3><p>공식 원문 확인 필요</p></section></div><footer class="brief-footer"><div class="brief-cta">${href ? `<a class="small-button" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(item.title)} 공식 원문 보기">공식 원문 ↗</a>` : '<span class="brief-meta">공식 원문 링크가 없습니다.</span>'}</div><p class="ai-disclaimer">검토를 보조하기 위한 참고자료입니다. 최종 적용 여부는 공식 원문과 회사 업무를 대조해 판단하세요.</p></footer>`;
    try { window.RegWatchAIUI?.detail(item, today); } catch { /* Preserve original details. */ }
    try { window.RegWatchGemini?.mountDetail(item); } catch { /* Preserve existing details. */ }
  }
  function openDetail(id) {
    const item = byId.get(id); if (!item) return;
    previousFocus = document.activeElement; selectedId = id; detailContent(item);
    $('detail-dialog').showModal(); $('detail-dialog').scrollTop = 0; $('close-detail').focus();
  }
  async function copyLink(item) {
    const url = sourceURL(item, document.baseURI); if (!url) { toast('유효한 원문 링크가 없습니다.'); return; }
    try { await navigator.clipboard.writeText(url); toast('원문 링크를 복사했습니다.'); }
    catch {
      const input = document.createElement('textarea'); input.value = url; input.setAttribute('aria-label', '복사할 원문 링크');
      input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
      const focused = document.activeElement, host = $('detail-dialog').open ? $('detail-dialog') : document.body;
      host.append(input); input.select();
      let copied = false; try { copied = document.execCommand('copy'); } catch { /* Report the actual result below. */ }
      input.remove(); if (focused?.isConnected) focused.focus();
      toast(copied ? '원문 링크를 복사했습니다.' : '복사하지 못했습니다. 원문 링크의 주소를 직접 복사하세요.');
    }
  }
  function resetFilters() { Object.assign(state, { search: '', category: 'all', law: 'all', unread: false, focus: 'all', sort: 'latest', page: 1 }); $('search-input').value = ''; }
  function applyFocus(focus) { resetFilters(); state.focus = focus; state.view = 'list'; state.sort = focus === 'priority' ? 'priority' : focus === 'upcoming' ? 'effective' : 'latest'; render(); }
  function openCalendar() { resetFilters(); state.view = 'calendar'; state.year = Number(today.slice(0, 4)); state.month = Number(today.slice(5, 7)) - 1; render(); }
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'reset') { resetFilters(); render(); return; }
      if (action.dataset.action === 'priority-excluded') { $('priority-restore-confirmation').hidden = true; $('priority-excluded-dialog').showModal(); renderExcluded(); $('priority-excluded-close').focus(); return; }
      const item = byId.get(action.dataset.id); if (!item) return;
      if (['priority-toggle','priority-exclude'].includes(action.dataset.action)) { event.preventDefault(); event.stopPropagation(); togglePriorityItem(item, action.dataset.action === 'priority-exclude'); return; }
      if (action.dataset.action === 'priority-restore') {
        personalPriority?.restoreExcludedPriorityItem(item.id); render(); syncPriorityButtons();
        $('priority-excluded-list').querySelector('button')?.focus();
        if (!$('priority-excluded-list').querySelector('button')) $('priority-excluded-close').focus();
        toast((personalPriority?.isVisiblePriorityItem(item.id) ? '우선검토에 다시 표시합니다.' : '제외 상태를 해제했습니다. 현재 자동추천 대상이 아니거나 다른 업무 관점의 안건은 바로 표시되지 않을 수 있습니다.') + priorityWarning()); return;
      }
      if (action.dataset.action === 'detail') openDetail(item.id);
      if (action.dataset.action === 'ai-detail') {
        if (!$('detail-dialog').open || selectedId !== item.id) openDetail(item.id);
        window.RegWatchAIUI?.analyze(item).catch(() => {});
      }
      if (action.dataset.action === 'copy') copyLink(item);
      if (action.dataset.action === 'read') {
        const read = isRead(item, records);
        if (read) delete records[item.id]; else records[item.id] = fingerprint(item);
        persist(); render();
        if ($('detail-dialog').open && selectedId === item.id) { detailContent(item); $('detail-content').querySelector('[data-action="read"]').focus(); }
        else { const matching = [...document.querySelectorAll('#regulation-list [data-action="read"]')].find(btn => btn.dataset.id === item.id); (matching || $('search-input')).focus(); }
        toast(`${read ? '미확인으로 변경했습니다.' : '확인 완료로 기록했습니다.'}${storageAvailable ? '' : ' 저장이 차단되어 현재 화면에서만 유지됩니다.'}`);
      }
      return;
    }
    const page = event.target.closest('[data-page]');
    if (page && !page.disabled) { state.page = Number(page.dataset.page); render(); $('feed-title').scrollIntoView({ block: 'start' }); const first = $('regulation-list').querySelector('[data-action="detail"]'); first?.focus({ preventScroll: true }); }
  });
  $('workspace-nav').addEventListener('click', event => { const btn = event.target.closest('[data-workspace]'); if (btn) btn.dataset.workspace === 'calendar' ? openCalendar() : applyFocus(btn.dataset.workspace); });
  $('metrics').addEventListener('click', event => { const btn = event.target.closest('[data-focus]'); if (btn) applyFocus(state.focus === btn.dataset.focus ? 'all' : btn.dataset.focus); });
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => { state.view = btn.dataset.view; render(); }));
  $('category-tabs').addEventListener('click', event => { const btn = event.target.closest('[data-category]'); if (btn) { state.category = state.category === btn.dataset.category ? 'all' : btn.dataset.category; state.page = 1; render(); [...$('category-tabs').children].find(el => el.dataset.category === state.category)?.focus(); } });
  $('law-filters').addEventListener('click', event => { const btn = event.target.closest('[data-law]'); if (btn) { state.law = state.law === btn.dataset.law ? 'all' : btn.dataset.law; state.page = 1; render(); } });
  $('search-input').addEventListener('input', event => { state.search = event.target.value; state.page = 1; render(); });
  $('toggle-filters').addEventListener('click', () => { const expanded = $('toggle-filters').getAttribute('aria-expanded') !== 'true'; $('toggle-filters').setAttribute('aria-expanded', String(expanded)); $('filter-controls').classList.toggle('is-open', expanded); });
  $('scope-select').addEventListener('change', event => { state.scope = event.target.value; state.page = 1; render(); });
  $('unread-only').addEventListener('change', event => { state.unread = event.target.checked; state.page = 1; render(); });
  $('sort-select').addEventListener('change', event => { state.sort = event.target.value; state.page = 1; render(); });
  $('reset-filters').addEventListener('click', () => { resetFilters(); render(); });
  // collection.js refreshes data without resetting filters or confirmation records.
  $('show-priority').addEventListener('click', () => { applyFocus('priority'); $('feed-title').scrollIntoView({ block: 'start' }); });
  $('show-calendar').addEventListener('click', openCalendar);
  $('show-notices').addEventListener('click', () => { resetFilters(); state.category = '입법예고'; state.view = 'list'; render(); });
  function moveMonth(offset) { const next = new Date(Date.UTC(state.year, state.month + offset, 1)); state.year = next.getUTCFullYear(); state.month = next.getUTCMonth(); render(); }
  $('cal-prev').addEventListener('click', () => moveMonth(-1)); $('cal-next').addEventListener('click', () => moveMonth(1));
  $('cal-today').addEventListener('click', () => { today = kstToday(); state.year = Number(today.slice(0, 4)); state.month = Number(today.slice(5, 7)) - 1; render(); });
  $('priority-excluded-close').addEventListener('click', () => $('priority-excluded-dialog').close());
  $('priority-excluded-dialog').addEventListener('close', () => {
    $('priority-restore-confirmation').hidden = true; $('toast').hidden = true; document.body.append($('toast')); $('priority-excluded').focus();
  });
  $('priority-restore-all').addEventListener('click', () => { $('priority-restore-confirmation').hidden = false; $('priority-restore-cancel').focus(); });
  $('priority-restore-cancel').addEventListener('click', () => { $('priority-restore-confirmation').hidden = true; $('priority-restore-all').focus(); });
  $('priority-restore-confirm').addEventListener('click', () => {
    personalPriority?.restoreAllExcludedPriorityItems(); $('priority-restore-confirmation').hidden = true;
    render(); syncPriorityButtons(); $('priority-excluded-close').focus(); toast('모든 제외 상태를 해제했습니다.' + priorityWarning());
  });
  $('close-detail').addEventListener('click', () => $('detail-dialog').close());
  $('detail-dialog').addEventListener('close', () => { $('toast').hidden = true; document.body.append($('toast')); if (previousFocus?.isConnected) previousFocus.focus(); else $('search-input').focus(); selectedId = null; });
  $('rules-button').addEventListener('click', () => $('rules-dialog').showModal());
  $('footer-rules').addEventListener('click', () => $('rules-dialog').showModal());
  $('close-rules').addEventListener('click', () => $('rules-dialog').close());
  $('bulk-review-open').addEventListener('click', () => {
    const count = items.filter(item => !isRead(item, records)).length;
    $('bulk-review-description').textContent = `현재 미확인 ${count.toLocaleString('ko-KR')}건을 확인 완료로 변경합니다.`;
    $('bulk-review-dialog').showModal();
    $('bulk-review-close').focus();
  });
  $('bulk-review-close').addEventListener('click', () => $('bulk-review-dialog').close());
  $('bulk-review-confirm').addEventListener('click', () => {
    const changes = items.filter(item => !isRead(item, records)).map(item => ({ id: item.id, before: records[item.id], after: fingerprint(item) }));
    if (changes.length) {
      bulkUndo = changes;
      for (const change of changes) records[change.id] = change.after;
      persist(); render();
      $('bulk-review-undo').hidden = false;
      $('bulk-review-status').textContent = `${changes.length.toLocaleString('ko-KR')}건 확인 완료.${storageAvailable ? '' : ' 저장이 차단되어 현재 화면에서만 유지됩니다.'}`;
    }
    $('bulk-review-dialog').close();
    $('bulk-review-undo').focus();
  });
  $('bulk-review-undo').addEventListener('click', () => {
    if (!bulkUndo) return;
    for (const change of bulkUndo) {
      if (records[change.id] !== change.after) continue;
      if (change.before === undefined) delete records[change.id]; else records[change.id] = change.before;
    }
    bulkUndo = null; persist(); render();
    $('bulk-review-undo').hidden = true;
    $('bulk-review-status').textContent = `일괄 확인을 되돌렸습니다.${storageAvailable ? '' : ' 저장이 차단되어 현재 화면에서만 유지됩니다.'}`;
    $('bulk-review-open').focus();
  });
  document.addEventListener('keydown', event => { if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search-input').focus(); } });
  window.addEventListener('storage', event => {
    if (event.key === null || ['regwatch_priority_excluded_v1','regwatch_priority_added_v1'].includes(event.key)) { personalPriority?.reload(); render(); syncPriorityButtons(); }
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try { const value = JSON.parse(event.newValue || '{}'); records = Object.create(null); if (value && typeof value === 'object' && !Array.isArray(value)) for (const [key, val] of Object.entries(value)) if (typeof val === 'string') records[key] = val; render(); if (selectedId) detailContent(byId.get(selectedId)); } catch { /* A malformed external value must not break rendering. */ }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && kstToday() !== today) render(); });
  setInterval(() => { if (kstToday() !== today) render(); }, 60000);
  render();
})();
