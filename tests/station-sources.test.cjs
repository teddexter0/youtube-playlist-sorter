const fs=require('node:fs'), path=require('node:path'), Module=require('node:module');
const test=require('node:test'), assert=require('node:assert/strict'), ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,file);
const records=new Map(), channelCalls=[], uploadCalls=[];
const doc=key=>({id:key.split('/').at(-1),path:key,get:async()=>({data:()=>records.get(key)}),set:async value=>records.set(key,value),collection:name=>({doc:id=>doc(key+'/'+name+'/'+id)})});
const db={collection:name=>({doc:id=>doc(name+'/'+id)}),getAll:async(...refs)=>refs.map(ref=>({id:ref.id,exists:records.has(ref.path)})),batch:()=>{const writes=[];return{set:(ref,value)=>writes.push([ref.path,value]),commit:async()=>writes.forEach(([key,value])=>records.set(key,value))}}};
const youtube={channels:{list:async args=>{
  channelCalls.push(args);
  if(args.forHandle==='missing')return{data:{items:[]}};
  if(args.forHandle)return{data:{items:[{id:'ID-'+args.forHandle,snippet:{title:args.forHandle},contentDetails:{relatedPlaylists:{uploads:'UL-'+args.forHandle}}}]}};
  return{data:{items:[{id:'church',snippet:{title:'Christian church'},topicDetails:{topicCategories:['https://en.wikipedia.org/wiki/Christianity']},contentDetails:{relatedPlaylists:{uploads:'UL-faith'}}},{id:'news',snippet:{title:'Technology news'},topicDetails:{topicCategories:[]},contentDetails:{relatedPlaylists:{uploads:'UL-news'}}}]}};
}}};
const original=Module._load;
Module._load=function(request,parent,...rest){
 if(parent?.filename===path.resolve(__dirname,'../lib/station-sources.ts')){
  if(request==='./firebase')return{adminDb:()=>db};
  if(request==='./google')return{youtubeForUser:()=>youtube,getSubscribedChannelIds:async()=>new Set(['church','news']),listPlaylistItems:async(_yt,id)=>{uploadCalls.push(id);return[{contentDetails:{videoId:'VIDEO-'+id}}]}};
 }
 if(parent?.filename===path.resolve(__dirname,'../lib/station-history.ts')&&request==='./firebase')return{adminDb:()=>db};
 return original.call(this,request,parent,...rest);
};
const {stationSources}=require('../lib/station-sources.ts');
const {knownSeenIds,rememberSeen}=require('../lib/station-history.ts');
Module._load=original;
const {tvProfileSchema}=require('../lib/tv-profile.ts');
test('direct channels resolve by exact handle, studio provenance survives and channel records cache',async()=>{
 records.clear();channelCalls.length=0;uploadCalls.length=0;
 const p=tvProfileSchema.parse({preferredHandles:['gameranxTV'],mandatoryDaily:true});
 const first=await stationSources({userId:'alice'},p);
 assert.equal(first.origins.get('VIDEO-UL-Netflix').officialTrailer,true);
 assert.equal(first.origins.get('VIDEO-UL-gameranxTV').officialTrailer,false);
 assert.ok(channelCalls.some(call=>call.forHandle==='gameranxTV'));
 const calls=channelCalls.length;await stationSources({userId:'bob'},p);
 assert.equal(channelCalls.length,calls,'only public channel facts are cached, not user taste');
});
test('missing handles produce visible warnings and are never substituted',async()=>{
 const result=await stationSources({userId:'alice'},tvProfileSchema.parse({preferredHandles:['missing']}));
 assert.equal(result.origins.size,0);assert.match(result.warnings[0],/missing/);
});
test('faith reads subscribed religious channel uploads and excludes unrelated subscriptions',async()=>{
 uploadCalls.length=0;
 const result=await stationSources({userId:'alice'},tvProfileSchema.parse({stationMode:'faith'}));
 assert.deepEqual(uploadCalls,['UL-faith']);
 assert.equal([...result.origins.values()][0].subscribed,true);
 assert.ok(!result.origins.has('VIDEO-UL-news'));
});
test('permanent seen IDs persist beyond feedback limits and are scoped to one account',async()=>{
 records.clear();
 const ids=Array.from({length:650},(_,i)=>'video'+String(i).padStart(6,'0'));
 assert.equal(await rememberSeen('alice',ids,'watch-history-import'),650);
 assert.equal((await knownSeenIds('alice',ids)).size,650);
 assert.equal((await knownSeenIds('bob',ids)).size,0);
 assert.deepEqual([...await knownSeenIds('alice',[ids[0],'unknown'])],[ids[0]]);
});
