const test = require('node:test');
const assert = require('node:assert/strict');
const {KEY, initial, validate, createStore, validURL} = require('../workspace.js');
const memory = () => { const values = new Map(); return {values,getItem:k => values.get(k) ?? null,setItem:(k,v) => values.set(k,v)}; };

test('first visit is one empty memo with title and regulation slots, without saved sample text', () => {
  const storage=memory(), store=createStore(storage);
  assert.equal(storage.getItem(KEY),null);
  assert.deepEqual(store.data.blocks.map(b=>b.type),['text']);
  assert.equal(store.data.blocks[0].content,'');
  assert.equal(store.data.blocks[0].title,''); assert.deepEqual(store.data.blocks[0].regulations,[]);
  assert.equal(new Set([...store.data.blocks,...initial().blocks].map(b=>b.id)).size,2);
});
test('save and reload retain notes, checklist draft/completion, order and collapse; never touch review keys', () => {
  const storage=memory(), store=createStore(storage,()=> '2026-10-16T01:00:00Z');
  storage.setItem('financial-tracker:ui-v2:reviews:v1','unchanged');
  store.data.blocks.push({id:'legacy-tasks',type:'checklist',items:[],draft:''});
  store.data.blocks[0].content='회의 메모\n<script>literal text</script>';
  store.data.blocks[1].items.push({id:'task',text:'규정 확인',completed:true});
  store.data.blocks[1].draft='입력 중'; store.data.collapsed=true; store.data.blocks.reverse(); store.change();
  assert.equal(store.save(),true);
  assert.deepEqual(createStore(storage).data,store.data);
  assert.equal(storage.getItem('financial-tracker:ui-v2:reviews:v1'),'unchanged');
  assert.equal(store.dirty,false);
});
test('invalid backups reject duplicates, unknown blocks, invalid task types and executable URLs', () => {
  const data=initial();
  for (const changed of [ {...data,version:2}, {...data,collapsed:'false'}, {...data,blocks:[data.blocks[0],data.blocks[0]]}, {...data,blocks:[{id:'x',type:'html',content:'x'}]}, {...data,blocks:[{id:'x',type:'checklist',items:[{id:'t',text:'test',completed:'yes'}]}]}, {...data,blocks:[{id:'x',type:'regulation',content:'',regulation:{id:'r',title:'규정',institution:'기관',date:'',url:'javascript:alert(1)'}}]} ]) assert.throws(()=>validate(changed));
  assert.equal(validURL('data:text/html,bad'),null);
  assert.equal(validURL('https://user:password@example.com'),null);
  assert.equal(validURL('https://www.law.go.kr/LSW/info.do?id=1'),'https://www.law.go.kr/LSW/info.do?id=1');
});
test('quota failure keeps unsaved input and previous stored data; retry recovers', () => {
  const storage=memory(); let fail=false;
  const store=createStore({getItem:storage.getItem,setItem:(k,v)=>{if(fail) throw new DOMException('full','QuotaExceededError'); storage.setItem(k,v);}});
  store.change(); assert.equal(store.save(),true); const before=storage.getItem(KEY);
  fail=true; store.data.blocks[0].content='must not lose'; store.change();
  assert.equal(store.save(),false); assert.equal(store.dirty,true); assert.match(store.error,/저장 공간/);
  assert.equal(store.data.blocks[0].content,'must not lose'); assert.equal(storage.getItem(KEY),before);
  fail=false; assert.equal(store.save(),true); assert.equal(JSON.parse(storage.getItem(KEY)).blocks[0].content,'must not lose');
});
test('corrupt stored data is preserved, with separate recovery export; invalid import is atomic', () => {
  const storage=memory(); storage.setItem(KEY,'{corrupt'); const store=createStore(storage);
  store.data.blocks[0].content='new unsaved note'; store.change(); assert.equal(store.save(),false);
  assert.equal(storage.getItem(KEY),'{corrupt'); assert.equal(store.invalidRaw,'{corrupt');
  const before=JSON.stringify(store.data); assert.throws(()=>store.replace({version:999})); assert.equal(JSON.stringify(store.data),before);
  store.replace({version:1,collapsed:false,updatedAt:null,blocks:[]}); assert.equal(store.save(),true);
});
test('concurrent tabs cannot silently overwrite a newer workspace', () => {
  const storage=memory(), first=createStore(storage), second=createStore(storage);
  first.data.blocks[0].content='first'; first.change(); first.save();
  second.data.blocks[0].content='second'; second.change(); assert.equal(second.save(),false);
  assert.equal(second.conflict,true); assert.equal(second.data.blocks[0].content,'second');
  assert.equal(JSON.parse(storage.getItem(KEY)).blocks[0].content,'first');
  second.replace(JSON.parse(storage.getItem(KEY))); assert.equal(second.save(),true);
});

