const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../app.js');
const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/kofia_data.json'), 'utf8'));
const TODAY = '2026-09-07';
const state = {scope:'all',category:'all',unread:false,focus:'all',law:'all',search:''};

test('association filter uses classification and switches without retaining the prior law', () => {
  const selected = {...state, law:'자본시장'};
  selected.law = '협회규정';
  const association = core.filterItems(payload.items, selected, TODAY, {});
  assert.equal(association.length, payload.counts['협회규정']);
  assert.ok(association.every(item => item.source === 'KOFIA' && item.source_group === '협회규정'));
  selected.law = '모범규준';
  assert.equal(core.filterItems(payload.items, selected, TODAY, {}).length, payload.counts['모범규준']);
  selected.law = 'all';
  assert.equal(core.filterItems(payload.items, selected, TODAY, {}).length, payload.items.length);
  assert.equal(core.matchesLaw({title:'협회규정 개정 안내', source:'OTHER'}, '협회규정'), false);
});

test('KOFIA JS and JSON agree, permitted records preserved without mutation', () => {
  const before=JSON.stringify(payload), context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data/kofia_data.js'),'utf8'),context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.kofiaData)),payload);
  assert.equal(core.kofiaItems(payload).length,payload.items.length);
  assert.equal(JSON.stringify(payload),before);
});
test('UI fails closed for standard terms and unknown classification', () => {
  const rule=payload.items.find(i=>i.category==='공포법령');
  for(const source_group of ['표준약관','알 수 없음']) {
    assert.equal(core.kofiaItems({...payload,items:[{...rule,source_group,classification_path:[source_group]}]}).length,0);
  }
  assert.deepEqual(core.kofiaItems(null),[]);
  assert.deepEqual(core.kofiaItems({...payload,schema_version:999}),[]);
});
test('both feeds appear in requested tabs and are searchable by association', () => {
  const records=core.kofiaItems(payload);
  assert.equal(core.filterItems(records,{...state,category:'입법예고'},TODAY,{}).length,payload.counts.notices);
  assert.equal(core.filterItems(records,{...state,category:'공포법령'},TODAY,{}).length,payload.counts.revisions_included);
  assert.equal(core.filterItems(records,{...state,search:'금융투자협회'},TODAY,{}).length,records.length);
});
test('notice period never becomes a law effective date', () => {
  const notice=payload.items.find(i=>i.id==='kofia_notice_157');
  assert.equal(core.noticeEndDate(notice),'2026-09-21');
  assert.equal(core.daysUntil(core.noticeEndDate(notice),TODAY),14);
  assert.equal(core.effectiveDate(notice),null);
  assert.equal(core.priority(notice,TODAY).reason,'예고종료까지 14일');
  assert.equal(core.priority(notice,'2026-09-22').tier,0);
  const revision=payload.items.find(i=>i.category==='공포법령');
  assert.equal(core.effectiveDate(revision),null);
});
test('copyable notice link preserves Pages prefix and numeric notice identity', () => {
  const notice=payload.items.find(i=>i.id==='kofia_notice_157');
  assert.equal(core.sourceURL(notice,'https://v11797-cloud.github.io/Financial-tracker/ui-v2/'),'https://v11797-cloud.github.io/Financial-tracker/ui-v2/kofia-notice.html?revisionSeq=157');
  assert.equal(core.sourceURL({...notice,notice_seq:'../escape'},'https://example.com/ui-v2/'),null);
  assert.equal(core.sourceURL({...notice,notice_seq:'157&url=evil'},'https://example.com/ui-v2/'),null);
});
test('new deadline invalidates KOFIA read state without changing existing fingerprints', () => {
  const notice=payload.items.find(i=>i.id==='kofia_notice_157');
  assert.notEqual(core.fingerprint(notice),core.fingerprint({...notice,notice_end_date:'2026-09-22'}));
  const old={id:'one',title:'기존 규정',date:TODAY,dept:'부서',category:'공포법령',url:'https://example.com/law'};
  assert.equal(core.fingerprint(old),JSON.stringify([old.title,old.date,'',old.dept,old.category,'','','https://example.com/law']));
});
