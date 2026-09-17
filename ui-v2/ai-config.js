(() => {
  'use strict';
  let endpoint = '';
  try { endpoint = localStorage.getItem('regwatch_ai_endpoint') || ''; } catch { /* Private/storage-disabled browsing remains usable. */ }
  window.REGWATCH_AI_CONFIG = { enabled: true, apiEnabled: false, endpoint, timeoutMs: 25000, cacheTtlMs: 24 * 60 * 60 * 1000, ...window.REGWATCH_AI_CONFIG };
})();