test('memo formatting survives backups without executing or storing arbitrary HTML', () => {
  const data=initial();
  data.blocks[0].content='legacy fallback';
  data.blocks[0].format={version:1,children:[{tag:'h3',children:[{text:'검토사항'}]},{tag:'p',children:[{tag:'span',size:20,children:[{tag:'strong',children:[{text:'업무 메모'}]}]}]}]};
  const restored=validate(data);
  assert.equal(restored.blocks[0].content,'검토사항\n업무 메모');
  assert.deepEqual(restored.blocks[0].format,data.blocks[0].format);
  for (const bad of [{tag:'script',children:[]},{tag:'img',children:[]},{tag:'span',size:999,children:[]}]) {
    const copy=JSON.parse(JSON.stringify(data));copy.blocks[0].format.children=[bad];assert.throws(()=>validate(copy));
  }
});

test('inline regulation references are safe, persist in the memo and reject duplicate links', () => {
  const data=initial(), r={id:'rule-1',title:'규제 제목',institution:'금융위원회',date:'2026-10-16',url:'https://www.law.go.kr/LSW/info.do?id=1'};
  data.blocks[0].format={version:1,children:[{text:'검토 내용'},{regulation:r},{tag:'ul',children:[{tag:'li',children:[{text:'후속 검토'}]}]}]};
  const result=validate(data);assert.match(result.blocks[0].content,/규제 제목/);assert.equal(result.blocks[0].format.children[1].regulation.id,r.id);
  data.blocks[0].format.children.push({regulation:r});assert.throws(()=>validate(data));
  data.blocks[0].format.children.pop();data.blocks[0].format.children[1].regulation={...r,url:'javascript:alert(1)'};assert.throws(()=>validate(data));
});

test('memo title, several header regulations and inline checklist retain state and reject malformed backups', () => {
  const data=initial(),r={id:'a',title:'규제 A',institution:'금융위',date:'2026-10-16',url:'https://example.com/a'};
  data.blocks[0].title='<script>literal title</script>';
  data.blocks[0].regulations=[r,{...r,id:'b',title:'규제 B'}];
  data.blocks[0].format={version:1,children:[{tag:'h3',children:[{text:'검토 계획'}]},{checklist:{items:[{id:'t',text:'내규 확인',completed:true}],draft:'다음 할 일'}}]};
  const restored=validate(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.blocks[0].regulations,data.blocks[0].regulations);
  assert.equal(restored.blocks[0].title,data.blocks[0].title);assert.match(restored.blocks[0].content,/☑ 내규 확인\n다음 할 일/);
  assert.equal(restored.blocks[0].format.children[1].checklist.items[0].completed,true);
  for (const change of [d=>d.blocks[0].title=42,d=>d.blocks[0].regulations.push(r),d=>d.blocks[0].format.children.push({regulation:r}),d=>d.blocks[0].format.children[1].checklist.items[0].completed='yes',d=>d.blocks[0].regulations[0].url='javascript:alert(1)']) {
    const copy=structuredClone(data);change(copy);assert.throws(()=>validate(copy));
  }
});
