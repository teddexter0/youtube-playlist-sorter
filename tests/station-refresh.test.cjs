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
  if(request==='./google')return{};
  if(request==='./station-history')return{rememberSeen:async(user,ids,source)=>ids.forEach(id=>data.set('users/'+user+'/watched/'+id,{source}))};
 }
 return original.call(this,request,parent,...rest);
};
const {tvWatchGate,recordPlayback,prepareStationRefresh,finishStationRefresh}=require('../lib/station-refresh.ts');
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
test('TV remains untouched below 50 percent even with old queue entries',async()=>{
 data.clear();const deleted=[];
 data.set('users/alice/playback/video0',{seconds:120});
 data.set('users/alice/playback/video1',{completed:true});
 const result=await prepareStationRefresh('alice','tv',yt(deleted),items,'day1');
 assert.equal(result.held,true);assert.equal(result.gate.required,3);assert.deepEqual(deleted,[]);
 assert.equal(data.has('users/alice/stationRefresh/tv'),false);
});
test('qualified half clears the whole TV queue and the next daily batch is protected again',async()=>{
 data.clear();const deleted=[];
 for(let i=0;i<3;i++)data.set('users/alice/playback/video'+i,{seconds:120});
 const first=await prepareStationRefresh('alice','tv',yt(deleted),items,'day1');
 assert.equal(first.held,false);assert.equal(first.items.length,0);assert.equal(deleted.length,5);
 await finishStationRefresh('alice','tv',first.token);
 const nextItems=[{id:'newItem',contentDetails:{videoId:'newVideo'}}];
 assert.equal((await prepareStationRefresh('alice','tv',yt(deleted),nextItems,'day2')).held,true);
 assert.equal(deleted.length,5);
});
test('weekly refresh clears all old entries once and retries preserve newly added items',async()=>{
 data.clear();const deleted=[];
 const first=await prepareStationRefresh('alice','childhood',yt(deleted),items,'week1');
 assert.equal(first.items.length,0);assert.equal(deleted.length,5);
 const partial=[{id:'newItem',contentDetails:{videoId:'newVideo'}}];
 const retry=await prepareStationRefresh('alice','childhood',yt(deleted),partial,'week1');
 assert.equal(retry.items.length,1);assert.equal(deleted.length,5);
 await finishStationRefresh('alice','childhood',retry.token);
 await prepareStationRefresh('alice','childhood',yt(deleted),partial,'week2');
 assert.equal(deleted.at(-1),'newItem');assert.equal(deleted.length,6);
});
test('failed clearing resumes clearing; a failed TV refill resumes without deleting new picks',async()=>{
 data.clear();let calls=0;
 for(let i=0;i<3;i++)data.set('users/alice/playback/video'+i,{seconds:120});
 const broken={playlistItems:{delete:async()=>{if(++calls===2)throw Error('quota');}}};
 await assert.rejects(prepareStationRefresh('alice','tv',broken,items,'day1'),/quota/);
 assert.equal(data.get('users/alice/stationRefresh/tv').phase,'clearing');
 const deleted=[];
 await prepareStationRefresh('alice','tv',yt(deleted),items.slice(1),'day1');
 assert.equal(deleted.length,4);
 const partial=[{id:'newItem',contentDetails:{videoId:'newVideo'}}];
 const resumed=await prepareStationRefresh('alice','tv',yt(deleted),partial,'day2');
 assert.equal(resumed.items.length,1);assert.equal(deleted.length,4);
});
test('imported history, skips and delivery records cannot prove two minutes of watch time',async()=>{
 data.clear();const deleted=[];
 data.set('users/alice/watched/video0',{source:'skip'});
 data.set('users/alice/watched/video1',{source:'delivered'});
 data.set('users/alice/watched/video2',{source:'watch-history-import'});
 const first=await prepareStationRefresh('alice','tv',yt(deleted),items,'day1');
 assert.equal(first.gate.watched,0);assert.equal(first.held,true);
});
