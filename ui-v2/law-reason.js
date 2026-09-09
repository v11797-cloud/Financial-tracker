/* Text-only official amendment reasons; no remote HTML is injected. */
(() => {
  'use strict';
  const id = new URLSearchParams(location.search).get('id');
  const item = Array.isArray(window.regulatoryData) && window.regulatoryData.find(item => item.id === id);
  const payload = window.lawReasons;
  const record = payload?.schema_version === 1 && Object.prototype.hasOwnProperty.call(payload.items || {}, id) ? payload.items[id] : null;
  const title = document.getElementById('reason-title');
  const status = document.getElementById('reason-status');
  if (!item) {
    title.textContent = '개정 정보를 찾을 수 없습니다';
    status.textContent = '규제 피드에서 해당 게시글을 다시 열어 주세요.';
    return;
  }
  title.textContent = item.law_name;
  document.title = `${item.law_name} 제·개정이유 | UI 2.0`;
  const dateLabel = item.id.startsWith('admrul_') ? '발령일' : '공포일';
  document.getElementById('reason-meta').textContent = `제${item.prom_no}호 · ${dateLabel} ${item.date} · 시행일 ${item.enf_date || '미수집'}`;
  if (!record || !['id', 'law_name', 'prom_no', 'date'].every(key => record[key] === item[key])) {
    status.textContent = '해당 개정 건의 개정이유를 아직 확인하지 못했습니다. 자료 갱신 후 다시 확인해 주세요.';
    return;
  }
  if (record.status !== 'available' || !record.text) {
    status.textContent = '국가법령정보센터에서 이 개정 건의 제·개정이유가 제공되지 않습니다.';
    return;
  }
  const text = document.getElementById('reason-text');
  text.textContent = record.text;
  text.hidden = false;
  status.hidden = true;
})();
