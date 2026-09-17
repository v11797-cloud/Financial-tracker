/* Shared contract: loaded by the browser, Node tests and the Worker. */
(function (root) {
  'use strict';
  const taxonomy = { compliance: '준법감시', aml: 'AML / 자금세탁방지', internal_control: '내부통제', risk: '리스크관리', investment: '운용', sales: '영업', product: '상품', disclosure: '공시', it: 'IT / 시스템', privacy: '개인정보', finance: '재무', hr: '인사' };
  const number = (max) => ({ type: 'integer', minimum: 0, maximum: max });
  const strings = { type: 'array', items: { type: 'string' }, maxItems: 10 };
  const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const schema = object({
    analysis_level: { type: 'string', enum: ['metadata_only', 'content_based'] },
    ai_impact_score: number(40), confidence: number(100),
    priority_level: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    one_line_summary: { type: 'string' }, why_priority: strings,
    asset_management_impact: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
    affected_functions: object(Object.fromEntries(Object.keys(taxonomy).map(k => [k, number(5)]))),
    recommended_actions: { type: 'array', maxItems: 10, items: object({ action: { type: 'string' }, priority: { type: 'string', enum: ['high', 'medium', 'low'] }, owner: { type: 'string' } }) },
    change_points: strings, review_questions: strings, cautions: strings
  });
  function matches(value, spec = schema) {
    if (spec.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === spec.required.length && spec.required.every(k => Object.hasOwn(value, k) && matches(value[k], spec.properties[k]));
    if (spec.type === 'array') return Array.isArray(value) && value.length >= (spec.minItems || 0) && value.length <= spec.maxItems && value.every(v => matches(v, spec.items));
    if (spec.type === 'integer') return Number.isInteger(value) && value >= spec.minimum && value <= spec.maximum;
    return typeof value === 'string' && value.length <= 2000 && (!spec.enum || spec.enum.includes(value));
  }
  const level = score => score >= 90 ? 'critical' : score >= 75 ? 'high' : score >= 60 ? 'medium' : 'low';
  const disclaimer = 'AI 분석은 규제 검토를 보조하기 위한 참고자료입니다. 실제 적용 여부 및 대응 필요성은 공식 원문과 회사 업무를 담당자가 직접 대조하여 최종 판단해야 합니다.';
  const tooltip = 'AI 점수는 규제의 중요도를 확정하는 값이 아니라 업무 영향 가능성을 빠르게 선별하기 위한 보조 지표입니다.';
  const api = { taxonomy, schema, matches, level, disclaimer, tooltip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RegWatchSchema = api;
})(globalThis);
