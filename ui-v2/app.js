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
      if (state.focus === 'priority' && !priority(item, today).tier) return false;
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
  let today = kstToday(), records = Object.create(null), storageAvailable = true, selectedId = null, toastTimer, previousFocus;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [key, value] of Object.entries(saved)) if (typeof value === 'string') records[key] = value;
  } catch { storageAvailable = false; }
  const validBaseData = Array.isArray(window.regulatoryData);
  const extraData = kofiaItems(window.kofiaData);
  const validKofiaData = Boolean(window.kofiaData && window.kofiaData.schema_version === 1 && window.kofiaData.source === 'KOFIA' && Array.isArray(window.kofiaData.items) && extraData.length === window.kofiaData.items.length);
  const validData = validBaseData || validKofiaData;
  const inputData = [...(validBaseData ? window.regulatoryData : []), ...extraData];
  const items = inputData.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string').map(item => ({ ...item, dept: String(item.dept || '담당 부서 미수집'), category: String(item.category || '기타') }));
  const byId = new Map(items.map(item => [item.id, item]));
  // The library opens current official full texts independently of amendment-specific links.
  const primaryNames = new Set(['자본시장과금융투자업에관한법률', '금융소비자보호에관한법률', '금융투자업규정', '금융회사의지배구조에관한법률']);
  // These historical laws have no name-only landing page; their dated official URLs were verified.
  const archiveNames = new Set(['규제재검토기한설정을위한은행법시행령등일부개정령', '국민은행법', '국민은행법시행령', '미군정청에의하여의용된보험업법', '농업은행법', '농업은행법시행령']);
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
  const state = { search: '', category: 'all', law: 'all', scope: 'all', unread: false, focus: 'all', sort: 'latest', view: 'list', page: 1, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
  const focusLabels = { all: '전체 항목', today: '오늘 게시', priority: '우선 검토', upcoming: '30일 내 시행', unread: '미확인 항목' };
  const scopeItems = () => items.filter(item => state.scope !== 'asset' || relevance(item).candidate);
  function toast(message) {
    clearTimeout(toastTimer);
    const host = document.querySelector('dialog[open]') || document.body;
    host.append($('toast')); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
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
    $('count-priority').textContent = validData ? scoped.filter(item => priority(item, today).tier > 0).length : '—';
    $('count-upcoming').textContent = validData ? scoped.filter(item => { const n = daysUntil(effectiveDate(item), today); return n !== null && n >= 0 && n <= 30; }).length : '—';
    $('count-unread').textContent = validData ? scoped.filter(item => !isRead(item, records)).length : '—';
  }
  function renderList(filtered) {
    const sorted = sortItems(filtered, state.sort, today), pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
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
        return `<article class="reg-row${read ? ' is-read' : ''}" data-item-id="${esc(item.id)}"><div class="row-content"><div class="row-meta">${read ? '' : '<span class="unread-dot" aria-label="미확인"></span>'}${badge(item)}${p.tier ? `<span class="priority-flag">↑ 우선 검토</span>` : ''}</div><h3><button class="reg-title" data-action="detail" data-id="${esc(item.id)}">${highlight(item.title)}</button></h3><p class="dept-line">${highlight(item.dept)}<span class="mobile-posted">${dateLabel(item)} ${esc(dateDisplay(item.date))}</span></p><div class="row-actions">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${originalLabel(item)} ↗</a><button data-action="copy" data-id="${esc(item.id)}" aria-label="${esc(item.title)} 링크 복사">링크 복사</button>` : '<span class="unknown-date">원문 링크 미확인</span>'}</div></div><div class="row-date">${esc(dateDisplay(item.date))}<span class="date-label">${dateLabel(item)}</span></div><div class="row-deadline">${deadlineHTML(item)}</div><button class="read-toggle" data-action="read" data-id="${esc(item.id)}" aria-pressed="${read}" aria-label="${esc(item.title)} ${read ? '미확인으로 변경' : '확인 완료 처리'}" title="${read ? '미확인으로 변경' : '확인 완료 처리'}">${read ? '✓' : '○'}</button></article>`;
      }).join('');
    }
    $('pagination').innerHTML = sorted.length ? `<button class="small-button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>← 이전</button><span>${state.page} / ${pages} 페이지</span><button class="small-button" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>다음 →</button>` : '';
  }
  function renderRail() {
    const scoped = scopeItems();
    const prioritized = sortItems(scoped.filter(item => !isRead(item, records) && priority(item, today).tier > 0), 'priority', today).slice(0, 3);
    $('priority-list').innerHTML = prioritized.length ? prioritized.map((item, i) => `<article class="priority-item"><span class="priority-rank">0${i + 1}</span><div><div class="reason">${esc(priority(item, today).reason)}</div><button data-action="detail" data-id="${esc(item.id)}">${esc(lawTitle(item))}</button><p>${item.prom_no ? `제${esc(item.prom_no)}호 · ` : ''}${esc(dateDisplay(item.date))}</p></div></article>`).join('') : `<p class="rail-empty">${validData ? '미확인 우선 검토 항목이 없습니다.' : '데이터 확인이 필요합니다.'}</p>`;
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
    today = kstToday(); updateStatus(); controls();
    const filtered = filterItems(items, state, today, records);
    if (state.view === 'calendar') renderCalendar(filtered); else renderList(filtered);
    renderRail();
    if (dateChanged && selectedId && $('detail-dialog').open) detailContent(byId.get(selectedId));
  }
  function detailContent(item) {
    const related = relevance(item), p = priority(item, today), href = sourceURL(item, document.baseURI), read = isRead(item, records);
    $('detail-content').innerHTML = `${badge(item)}<h2 id="detail-title" class="detail-title">${esc(item.title)}</h2><section class="detail-section"><dl class="detail-meta"><dt>담당 부서</dt><dd>${esc(item.dept)}</dd><dt>${dateLabel(item)}</dt><dd>${esc(dateDisplay(item.date))}</dd>${item.prom_no ? `<dt>공포·발령번호</dt><dd>제${esc(item.prom_no)}호</dd>` : ''}<dt>시행일</dt><dd>${effectiveDate(item) ? `${esc(item.enf_date)} · ${esc(dDay(item.enf_date, today))}` : '미수집 · 원문 확인 필요'}</dd>${noticeEndDate(item) ? `<dt>예고종료일</dt><dd>${esc(item.notice_end_date)}<small>협회 예고종료일 기준 · 상세 제출 조건은 원문 확인</small></dd>` : item.category === '입법예고' ? '<dt>의견제출 마감</dt><dd>미수집 · 입법예고 원문에서 확인</dd>' : ''}${item.source === 'KOFIA' ? `<dt>자료 구분</dt><dd>${esc(item.source_group || item.source_type)} · ${esc(item.revision_type || '')}</dd>${item.classification_path ? `<dt>현행규정 분류</dt><dd>${esc(item.classification_path.join(' → '))}</dd>` : ''}` : ''}<dt>확인 상태</dt><dd>${read ? '확인 완료' : '미확인'}<small>이 브라우저의 UI 2.0 기록</small></dd></dl></section><section class="detail-section"><h3>검토 우선순위 근거</h3><p>${esc(p.reason)}${p.tier ? ' · 규칙 기반 후보' : ''}</p><p>자산운용 관련 키워드: ${related.direct.length ? esc(related.direct.join(', ')) : '일치 없음'}</p><p>공통 준법 키워드: ${related.common.length ? esc(related.common.join(', ')) : '일치 없음'}</p><p>제목·부서 기준 분류입니다. 실제 적용 여부와 대응 기한은 원문 및 회사 업무를 대조해 확인하세요.</p></section><section class="detail-section"><h3>원문 확인</h3><p>${item.source === 'KOFIA' ? '협회 자료입니다. 제·개정일과 예고 기간은 시행일이 아닙니다. 시행일 및 적용·제출 조건은 해당 협회 원문과 첨부에서 확인하세요. 협회 예고 원문은 전용 연결 페이지를 통해 열립니다.' : item.category === '공포법령' ? hasReasonView(item) ? '제·개정이유 보기는 이 게시글의 공포번호·날짜와 일치하는 개정이유를 표시합니다. 원문에 포함된 주요내용도 함께 표시됩니다. 시행일 경과는 현재 유효함을 의미하지 않습니다.' : '법령 링크는 법령명 기준 주소입니다. 수집된 개정본을 확인하려면 원문의 연혁·제정개정이유에서 공포번호와 날짜를 대조하세요. 시행일 경과는 현재 유효함을 의미하지 않습니다.' : '수집 데이터에는 본문·요약·첨부파일이 포함되지 않습니다. 원문에서 세부 내용과 기한을 확인하세요.'}</p><div class="detail-actions"><button class="primary-action" data-action="read" data-id="${esc(item.id)}" aria-pressed="${read}">${read ? '미확인으로 변경' : '확인 완료'}</button>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${originalLabel(item)} ↗</a><button data-action="copy" data-id="${esc(item.id)}">링크 복사</button>` : '<span>원문 링크 미확인</span>'}</div></section>`;
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
      const item = byId.get(action.dataset.id); if (!item) return;
      if (action.dataset.action === 'detail') openDetail(item.id);
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
  $('reload-button').addEventListener('click', () => window.location.reload());
  $('show-priority').addEventListener('click', () => { applyFocus('priority'); $('feed-title').scrollIntoView({ block: 'start' }); });
  $('show-calendar').addEventListener('click', openCalendar);
  $('show-notices').addEventListener('click', () => { resetFilters(); state.category = '입법예고'; state.view = 'list'; render(); });
  function moveMonth(offset) { const next = new Date(Date.UTC(state.year, state.month + offset, 1)); state.year = next.getUTCFullYear(); state.month = next.getUTCMonth(); render(); }
  $('cal-prev').addEventListener('click', () => moveMonth(-1)); $('cal-next').addEventListener('click', () => moveMonth(1));
  $('cal-today').addEventListener('click', () => { today = kstToday(); state.year = Number(today.slice(0, 4)); state.month = Number(today.slice(5, 7)) - 1; render(); });
  $('close-detail').addEventListener('click', () => $('detail-dialog').close());
  $('detail-dialog').addEventListener('close', () => { $('toast').hidden = true; document.body.append($('toast')); if (previousFocus?.isConnected) previousFocus.focus(); else $('search-input').focus(); selectedId = null; });
  $('rules-button').addEventListener('click', () => $('rules-dialog').showModal());
  $('footer-rules').addEventListener('click', () => $('rules-dialog').showModal());
  $('close-rules').addEventListener('click', () => $('rules-dialog').close());
  document.addEventListener('keydown', event => { if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search-input').focus(); } });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try { const value = JSON.parse(event.newValue || '{}'); records = Object.create(null); if (value && typeof value === 'object' && !Array.isArray(value)) for (const [key, val] of Object.entries(value)) if (typeof val === 'string') records[key] = val; render(); if (selectedId) detailContent(byId.get(selectedId)); } catch { /* A malformed external value must not break rendering. */ }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && kstToday() !== today) render(); });
  setInterval(() => { if (kstToday() !== today) render(); }, 60000);
  render();
})();
