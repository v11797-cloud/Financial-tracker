/* An optional enhancement. app.js remains the owner of filters and review records. */
(() => {
  'use strict';
  const A = window.RegWatchAI, P = window.RegWatchPresentation;
  if (!A || !P) return;
  const e = A.esc, results = new Map(), hydrating = new Set();
  let context, candidates = [], allEligible = [], selected = null, generation = 0;
  const identity = item => JSON.stringify({ ...A.normalize(item), content: item.content || '', endpoint: window.REGWATCH_AI_CONFIG?.endpoint || '' });
  function entry(item) {
    const saved = results.get(identity(item));
    if (saved && Date.now() - saved.time < (saved.value.source === 'ai' ? Math.min(86400000, window.REGWATCH_AI_CONFIG?.cacheTtlMs || 86400000) : 60000)) return saved.value;
    return { source: 'rule', status: A.configured() ? 'waiting' : 'rule', data: A.buildFallbackAIAnalysis(item, context?.today) };
  }
  function scores(item) {
    const result = entry(item), rule = A.calculateRuleScore(item, context?.today);
    const final = A.calculateFinalPriorityScore(rule, result.status === 'unavailable' || result.status === 'waiting' ? 0 : result.data.ai_impact_score);
    const view = context?.scope === 'asset' ? 'investment' : context?.scope;
    return { result, rule, final, view: final + (result.data.affected_functions[view] || 0) * 2 };
  }
  function ranked() {
    const useOriginal = A.configured() && (candidates.every(i => entry(i).source !== 'ai') || candidates.some(i => entry(i).status === 'unavailable'));
    if (useOriginal) return context.sortItems(allEligible, 'priority', context.today);
    const compare = (a,b) => scores(b).view - scores(a).view || a.id.localeCompare(b.id);
    // Retain the existing ten-candidate ranking, then offer every remaining rule candidate as backfill.
    const head = new Set(candidates.map(item => item.id));
    return [...[...candidates].sort(compare), ...allEligible.filter(item => !head.has(item.id)).sort(compare)];
  }
  function render(ctx) {
    context = ctx;
    if (window.REGWATCH_AI_CONFIG?.enabled === false) { document.getElementById('ai-daily').hidden = true; return; }
    const eligible = ctx.items.filter(i => !ctx.isRead(i, ctx.records) && ctx.priority(i, ctx.today).tier > 0);
    allEligible = eligible;
    candidates = [...eligible].sort((a, b) => A.calculateRuleScore(b, ctx.today) - A.calculateRuleScore(a, ctx.today) || a.id.localeCompare(b.id)).slice(0, 10);
    paint();
    // Cache lookup is local; opening the page never sends AI requests.
    if (A.configured()) for (const item of candidates) {
      const key = identity(item);
      if (hydrating.has(key) || (results.has(key) && entry(item).source === 'ai')) continue;
      hydrating.add(key);
      A.getAICache(item, true).then(cached => { if (cached) { results.set(key, { time: cached.created, value: { source: 'ai', status: 'complete', data: cached.data, sourceDocument: cached.sourceDocument } }); paint(); } }).finally(() => hydrating.delete(key));
    }
  }
  function paint() {
    if (!context) return;
    const ordered = ranked(), store = window.RegWatchPriority;
    store?.configure(ordered, context.items);
    const top = store ? store.getVisiblePriorityRegulations() : ordered.slice(0,3);
    context.syncPriorityButtons?.();
    document.getElementById('priority-list').innerHTML = top.length ? top.map((item,index) => {
      const result = entry(item), a = result.data, regulation = A.normalize(item);
      const meta = [...P.getTopAffectedFunctions(a,A.taxonomy,2), P.deadline(regulation,context.today)];
      if (regulation.published_date === context.today && !meta.includes('신규')) meta.push('신규');
      return `<article class="ai-priority-row"><button class="priority-summary" data-action="ai-detail" data-id="${e(item.id)}" aria-label="${e(item.title)} 검토 요약 보기"><span class="priority-number" aria-hidden="true">${index+1}</span><span><strong>${e(item.title)}</strong><small>${e(meta.join(' · '))}</small></span><span class="priority-arrow" aria-hidden="true">→</span></button><button class="priority-remove" data-action="priority-exclude" data-id="${e(item.id)}" title="우선검토에서 제외" aria-label="${e(item.title)}을 우선검토에서 제외">×</button></article>`;
    }).join('') : '<div class="rail-empty"><p>현재 표시할 우선검토 안건이 없습니다.</p><p>제외한 안건을 복원하거나 전체 규제에서 직접 추가할 수 있습니다.</p><button class="text-button" data-action="priority-excluded">제외한 안건 보기</button></div>';
    const daily = document.getElementById('ai-daily'); daily.hidden = false;
    document.getElementById('ai-daily-summary').textContent = top.length ? `오늘 우선 확인할 규제 ${top.length}건이 있습니다.` : '오늘 우선 확인할 규제가 없습니다.';
    const spotlight = document.getElementById('ai-daily-top');
    const highest = [...top].sort((a,b) => scores(b).final - scores(a).final || a.id.localeCompare(b.id))[0];
    spotlight.innerHTML = top.length ? `<p class="brief-label">가장 중요한 변화</p><button data-action="ai-detail" data-id="${e(highest.id)}">${e(highest.title)}</button><p class="brief-reason">${e(P.short(entry(highest).data.one_line_summary,100))}</p>` : '<p class="brief-reason">최근 업데이트된 규제를 확인하거나 전체 규제 피드를 살펴보세요.</p>';
    const fresh = context.items.filter(i => A.normalize(i).published_date === context.today).length;
    const upcoming = context.items.filter(i => { const n = P.days(A.normalize(i).effective_date,context.today); return n !== null && n >= 0 && n <= 30; }).length;
    document.getElementById('ai-daily-counts').textContent = `신규 ${fresh} · 우선검토 ${top.length} · 시행임박 ${upcoming}`;
    const link = document.getElementById('ai-daily-link');
    link.textContent = top.length ? `오늘의 우선검토 ${top.length}건 보기 →` : '전체 규제 피드 보기 →';
    link.onclick = () => { const target = document.getElementById(top.length ? 'priority-list' : 'regulation-list'); target.scrollIntoView({block:'center',behavior:'smooth'}); target.querySelector('button')?.focus({preventScroll:true}); };
  }
  function detail(item, today) {
    selected = item; generation++;
    paintDetail(item, today);
  }
  function paintDetail(item, today = context?.today) {
    const host = document.getElementById('ai-detail-section'); if (!host || selected?.id !== item.id) return;
    const result = entry(item), a = result.data, regulation = A.normalize(item);
    const summary = P.short(a.one_line_summary || A.buildFallbackAIAnalysis(item,today).one_line_summary);
    const reasons = P.getTopReviewReasons(result.source === 'ai' ? a : {...a,why_priority:[]},regulation,today,A.taxonomy);
    const actions = P.getTopReviewActions(a), functions = P.getTopAffectedFunctions(a,A.taxonomy);
    host.innerHTML = `<section class="brief-section"><h3>검토 요약</h3><p>${e(summary)}</p></section><section class="brief-section"><h3>왜 확인해야 하나요?</h3><ul>${reasons.map(v => `<li>${e(v)}</li>`).join('')}</ul></section><section class="brief-section"><h3>무엇을 확인하면 되나요?</h3><div class="ai-questions">${actions.map(v => `<label><input type="checkbox"> <span>${e(v)}</span></label>`).join('')}</div></section><section class="brief-section"><h3>관련 업무</h3><p>${e(functions.join(' · ') || '공식 원문 확인 필요')}</p></section>`;
  }
  async function analyze(item) {
    const requestGeneration = generation, key = identity(item);
    const result = await A.requestAIAnalysis(item, { today: context?.today, eligible: candidates.some(i => i.id === item.id) });
    results.set(key, { time: result.created || Date.now(), value: result }); paint();
    if (requestGeneration === generation && selected?.id === item.id && document.getElementById('detail-dialog').open) paintDetail(item);
  }
  window.RegWatchAIUI = { render, detail, analyze };
})();
