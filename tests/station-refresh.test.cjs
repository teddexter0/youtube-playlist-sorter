const fs=require('node:fs'), path=require('node:path'), Module=require('node:module');
const test=require('node:test'), assert=require('node:assert/strict'), ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,file);
const data=new Map();
const doc=key=>({id:key.split('/').at(-1),path:key,get:async()=>({id:key.split('/').at(-1),exists:data.has(key),data:()=>data.get(key)}),set:async(value,options)=>data.set(key,options?.merge?{...data.get(key),...value}:value),collection:name=>({doc:id=>doc(key+'/'+name+'/'+id)})});
const db={collection:name=>({doc:id=>doc(name+'/'+id)}),getAll:async(...refs)=>Promise.all(refs.map(ref=>ref.get())),runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,value,options)=>ref.set(value,options)})};
const original=Module._load;
Module._load=function(request,parent,...rest){
 if(parent?.filename===path.resolve(__dirname,'../lib/station-refresh.ts')){
  if(request==='./firebase')return{adminDb:()=>db};
  if(request==='./google')return{listPlaylistItems:async yt=>yt.readQueue()};
  if(request==='./station-history')return{rememberSeen:async(user,ids,source)=>ids.forEach(id=>data.set('users/'+user+'/watched/'+id,{source}))};
 }
 return original.call(this,request,parent,...rest);
};
const {tvWatchGate,recordPlayback,prepareStationRefresh,beginStationRefresh,finishStationRefresh}=require('../lib/station-refresh.ts');
Module._load=original;
const {playedSecondsDelta}=require('../lib/playback-time.ts');
const items=Array.from({length:5},(_,i)=>({id:'item'+i,contentDetails:{videoId:'video'+i}}));
const yt=deleted=>({playlistItems:{delete:async({id})=>deleted.push(id)}});
test('TV uses video count, rounds half up and accepts two minutes rather than half runtime',()=>{
 const states=new Map([['a',{seconds:120}],['b',{seconds:119}],['c',{completed:true}]]);
 assert.deepEqual(tvWatchGate(['a','b','c','d','e'],states),{total:5,watched:2,required:3,eligible:false});
 states.set('e',{seconds:121});
 assert.equal(tvWatchGate(['a','b','c','d','e'],states).eligible,true);
 assert.equal(tvWatchGate([],states).eligible,true);
});
test('watch-time sampling rejects pauses and seek jumps, and counts real elapsed playback',()=>{
 assert.equal(playedSecondsDelta(20,21,1,true),1);
 assert.equal(playedSecondsDelta(20,150,1,true),0);
 assert.equal(playedSecondsDelta(20,20,1,false),0);
 assert.equal(playedSecondsDelta(20,10,1,true),0);
 assert.equal(playedSecondsDelta(20,22,1,true),1);
});
test('progress accumulates across sessions and duplicate event IDs cannot inflate it',async()=>{
 data.clear();
 await recordPlayback('alice','video0',15,'one');
 await recordPlayback('alice','video0',15,'one');
 assert.equal(data.get('users/alice/playback/video0').seconds,15);
 for(let i=1;i<8;i++)await recordPlayback('alice','video0',15,'event'+i);
 assert.equal(data.get('users/alice/playback/video0').seconds,120);
 assert.equal(data.get('users/alice/watched/video0').source,'playback');
 assert.equal(data.has('users/bob/playback/video0'),false);
});
test('a young TV queue remains untouched below 50 percent',async()=>{
 data.clear();
 data.set('users/alice/playback/video0',{seconds:120});
 data.set('users/alice/playback/video1',{completed:true});
 const result=await prepareStationRefresh('alice','tv',items,'day1');
 assert.equal(result.held,true);assert.equal(result.gate.required,3);
 assert.equal(data.has('users/alice/stationRefresh/tv'),false);
});

