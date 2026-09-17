(function (root) {
  'use strict';
  const S = typeof module !== 'undefined' && module.exports ? require('./ai-schema.js') : root.RegWatchSchema;
  const DAY = 86400000, TTL = DAY, memory = new Map(), pending = new Map(), failures = new Map(), queue = [];
  let active = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
  const config = () => root.REGWATCH_AI_CONFIG || {};
  const nowDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  function dateNumber(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const n = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n / DAY : null;
  }
  function delta(date, today) { const a = dateNumber(date), b = dateNumber(today); return a === null || b === null ? null : a - b; }
  function normalize(item) {
    const str = (value, max = 500) => typeof value === 'string' ? value.slice(0, max).trim() : '';
    const type = str(item.type || item.category);
    return { id: str(item.id), title: str(item.title, 1000), source: str(item.source || (/^fss_/.test(item.id) ? '금융감독원' : /^law_|^admrul_/.test(item.id) ? '국가법령정보센터' : /^no|^po/.test(item.id) ? '금융위원회' : '기관 미수집')), department: str(item.department || item.dept), published_date: str(item.published_date || item.date), effective_date: str(item.effective_date || (type === '공포법령' ? item.enf_date : '')), comment_deadline: str(item.comment_deadline || (type === '입법예고' ? item.notice_end_date : '')), type, keywords: Array.isArray(item.keywords) ? item.keywords.filter(v => typeof v === 'string').slice(0, 30).map(v => v.slice(0, 80)) : [], content: str(item.content, 12000), original_url: str(item.original_url || item.url, 2000) };
  }
  const mappings = [
    [/AML|자금세탁|특금법/i, { aml: 5, compliance: 4, internal_control: 3 }],
    [/내부통제|책무구조도|지배구조/, { internal_control: 5, compliance: 5, risk: 3 }],
    [/금융소비자|금소법|광고/, { compliance: 5, sales: 4, product: 3 }],
    [/전자금융/, { it: 5, internal_control: 3, risk: 3 }],
    [/개인정보/, { privacy: 5, compliance: 4, it: 3 }],
    [/펀드|집합투자|투자신탁|ETF|ETN/i, { investment: 5, product: 4, compliance: 3 }],
    [/공시/, { disclosure: 5, compliance: 3 }], [/리스크|위험관리/, { risk: 5 }],
    [/재무|회계/, { finance: 4 }], [/인사|임직원|교육/, { hr: 3 }],
    [/자본시장|금융투자|증권|자산운용/, { investment: 3, compliance: 3 }]
  ];
  function impacts(r) {
    const result = Object.fromEntries(Object.keys(S.taxonomy).map(k => [k, 0]));
    const text = [r.title, r.department, ...r.keywords].join(' ');
    for (const [pattern, scores] of mappings) if (pattern.test(text)) for (const [key, value] of Object.entries(scores)) result[key] = Math.max(result[key], value);
    return result;
  }
  function ruleBreakdown(item, today = nowDay()) {
    const r = normalize(item), due = delta(r.effective_date, today), end = delta(r.comment_deadline, today), age = delta(r.published_date, today);
    const max = Math.max(...Object.values(impacts(r)));
    return { effective: due !== null && due >= 0 ? due <= 7 ? 20 : due <= 30 ? 15 : due <= 90 ? 5 : 0 : 0,
      deadline: end !== null && end >= 0 ? end <= 7 ? 10 : end <= 30 ? 7 : 0 : 0,
      keywords: Math.min(15, max * 3), type: ({ 공포법령: 10, 입법예고: 8, 보도자료: 4, 금융시장동향: 1 })[r.type] || 0,
      recency: age !== null && age <= 0 ? age >= -7 ? 5 : age >= -30 ? 3 : age >= -90 ? 1 : 0 : 0 };
  }
  function calculateRuleScore(item, today) { return Object.values(ruleBreakdown(item, today)).reduce((a, b) => a + b, 0); }
  function calculateFinalPriorityScore(ruleScore, aiImpactScore) { return Math.round(clamp(ruleScore, 60) + clamp(aiImpactScore, 40)); }
  function buildFallbackAIAnalysis(item, today = nowDay()) {
    const r = normalize(item), affected = impacts(r), rule = ruleBreakdown(r, today), owners = Object.keys(affected).filter(k => affected[k] > 0).sort((a, b) => affected[b] - affected[a]);
    const impact = Math.min(40, Math.max(...Object.values(affected)) * 3 + affected.internal_control * 2 + (/개정|변경|강화|도입/.test(r.title) && owners.length ? 5 : 0) + (rule.effective || rule.deadline ? 5 : 0));
    return { analysis_level: 'metadata_only', ai_impact_score: impact, confidence: owners.length ? 35 : 15, priority_level: S.level(calculateFinalPriorityScore(calculateRuleScore(r, today), impact)),
      one_line_summary: owners.length ? `${owners.slice(0, 2).map(k => S.taxonomy[k]).join('·')} 관련 키워드가 있어 업무 영향 여부 확인이 필요합니다.` : '제목·담당부서만으로 업무 영향을 판단하기 어려워 원문 확인이 필요합니다.',
      why_priority: [rule.effective ? '수집된 시행일이 가까워 일정 확인이 필요합니다.' : '시행 임박 여부는 수집된 날짜와 원문을 대조해야 합니다.', rule.deadline ? '의견제출 마감이 가까워 제출 조건 확인이 필요합니다.' : '의견제출 마감과 실제 적용대상은 원문 확인이 필요합니다.', owners.length ? `제목·담당부서·키워드에서 ${owners.slice(0, 3).map(k => S.taxonomy[k]).join(', ')} 관련성을 탐지했습니다.` : '업무 관련 키워드 일치가 확인되지 않았습니다.'],
      asset_management_impact: [
        '제목·담당부서·키워드에 따른 검토 관점입니다. 자산운용사에 대한 실제 적용 여부와 구체적인 변경사항은 공식 원문 확인이 필요합니다.',
        ...(affected.internal_control ? ['내부통제: 자산운용사의 운용 의사결정·준법 점검·보고 체계와 관련된 내용인지, 현행 내부통제기준에 영향을 주는지 확인할 필요가 있습니다.'] : []),
        ...(affected.aml ? ['자금세탁방지: 자산운용사와 판매사 간 고객확인·거래 모니터링의 역할 분담에 영향을 주는 내용인지 확인할 필요가 있습니다.'] : []),
        ...(affected.investment || affected.product ? ['운용·상품: 펀드의 투자대상·운용 절차·상품 설계와 관련된 내용인지, 기존 펀드와 신규 상품을 구분해 검토할 필요가 있습니다.'] : []),
        ...(affected.sales ? ['판매·투자자 보호: 판매사와 공유하는 상품 설명·광고·투자자 안내 절차에 영향을 주는 내용인지 확인할 필요가 있습니다.'] : []),
        ...(affected.it || affected.privacy ? ['시스템·정보 관리: 운용 및 고객정보 처리 시스템의 관리 절차와 관련된 내용인지 확인할 필요가 있습니다.'] : []),
        ...(affected.disclosure ? ['공시: 펀드 또는 운용사의 공시·보고 항목과 관련된 내용인지, 제출 주체와 범위를 확인할 필요가 있습니다.'] : []),
        ...(owners.length ? [] : ['현재 정보만으로 자산운용업계와의 직접적인 관련성을 확인하기 어렵습니다. 원문의 적용대상과 관련 업무를 먼저 확인해야 합니다.'])
      ].slice(0, 5),
      affected_functions: affected,
      recommended_actions: ['공식 원문 및 당사 적용대상 확인', '현행 내규와 업무절차 영향 여부 검토', '담당 부서 의견 확인', '필요 시 내규 개정 여부 검토', '변경사항 확인 후 임직원 안내 필요성 검토'].map((action, i) => ({ action, priority: i < 2 ? 'high' : 'medium', owner: owners.length ? S.taxonomy[owners[0]] : '담당자 지정 필요' })),
      change_points: ['규칙 분석에서는 구체적 규제 변경내용을 확인하지 않았습니다. 공식 원문 확인이 필요합니다.'],
      review_questions: ['당사 적용대상인가?', '관련 내규가 존재하는가?', '업무 프로세스 변경이 필요한가?', '시스템 변경이 필요한가?', '임직원 교육이 필요한가?'],
      cautions: ['RULE ANALYSIS: 제목·부서·날짜·키워드 기반 예비 분류입니다. 영향도는 실제 적용을 의미하지 않습니다.'] };
  }
  async function hashRegulation(item) {
    // Hash all supplied content, including the portion beyond the API payload limit.
    const value = JSON.stringify({ ...normalize(item), content: typeof item.content === 'string' ? item.content : '', source_hash: item.source_hash || '' });
    const bytes = new TextEncoder().encode(value);
    const hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  const keyFor = async item => `regwatch_ai_v2_${encodeURIComponent(item.id)}_${await hashRegulation(item)}`;
  function validFor(data, item) {
    return S.matches(data) && (data.analysis_level !== 'metadata_only' || data.confidence <= 40) && (normalize(item).content ? true : data.analysis_level === 'metadata_only');
  }
  function validSourceDocument(doc, item) {
    const r = normalize(item);
    if (!doc || r.source !== 'KOFIA' || doc.id !== r.id || doc.title !== r.title || doc.published_date !== r.published_date || typeof doc.content !== 'string' || doc.content.length < 80 || doc.content.length > 12000 || !/^[a-f0-9]{64}$/.test(doc.content_hash || '')) return false;
    if (!['notice_body', 'revision_summary', 'version_fulltext'].includes(doc.kind) || !Number.isFinite(Date.parse(doc.retrieved_at)) || typeof doc.truncated !== 'boolean' || doc.attachments_included !== false) return false;
    try {
      const url = new URL(doc.source_url);
      const match = /^kofia_(notice|revision)_(\d{1,12})$/.exec(r.id);
      if (!match || url.origin !== 'https://law.kofia.or.kr') return false;
      if (match[1] === 'notice') return doc.kind === 'notice_body' && url.pathname === '/service/revisionNotice/revisionNoticeView.do';
      return doc.kind !== 'notice_body' && url.searchParams.get('historySeq') === match[2] && ['/service/revision/revisionView.do', '/service/law/lawFullScreenContent.do'].includes(url.pathname);
    } catch { return false; }
  }
  function readCache(key) {
    if (memory.has(key)) return memory.get(key);
    try { return JSON.parse(root.localStorage.getItem(key) || 'null'); } catch { return null; }
  }
  function writeCache(key, value) {
    memory.set(key, value);
    try { root.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Memory fallback. */ }
  }
  async function getAICache(item, withTimestamp = false) {
    try {
      const baseKey = await keyFor(item), first = readCache(baseKey);
      const key = typeof first?.cacheKey === 'string' && first.cacheKey.startsWith('regwatch_ai_v2_') ? first.cacheKey : baseKey;
      const entry = key === baseKey ? first : readCache(key);
      let analyzedItem = item;
      if (normalize(item).source === 'KOFIA') {
        if (!validSourceDocument(entry?.sourceDocument, item)) return null;
        analyzedItem = { ...item, content: entry.sourceDocument.content, source_hash: entry.sourceDocument.content_hash };
        if (key !== await keyFor(analyzedItem)) return null;
      }
      const age = Date.now() - entry?.created;
      const sourceAge = entry?.sourceDocument ? Date.now() - Date.parse(entry.sourceDocument.retrieved_at) : 0;
      if (!entry || !Number.isFinite(age) || age < 0 || sourceAge < -60000 || sourceAge >= TTL || age >= Math.min(TTL, config().cacheTtlMs || TTL) || entry.endpoint !== config().endpoint || !validFor(entry.data, analyzedItem)) {
        memory.delete(key); return null;
      }
      memory.set(key, entry); return withTimestamp ? { data: entry.data, created: entry.created, sourceDocument: entry.sourceDocument || null } : entry.data;
    } catch { return null; }
  }
  async function setAICache(item, data, sourceDocument = null) {
    if (normalize(item).source === 'KOFIA' && !validSourceDocument(sourceDocument, item)) return;
    const analyzedItem = sourceDocument ? { ...item, content: sourceDocument.content, source_hash: sourceDocument.content_hash } : item;
    if (!validFor(data, analyzedItem)) return;
    try {
      const baseKey = await keyFor(item), key = await keyFor(analyzedItem);
      writeCache(key, { created: Date.now(), endpoint: config().endpoint, data, sourceDocument });
      if (key !== baseKey) writeCache(baseKey, { cacheKey: key });
    } catch { /* Missing crypto must never break the existing UI. */ }
  }
  function drain() {
    while (active < 2 && queue.length) {
      const { task, resolve, reject } = queue.shift(); active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
    }
  }
  const schedule = task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); drain(); });
  function configured() { return config().enabled !== false && config().apiEnabled !== false && Boolean(config().endpoint); }
  async function requestAIAnalysis(item, { today = nowDay(), eligible = true } = {}) {
    const fallback = status => ({ source: 'rule', status, data: buildFallbackAIAnalysis(item, today) });
    if (!configured() || !eligible) return fallback('rule');
    const cached = await getAICache(item, true);
    if (cached) return { source: 'ai', status: 'complete', data: cached.data, created: cached.created, sourceDocument: cached.sourceDocument };
    let key;
    try { key = config().endpoint + await keyFor(item); } catch { return fallback('unavailable'); }
    if (pending.has(key)) return pending.get(key);
    if (Date.now() - (failures.get(key) || 0) < 60000) return fallback('unavailable');
    const promise = schedule(async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(30000, config().timeoutMs || 25000)));
      try {
        const endpoint = new URL(config().endpoint);
        if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('Invalid endpoint');
        const response = await fetch(endpoint.href, { method: 'POST', credentials: 'omit', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regulation: normalize(item), rule_score: calculateRuleScore(item, today), work_view: 'all' }) });
        const payload = await response.json();
        if (!response.ok) {
          failures.set(key, Date.now());
          return { ...fallback('unavailable'), sourceUnavailable: payload?.source_status === 'unavailable' };
        }
        const sourceDocument = payload.source_document || null, data = payload.analysis || payload;
        if (normalize(item).source === 'KOFIA' && !validSourceDocument(sourceDocument, item)) throw new Error('Missing official source');
        if (sourceDocument && !validSourceDocument(sourceDocument, item)) throw new Error('Invalid official source');
        if (!validFor(data, sourceDocument ? { ...item, content: sourceDocument.content } : item)) throw new Error('Invalid AI response');
        await setAICache(item, data, sourceDocument);
        return { source: 'ai', status: 'complete', data, sourceDocument, created: Date.now() };
      } catch { failures.set(key, Date.now()); return fallback('unavailable'); }
      finally { clearTimeout(timer); }
    });
    pending.set(key, promise);
    try { return await promise; } finally { pending.delete(key); }
  }
  function renderAIImpact(data) {
    return Object.entries(data.affected_functions).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<div class="ai-impact-row"><span>${esc(S.taxonomy[key])}</span><meter min="0" max="5" value="${value}" aria-label="${esc(S.taxonomy[key])} 영향 가능성 ${value}/5">${value}/5</meter><b>${value}</b></div>`).join('') || '<p>확인된 업무 영향이 없습니다. 원문 확인이 필요합니다.</p>';
  }
  function renderAIRecommendations(data) {
    return '<ol class="ai-actions">' + data.recommended_actions.map(a => `<li><span class="ai-tag">${esc(a.priority.toUpperCase())}</span> ${esc(a.action)}<small>Owner: ${esc(a.owner)}</small></li>`).join('') + '</ol>';
  }
  const api = { ...S, normalize, ruleBreakdown, calculateRuleScore, calculateFinalPriorityScore, buildFallbackAIAnalysis, hashRegulation, getAICache, setAICache, requestAIAnalysis, configured, renderAIImpact, renderAIRecommendations, validSourceDocument, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RegWatchAI = api;
})(globalThis);
