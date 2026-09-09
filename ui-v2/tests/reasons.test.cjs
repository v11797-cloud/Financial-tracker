const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../app.js');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/regulatory_data.json'), 'utf8'));
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/law_reasons.js'), 'utf8'), context);
const records = context.window.lawReasons.items;

test('each targeted amendment routes to its own reasons and preserves original data', () => {
  const before = JSON.stringify(base);
  const items = base.filter(core.hasReasonView);
  assert.ok(items.length > 0);
  for (const item of items) {
    const url = new URL(core.sourceURL(item, 'https://example.test/Financial-tracker/ui-v2/'));
    assert.equal(url.pathname, '/Financial-tracker/ui-v2/law-reason.html');
    assert.equal(url.searchParams.get('id'), item.id);
    assert.ok(records[item.id], item.id);
    for (const key of ['id','law_name','date','prom_no']) assert.equal(records[item.id][key], item[key]);
    assert.ok(['available', 'not_provided'].includes(records[item.id].status));
  }
  assert.equal(JSON.stringify(base), before);
  const press = {...items[0], category:'보도자료'};
  assert.equal(core.sourceURL(press, 'https://example.test/'), core.safeURL(press.url));
  assert.equal(core.hasReasonView({...items[0],source:'KOFIA'}), false);
});

test('viewer displays text only, rejects mismatched amendment and handles unavailable source', () => {
  const item = base.find(x => core.hasReasonView(x) && records[x.id].status === 'available');
  const source = fs.readFileSync(path.join(__dirname, '../law-reason.js'), 'utf8');
  function render(record, id = item.id) {
    const nodes = {};
    const document = {getElementById(id) { return nodes[id] ||= {textContent:'',hidden:false}; }};
    vm.runInNewContext(source, {window:{regulatoryData:[item], lawReasons:{schema_version:1,items:{[item.id]:record}}}, document, location:{search:'?id='+encodeURIComponent(id)},URLSearchParams});
    return nodes;
  }
  let nodes = render({...records[item.id], text:'<script>alert(1)</script>\n개정이유'});
  assert.equal(nodes['reason-text'].textContent, '<script>alert(1)</script>\n개정이유');
  assert.equal(nodes['reason-status'].hidden, true);
  nodes = render({...records[item.id], prom_no:'WRONG'});
  assert.match(nodes['reason-status'].textContent, /아직 확인하지 못/);
  assert.equal(nodes['reason-text'], undefined);
  nodes = render({...records[item.id], status:'not_provided',text:''});
  assert.match(nodes['reason-status'].textContent, /제공되지 않습니다/);
  assert.match(render(records[item.id], 'unknown')['reason-title'].textContent, /찾을 수 없습니다/);
});
