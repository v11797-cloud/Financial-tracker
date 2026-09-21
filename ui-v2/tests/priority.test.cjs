const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,EXCLUDED_KEY,ADDED_KEY}=require('../priority.js');
function fixture(initial={}) { const data=new Map(Object.entries(initial)); return {data,storage:{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)}}; }
const items='ABCDEFX'.split('').map(id=>({id}));const ids=p=>p.getVisiblePriorityRegulations().map(i=>i.id);
test('always-on full ranking: exclude/backfill, new highest, restore, dedup and independent manual slots',()=>{
 const f=fixture(),p=create(f.storage);p.configure(items.slice(0,5),items);assert.deepEqual(ids(p),['A','B','C']);
 p.excludePriorityItem('B');assert.deepEqual(ids(p),['A','C','D']);
 p.configure([items[5],...items.slice(0,5)],items);assert.deepEqual(ids(p),['F','A','C']);
 p.restoreExcludedPriorityItem('B');assert.deepEqual(ids(p),['F','A','B']);
 p.addManualPriorityItem('F');assert.deepEqual(ids(p),['F','A','B']);
 p.addManualPriorityItem('X');assert.deepEqual(ids(p),['F','A','B','X']);
 const change=p.removeManualPriorityItem('X');assert.deepEqual(p.getManuallyAddedPriorityIds(),['F']);assert.deepEqual(ids(p),['F','A','B']);
 p.undoPriorityChange(change);assert.deepEqual(ids(p),['F','A','B','X']);
 p.excludePriorityItem('A');p.addManualPriorityItem('A');assert.equal(p.isPriorityExcluded('A'),false);assert.equal(p.isManuallyAdded('A'),true);
 const reopened=create(f.storage);reopened.configure([items[5],...items.slice(0,5)],items);assert.deepEqual(ids(reopened),ids(p));
});
test('backfill extends past ten, exhaustion stays empty, undo and restore all recover recommendations',()=>{
 const p=create(fixture().storage),many=Array.from({length:15},(_,n)=>({id:String(n)}));p.configure(many,many);
 for(let n=0;n<12;n++)p.excludePriorityItem(String(n));assert.deepEqual(ids(p),['12','13','14']);
 let last;for(let n=12;n<15;n++)last=p.excludePriorityItem(String(n));assert.deepEqual(ids(p),[]);
 p.undoPriorityChange(last);assert.deepEqual(ids(p),['14']);p.restoreAllExcludedPriorityItems();assert.deepEqual(ids(p),['0','1','2']);
});
test('manual/automatic overlap toggle disappears and undo restores both memberships',()=>{
 const p=create(fixture().storage);p.configure(items,items);p.addManualPriorityItem('A');const before=p.removeManualPriorityItem('A');
 assert.equal(p.isManuallyAdded('A'),false);assert.equal(p.isPriorityExcluded('A'),true);assert.deepEqual(ids(p),['B','C','D']);
 p.undoPriorityChange(before);assert.equal(p.isManuallyAdded('A'),true);assert.equal(p.isPriorityExcluded('A'),false);assert.deepEqual(ids(p),['A','B','C']);
});
test('scope/missing records preserve IDs, exclusion wins, restoring a noncandidate does not pin it',()=>{
 const f=fixture({[ADDED_KEY]:'["X","missing"]',[EXCLUDED_KEY]:'["B","X","gone"]'}),p=create(f.storage);p.configure(items.slice(0,5),items);
 assert.deepEqual(ids(p),['A','C','D']);p.configure([items[0]],[items[0]]);assert.deepEqual(ids(p),['A']);assert.deepEqual(p.getManuallyAddedPriorityIds(),['X','missing']);assert.deepEqual(p.getExcludedPriorityIds(),['B','X','gone']);
 p.restoreExcludedPriorityItem('gone');assert.equal(ids(p).includes('gone'),false);
});
test('legacy custom selections migrate once without keeping a mode or touching reviewed records',()=>{
 const f=fixture({'regwatch_priority_mode_v1':'custom','regwatch_custom_priority_v1':'["X","X"]','financial-tracker:ui-v2:reviews:v1':'{"A":"record"}'}),p=create(f.storage);p.configure(items,items);assert.deepEqual(ids(p),['A','B','C','X']);
 p.removeManualPriorityItem('X');p.reload();assert.deepEqual(p.getManuallyAddedPriorityIds(),[]);assert.equal(f.data.get('financial-tracker:ui-v2:reviews:v1'),'{"A":"record"}');
});
test('malformed storage, duplicate IDs and blocked storage are safe',()=>{
 const p=create(fixture({[ADDED_KEY]:'["X","X",2,null]',[EXCLUDED_KEY]:'invalid'}).storage);p.configure(items,items);assert.deepEqual(ids(p),['A','B','C','X']);
 const denied=create({getItem(){throw Error()},setItem(){throw Error()}});denied.configure(items,items);denied.excludePriorityItem('B');assert.deepEqual(ids(denied),['A','C','D']);assert.equal(denied.storageAvailable(),false);
});
