const test=require('node:test'), assert=require('node:assert/strict');
const core=require('../app.js');
const item={id:'law_test',title:'규정',category:'공포법령',law_name:'규정',prom_no:'123',date:'2025-09-30',enf_date:'2026-01-01',dept:'법제처',url:'https://www.law.go.kr/법령/규정'};
test('collection labels distinguish backfill and recent publications without altering reviews',()=>{
 const backfill={...item,collection_kind:'historical_backfill',first_collected_at:'2026-10-07 16:05 KST'};
 assert.equal(core.collectionInfo(backfill,'2026-10-07').label,'과거 자료 추가 수집');
 const recent={...item,collection_kind:'new_publication',first_collected_at:'2026-10-07 16:05 KST'};
 assert.equal(core.collectionInfo(recent,'2026-10-07').label,'새 공포·개정');
 assert.equal(core.collectionInfo(recent,'2026-10-15').label,'공포·개정 수집');
 assert.equal(core.collectionInfo(item,'2026-10-07'),null);
 assert.equal(core.collectionInfo({...item,collection_kind:'unknown',first_collected_at:'2026-10-07 16:05 KST'},'2026-10-07'),null);
 const records={[item.id]:core.fingerprint(item)};
 assert.equal(core.fingerprint(backfill),core.fingerprint(item));
 assert.equal(core.isRead(backfill,records),true);
});
