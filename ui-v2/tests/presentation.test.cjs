const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../ai-presentation.js');
const taxonomy={compliance:'준법감시',aml:'AML',investment:'운용',it:'IT'};
test('presentation limits two sentences and top three positive functions without mutating scores',()=>{
 const a={affected_functions:{compliance:4,aml:5,investment:3,it:0,unknown:5}};
 const before=JSON.stringify(a);assert.deepEqual(P.getTopAffectedFunctions(a,taxonomy),['AML','준법감시','운용']);assert.equal(JSON.stringify(a),before);
 assert.equal(P.short('첫 문장. 둘째 문장. 셋째 문장.'),'첫 문장. 둘째 문장.');assert.ok(P.short('긴'.repeat(1000)).length<=180);
});
test('real dates drive deadlines and new marker; no inferred dates',()=>{
 assert.equal(P.deadline({effective_date:'2026-10-01'},'2026-09-17'),'시행 D-14');
 assert.equal(P.deadline({comment_deadline:'2026-09-17'},'2026-09-17'),'의견마감 D-Day');
 assert.equal(P.deadline({published_date:'2026-09-17'},'2026-09-17'),'신규');
 assert.equal(P.deadline({effective_date:'2026-02-30'},'2026-09-17'),'원문 일정 확인');
 assert.equal(P.deadline({effective_date:'2026-09-16'},'2026-09-17'),'원문 일정 확인');
});
test('reasons preserve first three or generate evidence-grounded fallback',()=>{
 assert.deepEqual(P.getTopReviewReasons({why_priority:['a','b','c','d']},{},'2026-09-17',taxonomy),['a','b','c']);
 assert.deepEqual(P.getTopReviewReasons({affected_functions:{aml:5}},{comment_deadline:'2026-09-20'},'2026-09-17',taxonomy),['의견제출 마감까지 3일 남음','AML 관련 키워드 포함']);
 assert.deepEqual(P.getTopReviewReasons({}, {},'2026-09-17',taxonomy),['공식 원문과 당사 업무의 관련성 확인 필요']);
});
test('checklist selects applicability, internal rules and processes first; empty defaults',()=>{
 assert.deepEqual(P.getTopReviewActions({review_questions:['교육 필요한가?','업무 프로세스 변경 여부','관련 내규 확인','당사 적용대상 여부','시스템 변경 여부']}),['당사 적용대상 여부','관련 내규 확인','업무 프로세스 변경 여부']);
 assert.deepEqual(P.getTopReviewActions({}),['당사 적용 대상 여부','관련 내규 확인','업무 영향 여부 확인']);
 assert.equal(P.getTopReviewActions({recommended_actions:[{action:'관련 내규 확인'}]}).length,1);
});
