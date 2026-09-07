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
    return JSON.stringify([item.title, item.date, item.enf_date || '', item.dept, item.category, item.law_name || '', item.prom_no || '', stableURL(item.url)]);
  }
  function relevance(item) {
    const text = `${item.title || ''} ${item.dept || ''}`.toLowerCase();
    const direct = ASSET_TERMS.filter(term => text.includes(term.toLowerCase()));
    const common = COMMON_TERMS.filter(term => text.includes(term.toLowerCase()));
    return { direct, common, candidate: direct.length > 0 || common.length > 0 };
  }
  function priority(item, today) {
    const due = daysUntil(effectiveDate(item), today);
    const age = daysUntil(item.date, today);
    const related = relevance(item).candidate;
    if (due !== null && due >= 0 && due <= 30) return { tier: 3, reason: due === 0 ? '오늘 시행 예정' : `${due}일 후 시행 예정` };
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
      if ([...state.laws].some(law => LAW_RULES[law] && !LAW_RULES[law](item.title))) return false;
      const search = state.search.trim().toLowerCase();
      return !search || `${item.title} ${item.dept} ${item.category} ${item.law_name || ''}`.toLowerCase().includes(search);
    });
  }
  function sortItems(items, mode, today) {
    const latest = (a, b) => (dayNumber(b.date) ?? -Infinity) - (dayNumber(a.date) ?? -Infinity) || a.id.localeCompare(b.id);
    const dueOrder = item => { const n = daysUntil(effectiveDate(item), today); return n === null || n < 0 ? Infinity : n; };
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
    module.exports = { dayNumber, kstToday, daysUntil, dDay, effectiveDate, safeURL, fingerprint, relevance, priority, isRead, filterItems, sortItems, calendarCells, LAW_RULES };
    return;
  }
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const categoryName = value => value === '공포법령' ? '공포/시행 법령' : value;
  const categoryClass = value => ({ 보도자료: 'press', 입법예고: 'notice', 공포법령: 'law', 금융시장동향: 'trend' }[value] || 'neutral');
  const badge = item => `<span class="badge ${categoryClass(item.category)}">${esc(categoryName(item.category))}</span>`;
  const dateLabel = item => item.category !== '공포법령' ? '게시일' : item.id.startsWith('admrul_') ? '발령일' : '공포일';
  const dateDisplay = value => dayNumber(value) === null ? '날짜 미수집' : value;
  const lawTitle = item => item.law_name || item.title;
  const STORAGE_KEY = 'financial-tracker:ui-v2:reviews:v1';
  const PAGE_SIZE = 25;
  let today = kstToday(), records = Object.create(null), storageAvailable = true, selectedId = null, toastTimer, previousFocus;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [key, value] of Object.entries(saved)) if (typeof value === 'string') records[key] = value;
  } catch { storageAvailable = false; }
  const validData = Array.isArray(window.regulatoryData);
  const inputData = validData ? window.regulatoryData : [];
  const items = inputData.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string').map(item => ({ ...item, dept: String(item.dept || '담당 부서 미수집'), category: String(item.category || '기타') }));
  const byId = new Map(items.map(item => [item.id, item]));
  const state = { search: '', category: 'all', laws: new Set(), scope: 'all', unread: false, focus: 'all', sort: 'latest', view: 'list', page: 1, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
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
    let message = `${known ? `최근 수집 ${raw}` : '수집 시각 미확인'} · ${items.length.toLocaleString('ko-KR')}건`;
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
    if (item.category === '입법예고') return '<span class="unknown-date">의견 마감 미수집</span><small>원문 확인 필요</small>';
    return '<span class="unknown-date">시행일 미수집</span>';
  }
  function controls() {
    const categories = [...CATEGORIES, ...new Set(items.map(item => item.category).filter(value => !CATEGORIES.includes(value)))];
    const scoped = scopeItems();
    $('category-tabs').innerHTML = ['all', ...categories].map(category => `<button data-category="${esc(category)}" aria-pressed="${state.category === category}">${category === 'all' ? '전체' : esc(categoryName(category))}<span>${category === 'all' ? scoped.length : scoped.filter(item => item.category === category).length}</span></button>`).join('');
    document.querySelectorAll('[data-law]').forEach(btn => btn.setAttribute('aria-pressed', String(state.laws.has(btn.dataset.law))));
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
    if (state.laws.size) labels.push(`법령 ${state.laws.size}개 AND`);
    if (state.search.trim()) labels.push('검색 적용');
    if (state.unread && state.focus !== 'unread') labels.push('미확인만');
    $('filter-summary').textContent = labels.join(' · ');
    const activeFilterCount = (state.category !== 'all' ? 1 : 0) + state.laws.size + (state.unread ? 1 : 0);
    $('toggle-filters').innerHTML = `카테고리·법령 필터${activeFilterCount ? ` · ${activeFilterCount}개 적용` : ''} <span aria-hidden="true">⌄</span>`;
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
      const description = state.focus === 'today' ? '수집 데이터에서 오늘 게시·공포된 항목을 찾지 못했습니다. 최근 수집 시각을 확인하세요.' : '검색어나 법령 필터의 AND 조건을 확인해 주세요.';
      $('regulation-list').innerHTML = `<div class="empty-state"><strong>${title}</strong><p>${!validData ? '상단의 다시 불러오기를 누르거나 기존 버전을 확인하세요.' : description}</p><button class="small-button" data-action="reset">전체 목록 보기</button></div>`;
    } else {
      $('regulation-list').innerHTML = pageItems.map(item => {
        const read = isRead(item, records), p = priority(item, today), href = safeURL(item.url);
        return `<article class="reg-row${read ? ' is-read' : ''}" data-item-id="${esc(item.id)}"><div class="row-content"><div class="row-meta">${read ? '' : '<span class="unread-dot" aria-label="미확인"></span>'}${badge(item)}${p.tier ? `<span class="priority-flag">↑ 우선 검토</span>` : ''}</div><h3><button class="reg-title" data-action="detail" data-id="${esc(item.id)}">${highlight(item.title)}</button></h3><p class="dept-line">${highlight(item.dept)}<span class="mobile-posted">${dateLabel(item)} ${esc(dateDisplay(item.date))}</span></p><div class="row-actions">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${item.category === '공포법령' ? '법령·개정이유 원문' : '원문 보기'} ↗</a><button data-action="copy" data-id="${esc(item.id)}" aria-label="${esc(item.title)} 링크 복사">링크 복사</button>` : '<span class="unknown-date">원문 링크 미확인</span>'}</div></div><div class="row-date">${esc(dateDisplay(item.date))}<span class="date-label">${dateLabel(item)}</span></div><div class="row-deadline">${deadlineHTML(item)}</div><button class="read-toggle" data-action="read" data-id="${esc(item.id)}" aria-pressed="${read}" aria-label="${esc(item.title)} ${read ? '미확인으로 변경' : '확인 완료 처리'}" title="${read ? '미확인으로 변경' : '확인 완료 처리'}">${read ? '✓' : '○'}</button></article>`;
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
    const related = relevance(item), p = priority(item, today), href = safeURL(item.url), read = isRead(item, records);
    $('detail-content').innerHTML = `${badge(item)}<h2 id="detail-title" class="detail-title">${esc(item.title)}</h2><section class="detail-section"><dl class="detail-meta"><dt>담당 부서</dt><dd>${esc(item.dept)}</dd><dt>${dateLabel(item)}</dt><dd>${esc(dateDisplay(item.date))}</dd>${item.prom_no ? `<dt>공포·발령번호</dt><dd>제${esc(item.prom_no)}호</dd>` : ''}<dt>시행일</dt><dd>${effectiveDate(item) ? `${esc(item.enf_date)} · ${esc(dDay(item.enf_date, today))}` : '미수집 · 원문 확인 필요'}</dd>${item.category === '입법예고' ? '<dt>의견제출 마감</dt><dd>미수집 · 입법예고 원문에서 확인</dd>' : ''}<dt>확인 상태</dt><dd>${read ? '확인 완료' : '미확인'}<small>이 브라우저의 UI 2.0 기록</small></dd></dl></section><section class="detail-section"><h3>검토 우선순위 근거</h3><p>${esc(p.reason)}${p.tier ? ' · 규칙 기반 후보' : ''}</p><p>자산운용 관련 키워드: ${related.direct.length ? esc(related.direct.join(', ')) : '일치 없음'}</p><p>공통 준법 키워드: ${related.common.length ? esc(related.common.join(', ')) : '일치 없음'}</p><p>제목·부서 기준 분류입니다. 실제 적용 여부와 대응 기한은 원문 및 회사 업무를 대조해 확인하세요.</p></section><section class="detail-section"><h3>원문 확인</h3><p>${item.category === '공포법령' ? '법령 링크는 법령명 기준 주소입니다. 수집된 개정본을 확인하려면 원문의 연혁·제정개정이유에서 공포번호와 날짜를 대조하세요. 시행일 경과는 현재 유효함을 의미하지 않습니다.' : '수집 데이터에는 본문·요약·첨부파일이 포함되지 않습니다. 원문에서 세부 내용과 기한을 확인하세요.'}</p><div class="detail-actions"><button class="primary-action" data-action="read" data-id="${esc(item.id)}" aria-pressed="${read}">${read ? '미확인으로 변경' : '확인 완료'}</button>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${item.category === '공포법령' ? '법령·개정이유 원문' : '원문 보기'} ↗</a><button data-action="copy" data-id="${esc(item.id)}">링크 복사</button>` : '<span>원문 링크 미확인</span>'}</div></section>`;
  }
  function openDetail(id) {
    const item = byId.get(id); if (!item) return;
    previousFocus = document.activeElement; selectedId = id; detailContent(item);
    $('detail-dialog').showModal(); $('detail-dialog').scrollTop = 0; $('close-detail').focus();
  }
  async function copyLink(item) {
    const url = safeURL(item.url); if (!url) { toast('유효한 원문 링크가 없습니다.'); return; }
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
  function resetFilters() { Object.assign(state, { search: '', category: 'all', laws: new Set(), unread: false, focus: 'all', sort: 'latest', page: 1 }); $('search-input').value = ''; }
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
  $('category-tabs').addEventListener('click', event => { const btn = event.target.closest('[data-category]'); if (btn) { state.category = btn.dataset.category; state.page = 1; render(); [...$('category-tabs').children].find(el => el.dataset.category === state.category)?.focus(); } });
  $('law-filters').addEventListener('click', event => { const btn = event.target.closest('[data-law]'); if (btn) { state.laws.has(btn.dataset.law) ? state.laws.delete(btn.dataset.law) : state.laws.add(btn.dataset.law); state.page = 1; render(); } });
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
