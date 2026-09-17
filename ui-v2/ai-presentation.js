/* Display-only helpers: score calculation and stored analysis remain unchanged. */
(function(root) {
  'use strict';
  const text = value => typeof value === 'string' ? value.trim() : '';
  function short(value, max = 180) {
    const lines = text(value).replace(/\s+/g,' ').match(/[^.!?。]+[.!?。]?/g) || [];
    const result = lines.slice(0,2).join('').trim();
    return result.length > max ? result.slice(0,max-1).trimEnd() + '…' : result;
  }
  function getTopAffectedFunctions(analysis, taxonomy, limit = 3) {
    return Object.entries(analysis?.affected_functions || {}).filter(([key,value]) => taxonomy[key] && Number.isFinite(value) && value > 0).sort((a,b) => b[1]-a[1]).slice(0,limit).map(([key]) => taxonomy[key]);
  }
  function days(date, today) {
    const parse = value => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN; const n = Date.parse(value+'T00:00:00Z'); return Number.isFinite(n) && new Date(n).toISOString().slice(0,10) === value ? n : NaN; };
    const n = (parse(date)-parse(today))/86400000; return Number.isFinite(n) ? n : null;
  }
  function deadline(regulation, today) {
    const effective = days(regulation.effective_date,today), comment = days(regulation.comment_deadline,today);
    if (effective !== null && effective >= 0) return `시행 ${effective === 0 ? 'D-Day' : 'D-'+effective}`;
    if (comment !== null && comment >= 0) return `의견마감 ${comment === 0 ? 'D-Day' : 'D-'+comment}`;
    return regulation.published_date === today ? '신규' : '원문 일정 확인';
  }
  function getTopReviewReasons(analysis, regulation, today, taxonomy) {
    const reasons = (analysis?.why_priority || []).filter(v => text(v)).map(v => short(v,85));
    if (reasons.length) return [...new Set(reasons)].slice(0,3);
    const result = [], effective = days(regulation.effective_date,today), comment = days(regulation.comment_deadline,today);
    if (effective !== null && effective >= 0 && effective <= 30) result.push(effective === 0 ? '오늘 시행 예정' : `시행일까지 ${effective}일 남음`);
    if (comment !== null && comment >= 0 && comment <= 30) result.push(comment === 0 ? '오늘 의견제출 마감' : `의견제출 마감까지 ${comment}일 남음`);
    const functions = getTopAffectedFunctions(analysis,taxonomy,2);
    if (functions.length) result.push(functions.join(' · ')+' 관련 키워드 포함');
    if (regulation.published_date === today) result.push('오늘 게시된 자료');
    return result.slice(0,3).length ? result.slice(0,3) : ['공식 원문과 당사 업무의 관련성 확인 필요'];
  }
  function getTopReviewActions(analysis) {
    const values = [...(analysis?.review_questions || []), ...(analysis?.recommended_actions || []).map(v => v?.action)].filter(v => text(v));
    const groups = [/적용|대상/, /내규|규정/, /프로세스|절차|업무.*영향/, /시스템|전산/, /교육|공지|안내/];
    const selected = [];
    for (const group of groups) { const value = values.find(v => group.test(v) && !selected.includes(v)); if (value) selected.push(value); if (selected.length === 3) break; }
    for (const v of values) { if (selected.length >= 3) break; if (!selected.includes(v)) selected.push(v); }
    const defaults = ['당사 적용 대상 여부','관련 내규 확인','업무 영향 여부 확인'];
    if (!selected.length) return defaults;
    return selected.map(v => short(v,90)).slice(0,3);
  }
  const api = { short, days, deadline, getTopAffectedFunctions, getTopReviewReasons, getTopReviewActions };
  root.RegWatchPresentation = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
