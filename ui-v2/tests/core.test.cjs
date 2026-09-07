// Run from repository root: node --test ui-v2/tests/core.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../app.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/regulatory_data.json'), 'utf8'));
const state = overrides => ({ scope:'all', category:'all', unread:false, focus:'all', laws:new Set(), search:'', ...overrides });
const item = overrides => ({ id:'test', title:'일반 공지', dept:'금융위원회', category:'보도자료', date:'2026-09-04', url:'https://example.com/notice/1', ...overrides });
const TODAY = '2026-09-07';

test('KST day boundary is independent of the computer time zone', () => {
  assert.equal(core.kstToday(new Date('2026-09-06T14:59:59Z')), '2026-09-06');
  assert.equal(core.kstToday(new Date('2026-09-06T15:00:00Z')), TODAY);
  assert.equal(core.kstToday(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
});
test('strict calendar dates, leap years, no silent date rollover', () => {
  for (const bad of [null, undefined, '', '2026-02-29', '2026-13-01', '2026-04-31', '2026-9-7', 'bad']) assert.equal(core.dayNumber(bad), null);
  assert.notEqual(core.dayNumber('2028-02-29'), null);
  assert.equal(core.daysUntil('2028-03-01','2028-02-28'), 2);
});
test('D-Day distinguishes upcoming, today, historical and unknown', () => {
  assert.equal(core.dDay('2026-10-01',TODAY),'D-24');
  assert.equal(core.dDay('2026-10-02',TODAY),'D-25');
  assert.equal(core.dDay(TODAY,TODAY),'D-Day');
  assert.equal(core.dDay('1957-02-14',TODAY),'시행일 경과');
  assert.equal(core.dDay('',TODAY),'시행일 미수집');
  assert.equal(core.effectiveDate(item({category:'공포법령',date:TODAY})),null);
  assert.equal(core.effectiveDate(item({category:'입법예고',enf_date:TODAY})),null);
});
test('production JS and JSON match and exports are not mutated by v2 helpers', () => {
  const box = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../data/regulatory_data.js'),'utf8'),box);
  assert.deepEqual(JSON.parse(JSON.stringify(box.window.regulatoryData)),data);
  const before = JSON.stringify(data);
  core.sortItems(data,'priority',TODAY);
  core.filterItems(data,state({scope:'asset'}),TODAY,{});
  assert.equal(JSON.stringify(data),before);
  assert.equal(new Set(data.map(d=>d.id)).size,data.length);
});
test('preserves every original category and full population', () => {
  assert.equal(core.filterItems(data,state(),TODAY,{}).length,data.length);
  for (const category of ['보도자료','입법예고','공포법령','금융시장동향']) assert.deepEqual(core.filterItems(data,state({category}),TODAY,{}),data.filter(i=>i.category===category));
});
test('precise original law filters and multiple AND selections', () => {
  const examples = [
    item({id:'a',title:'자본시장과 금융투자업에 관한 법률 시행령'}),
    item({id:'b',title:'자본시장특별사법경찰 집무규칙'}),
    item({id:'c',title:'자본시장조사 업무규정'}),
    item({id:'d',title:'금융투자업규정시행세칙'}),
    item({id:'e',title:'금융소비자보호감독규정'}),
    item({id:'f',title:'금융소비자 보호에 관한 법률 시행령'}),
    item({id:'g',title:'자본시장법 및 금융투자업규정 개정'})
  ];
  assert.deepEqual(core.filterItems(examples,state({laws:new Set(['자본시장'])}),TODAY,{}).map(i=>i.id),['a','g']);
  assert.deepEqual(core.filterItems(examples,state({laws:new Set(['자본시장','금융투자업규정'])}),TODAY,{}).map(i=>i.id),['g']);
  assert.deepEqual(core.filterItems(examples,state({laws:new Set(['금융소비자'])}),TODAY,{}).map(i=>i.id),['f']);
  assert.equal(core.LAW_RULES.금융투자업규정('금융투자업규정시행세칙'),true);
});
test('search covers title, department, category; trims and ignores Latin case', () => {
  const examples=[item({title:'ETF 제도',dept:'자산운용감독국'})];
  for (const search of [' etf ','자산운용감독국','보도자료']) assert.equal(core.filterItems(examples,state({search}),TODAY,{}).length,1);
  assert.equal(core.filterItems(examples,state({search:'없는내용'}),TODAY,{}).length,0);
});
test('today never falls back to most recent publication', () => {
  const examples=[item({date:'2026-09-04'}),item({id:'two',date:'2026-09-05'})];
  assert.equal(core.filterItems(examples,state({focus:'today'}),TODAY,{}).length,0);
});
test('same-law same-URL amendments retain independent reviewed state', () => {
  const a=item({id:'law-v1',category:'공포법령',prom_no:'1',enf_date:'2026-10-01'});
  const b=item({...a,id:'law-v2',prom_no:'2',enf_date:'2026-10-02'});
  const records = {[a.id]:core.fingerprint(a)};
  assert.equal(core.isRead(a,records),true); assert.equal(core.isRead(b,records),false);
  assert.equal(core.filterItems([a,b],state({unread:true}),TODAY,records)[0].id,b.id);
  assert.equal(core.isRead({...a,title:'내용 변경'},records),false);
  assert.equal(core.isRead({...a,enf_date:'2026-12-01'},records),false);
  assert.equal(core.fingerprint({...a,url:a.url+'?curPage=1'}),core.fingerprint({...a,url:a.url+'?curPage=3&srchText='}));
});
test('priority respects rule dates, relevance and announcement type', () => {
  assert.equal(core.priority(item({category:'공포법령',enf_date:'2026-10-01'}),TODAY).tier,3);
  assert.equal(core.priority(item({category:'공포법령',enf_date:'1957-02-14'}),TODAY).tier,0);
  assert.equal(core.priority(item({category:'입법예고',title:'자본시장법 개정'}),TODAY).tier,2);
  assert.equal(core.priority(item({category:'입법예고',title:'자본시장법 개정',date:'2026-01-01'}),TODAY).tier,0);
  assert.equal(core.priority(item({title:'공모펀드 투자위험 기준 도입'}),TODAY).tier,1);
  assert.equal(core.priority(item({title:'공모펀드 투자위험 기준 도입',date:'2026-09-08'}),TODAY).tier,0);
  assert.equal(core.relevance(item({title:'내부통제 기준'})).candidate,true);
});
test('upcoming filter includes day 0 and 30, excludes 31, past and missing', () => {
  const examples=['2026-09-06','2026-09-07','2026-10-07','2026-10-08',''].map((enf_date,i)=>item({id:String(i),category:'공포법령',enf_date}));
  assert.deepEqual(core.filterItems(examples,state({focus:'upcoming'}),TODAY,{}).map(i=>i.id),['1','2']);
});
test('calendar is contiguous, including month/year and leap boundaries', () => {
  for(const [year,month] of [[2026,0],[2026,8],[2026,11],[2028,1]]) {
    const cells=core.calendarCells(year,month);
    assert.equal(cells.length%7,0);
    assert.equal(new Date(cells[0]+'T00:00:00Z').getUTCDay(),0);
    cells.slice(1).forEach((date,i)=>assert.equal(core.daysUntil(date,cells[i]),1));
  }
  assert.ok(core.calendarCells(2028,1).includes('2028-02-29'));
});
test('external links exclude executable and malformed schemes', () => {
  for(const url of ['javascript:alert(1)','data:text/html,hello','file:///test','//evil.test','nonsense']) assert.equal(core.safeURL(url),null);
  assert.equal(core.safeURL('https://example.com/notice'),'https://example.com/notice');
});
test('snapshot-specific expected dates and counts (baseline 2026-09-06)', {skip: !data.some(i=>i.id==='notice_4168') || data.some(i=>i.date>TODAY)}, () => {
  assert.equal(core.filterItems(data,state({focus:'today'}),TODAY,{}).length,data.filter(i=>i.date===TODAY).length);
  const near = core.filterItems(data,state({focus:'upcoming'}),TODAY,{});
  assert.ok(near.some(i=>i.prom_no==='21503' && i.enf_date==='2026-10-01'));
  assert.ok(near.some(i=>i.prom_no==='21857' && i.enf_date==='2026-10-02'));
});
