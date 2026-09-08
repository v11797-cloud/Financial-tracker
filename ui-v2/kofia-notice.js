// KOFIA notice detail accepts form POST, not a query-only GET permalink.
// The destination and field names are fixed; only a numeric notice ID is accepted.
(() => {
  'use strict';
  const id = new URLSearchParams(window.location.search).get('revisionSeq');
  if (!id || !/^\d{1,12}$/.test(id)) {
    document.getElementById('source-message').textContent = '올바른 예고 번호가 없습니다. 대시보드에서 원문 링크를 다시 선택하세요.';
    return;
  }
  document.getElementById('notice-seq').value = id;
  document.getElementById('source-submit').disabled = false;
  document.getElementById('kofia-source-form').requestSubmit();
})();