test('an explicit refresh bypasses watch and age checks without consuming the scheduled cycle', async () => {
 data.clear();
 const now = Date.now();
 const queue = items.map(item => ({ ...item, snippet: { publishedAt: new Date(now).toISOString() } }));
 const refresh = await prepareStationRefresh('alice', 'tv', queue, undefined, now, true);
 assert.equal(refresh.held, false);
 assert.deepEqual(refresh.items, []);
 assert.deepEqual(refresh.retiring, queue);
 assert.equal(data.has('users/alice/stationRefresh/tv'), false);
 await beginStationRefresh('alice', 'tv', refresh.token, refresh.retiring);
 const replacement = [{ id: 'newItem', contentDetails: { videoId: 'newVideo' } }];
 const retry = await prepareStationRefresh('alice', 'tv', [...replacement, ...queue], undefined, now, true);
 assert.deepEqual(retry.items, replacement);
 assert.equal(retry.token, refresh.token);
 const deleted = [];
 await finishStationRefresh('alice', 'tv', retry.token, yt(deleted), retry.retiring);
 assert.deepEqual(deleted, queue.map(item => item.id));
 data.set('users/alice/watched/newVideo', { source: 'watched' });
 const scheduled = await prepareStationRefresh('alice', 'tv', replacement, 'evening', now);
 assert.equal(scheduled.held, false);
 assert.equal(scheduled.token, 'evening');
});
test('qualified half can replace the queue and the next batch gets its own watch threshold',async()=>{
 data.clear();const deleted=[];
 for(let i=0;i<3;i++)data.set('users/alice/playback/video'+i,{seconds:120});
 const first=await prepareStationRefresh('alice','tv',items,'day1');
 assert.equal(first.held,false);assert.equal(first.items.length,0);assert.equal(deleted.length,0);
 await beginStationRefresh('alice','tv',first.token,first.retiring);
 await finishStationRefresh('alice','tv',first.token,yt(deleted),first.retiring);
 const nextItems=[{id:'newItem',contentDetails:{videoId:'newVideo'}}];
 assert.equal((await prepareStationRefresh('alice','tv',nextItems,'day2')).held,true);
 assert.equal(deleted.length,5);
});
test('weekly refresh saves old entries until replacement and retries preserve newly added items',async()=>{
 data.clear();const deleted=[];
 const first=await prepareStationRefresh('alice','childhood',items,'week1');
 assert.equal(first.items.length,0);assert.equal(deleted.length,0);
 await beginStationRefresh('alice','childhood',first.token,first.retiring);
 const partial=[{id:'newItem',contentDetails:{videoId:'newVideo'}}];
 const retry=await prepareStationRefresh('alice','childhood',[...partial,...items],'week1');
 assert.equal(retry.items.length,1);assert.equal(deleted.length,0);
 await finishStationRefresh('alice','childhood',retry.token,yt(deleted),retry.retiring);
 assert.deepEqual(deleted,items.map(item=>item.id));
 assert.equal((await prepareStationRefresh('alice','childhood',partial,'week1')).retiring.length,0);
 assert.equal((await prepareStationRefresh('alice','childhood',partial,'week2')).retiring[0].id,'newItem');
});
test('an interrupted retirement resumes without deleting replacement picks',async()=>{
 data.clear();
 await beginStationRefresh('alice','tv','day1',items);
 const broken={playlistItems:{delete:async({id})=>{if(id==='item1')throw Error('quota');}}};
 await assert.rejects(finishStationRefresh('alice','tv','day1',broken,items),/quota/);
 const partial=[{id:'newItem',contentDetails:{videoId:'newVideo'}}];
 const resumed=await prepareStationRefresh('alice','tv',[...partial,...items.slice(1)],'day2');
 assert.deepEqual(resumed.items,partial);assert.equal(resumed.token,'day1');
 const deleted=[];
 await finishStationRefresh('alice','tv',resumed.token,yt(deleted),resumed.retiring);
 assert.deepEqual(deleted,items.slice(1).map(item=>item.id));
});
test('TV can refresh 48 hours after the last addition even with zero qualified watches',async()=>{
 data.clear();
 const addedAt = Date.parse('2026-11-07T16:00:00Z');
 const oldQueue=items.map(item=>({...item,snippet:{publishedAt:new Date(addedAt).toISOString()}}));
 assert.equal((await prepareStationRefresh('alice','tv',oldQueue,'early',addedAt+48*3600000-1)).held,true);
 const stale=await prepareStationRefresh('alice','tv',oldQueue,'due',addedAt+48*3600000);
 assert.equal(stale.held,false);assert.equal(stale.retiring.length,5);
 assert.equal(data.has('users/alice/stationRefresh/tv'),false);
});
test('imported history, skips and delivery records cannot prove two minutes of watch time',async()=>{
 data.clear();const deleted=[];
 data.set('users/alice/watched/video0',{source:'skip'});
 data.set('users/alice/watched/video1',{source:'delivered'});
 data.set('users/alice/watched/video2',{source:'watch-history-import'});
 const first=await prepareStationRefresh('alice','tv',items,'day1');
 assert.equal(first.gate.watched,0);assert.equal(first.held,true);
});

test('replacements are confirmed before old entries are retired and verification tolerates missing contentDetails', async () => {
 data.clear();
 const queue = [...items, {id:'newItem',snippet:{resourceId:{videoId:'newVideo'}}}];
 await beginStationRefresh('alice','tv','day1',items);
 const marker = {count:1,seconds:360,highlights:['New video']};
 let read = false;
 const yt = {
  readQueue: async () => {read = true;return [...queue];},
  playlistItems: {delete: async ({id}) => {
   assert.equal(read,true);
   queue.splice(queue.findIndex(item=>item.id===id),1);
  }}
 };
 await finishStationRefresh('alice','tv','day1',yt,items,{playlistId:'TV',ids:['newVideo'],replacement:marker});
 assert.deepEqual(queue.map(item=>item.id),['newItem']);
 assert.deepEqual((await prepareStationRefresh('alice','tv',queue,'day1')).completed,marker);
});

test('an older replacement without recorded IDs resumes from the actual partial queue', async () => {
 data.clear();
 const replacement = {id:'newItem',contentDetails:{videoId:'newVideo'}};
 await beginStationRefresh('alice','tv','day1',items);
 const marker = doc('users/alice/stationRefresh/tv');
 await marker.set({phase:'retiring',replacement:{count:36,seconds:1000,highlights:[]}}, {merge:true});
 const retry = await prepareStationRefresh('alice','tv',[replacement,...items],'day2');
 assert.equal(retry.token,'day1');
 assert.equal(retry.started,true);
 assert.equal(retry.pending,undefined);
 assert.deepEqual(retry.items,[replacement]);
 assert.deepEqual(retry.retiring,items);
});
