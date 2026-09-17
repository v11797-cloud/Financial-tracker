import { parseDocument } from 'htmlparser2';

const BASE = 'https://law.kofia.or.kr';
const hasClass = (node, name) => (node.attribs?.class || '').split(/\s+/).includes(name);
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) { const result = find(child, predicate); if (result) return result; }
  return null;
}
function text(node) {
  if (!node || ['script', 'style', 'noscript'].includes(node.name)) return '';
  if (node.type === 'text') return node.data;
  if (node.name === 'br') return '\n';
  const value = (node.children || []).map(text).join('');
  return /^(p|div|tr|li|h[1-6])$/.test(node.name || '') ? '\n' + value + '\n' : value;
}
const clean = value => value.replace(/[\t\r\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const titleKey = value => value.normalize('NFKC').replace(/\s+/g, '');
function adjacentValue(table, label) {
  const th = find(table, n => n.name === 'th' && clean(text(n)) === label);
  let next = th?.next;
  while (next && next.name !== 'td' && next.name !== 'th') next = next.next;
  return next?.name === 'td' ? clean(text(next)) : '';
}
export function parseDetail(html, regulation, kind) {
  if (!html.toLowerCase().includes('</html>')) throw new Error('Incomplete source');
  const tree = parseDocument(html), table = find(tree, n => n.name === 'table' && hasClass(n, 'brdComView'));
  if (!table) throw new Error('Missing source table');
  const title = adjacentValue(table, '규정명');
  const date = adjacentValue(table, kind === 'notice' ? '예고시작일' : '제ㆍ개정일');
  if (!title || titleKey(title) !== titleKey(regulation.title) || !date || date !== regulation.published_date) throw new Error('Source identity mismatch');
  return { content: clean(text(find(table, n => hasClass(n, 'storyIn')))),
    fullLink: find(table, n => n.name === 'a' && n.attribs?.id === 'fullscreen')?.attribs.href || '' };
}
export function parseFullText(html, regulation) {
  if (!html.toLowerCase().includes('</html>')) throw new Error('Incomplete full text');
  const tree = parseDocument(html), body = find(tree, n => n.attribs?.id === 'lawcontent');
  const title = clean(text(find(body || {}, n => hasClass(n, 'lawname'))));
  if (!body || titleKey(title) !== titleKey(regulation.title)) throw new Error('Full text identity mismatch');
  return clean(text(body));
}
async function getHTML(url, options, fetcher) {
  // Every URL is constructed from a fixed host/path and validated numeric IDs.
  // Reject redirects rather than allowing fetch to follow arbitrary locations.
  const response = await fetcher(url, { ...options, redirect: 'manual', headers: { 'User-Agent': 'RegWatch-Source/1.0', ...(options.headers || {}) } });
  if (!response.ok || response.status >= 300 || !response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Source unavailable');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, html = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 2000000) { await reader.cancel(); throw new Error('Source too large'); }
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}
export async function fetchKofiaSource(regulation, signal, fetcher = fetch) {
  const match = /^kofia_(notice|revision)_(\d{1,12})$/.exec(regulation.id);
  if (regulation.source !== 'KOFIA' || !match) throw new Error('Unsupported source');
  const [, type, seq] = match;
  const url = type === 'notice' ? `${BASE}/service/revisionNotice/revisionNoticeView.do` : `${BASE}/service/revision/revisionView.do?historySeq=${seq}`;
  const options = type === 'notice' ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ revisionSeq: seq, page: '1', searchType: '', searchValue: '' }).toString(), signal } : { signal };
  const detail = parseDetail(await getHTML(url, options, fetcher), regulation, type);
  let content = detail.content, kind = type === 'notice' ? 'notice_body' : 'revision_summary', contentUrl = url;
  if (content.length < 80 && type === 'revision') {
    const link = new URL(detail.fullLink, BASE);
    const law = link.searchParams.get('seq');
    if (link.origin !== BASE || link.pathname !== '/service/law/lawFullScreen.do' || link.searchParams.get('historySeq') !== seq || !/^\d{1,12}$/.test(law || '')) throw new Error('Unverified version link');
    contentUrl = `${BASE}/service/law/lawFullScreenContent.do?seq=${law}&historySeq=${seq}`;
    content = parseFullText(await getHTML(contentUrl, { signal }, fetcher), regulation);
    kind = 'version_fulltext';
  }
  // A heading or an attachment-only notice does not constitute usable content.
  if (content.length < 80 || !/[가-힣]/.test(content)) throw new Error('No usable source body');
  const contentHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))].map(n => n.toString(16).padStart(2, '0')).join('');
  return { id: regulation.id, title: regulation.title, published_date: regulation.published_date,
    content: content.slice(0, 12000), source_url: contentUrl, kind,
    retrieved_at: new Date().toISOString(), content_hash: contentHash,
    total_characters: content.length, truncated: content.length > 12000, attachments_included: false };
}
