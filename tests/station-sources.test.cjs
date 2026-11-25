const fs=require('node:fs'), path=require('node:path'), Module=require('node:module');
const test=require('node:test'), assert=require('node:assert/strict'), ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,file);
const records=new Map(), channelCalls=[], uploadCalls=[], searchCalls=[];
const dreamWorksId='UCia2_wzvSZrQBzbopXT1Fcg';
const doc=key=>({id:key.split('/').at(-1),path:key,get:async()=>({data:()=>records.get(key)}),set:async(value,options)=>records.set(key,options?.merge?{...records.get(key),...value}:value),collection:name=>({doc:id=>doc(key+'/'+name+'/'+id)})});
const db={collection:name=>({doc:id=>doc(name+'/'+id)}),getAll:async(...refs)=>refs.map(ref=>({id:ref.id,exists:records.has(ref.path)})),batch:()=>{const writes=[];return{set:(ref,value)=>writes.push([ref.path,value]),commit:async()=>writes.forEach(([key,value])=>records.set(key,value))}}};
const youtube={search:{list:async args=>{
  searchCalls.push(args);
  return {data:{items:[
    {id:{videoId:'dreamworks-trailer'},snippet:{channelId:dreamWorksId,title:'Official trailer'}},
    {id:{videoId:'dreamworks-podcast'},snippet:{channelId:dreamWorksId,title:'Studio business podcast'}},
    {id:{videoId:'fan-trailer'},snippet:{channelId:'another-channel',title:'Official trailer'}}
  ]}};
}},playlists:{list:async({channelId})=>({data:{items:[{id:'PL-'+channelId,snippet:{title:'Official trailers',channelId}}]}})},channels:{list:async args=>{
  channelCalls.push(args);
  if(args.forHandle==='missing')return{data:{items:[]}};
  if(args.forHandle)return{data:{items:[{id:'ID-'+args.forHandle,snippet:{title:args.forHandle},contentDetails:{relatedPlaylists:{uploads:'UL-'+args.forHandle}}}]}};
  if(!args.part.includes('topicDetails'))return{data:{items:args.id.map(id=>({id,snippet:{title:id},contentDetails:{relatedPlaylists:{uploads:'UL-'+id}}}))}};
  return{data:{items:[{id:'church',snippet:{title:'Christian church'},topicDetails:{topicCategories:['https://en.wikipedia.org/wiki/Christianity']},contentDetails:{relatedPlaylists:{uploads:'UL-faith'}}},{id:'news',snippet:{title:'Technology news'},topicDetails:{topicCategories:[]},contentDetails:{relatedPlaylists:{uploads:'UL-news'}}}]}};
}}};
const original=Module._load;
Module._load=function(request,parent,...rest){
 if(parent?.filename===path.resolve(__dirname,'../lib/station-sources.ts')){
  if(request==='./firebase')return{adminDb:()=>db};
  if(request==='./google')return{youtubeForUser:()=>youtube,getSubscribedChannelIds:async()=>new Set(['church','news']),readOptionalPlaylist:async(_yt,id,_limit,warnings)=>{uploadCalls.push(id);if(id==='UL-'+dreamWorksId){warnings.push('Uploads unavailable');return [];}return id.startsWith('PL-')?[{contentDetails:{videoId:'OWN-'+id},snippet:{title:'Official trailer',videoOwnerChannelId:id.slice(3)}},{contentDetails:{videoId:'FAN-'+id},snippet:{title:'Official trailer',videoOwnerChannelId:'unrelated-fan'}}]:[{contentDetails:{videoId:'VIDEO-'+id},snippet:{title:'Official trailer'}},{contentDetails:{videoId:'PODCAST-'+id},snippet:{title:'Studio business podcast'}}]}};
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
 const p=tvProfileSchema.parse({preferredHandles:['gameranxTV'],studioHandles:['Netflix'],mandatoryDaily:true});
 const first=await stationSources({userId:'alice'},p);
 assert.equal(first.origins.get('VIDEO-UL-Netflix').officialTrailer,true);
 assert.equal(first.origins.get('VIDEO-UL-gameranxTV').officialTrailer,false);
 assert.equal(first.origins.get('OWN-PL-ID-Netflix').officialTrailer,true);
 assert.equal(first.origins.has('FAN-PL-ID-Netflix'),false,'a studio playlist cannot give an unrelated uploader official provenance');
 assert.equal(first.origins.has('PODCAST-UL-Netflix'),false,'selected studios only supply trailers and clips');
 assert.equal(first.origins.has('PODCAST-UL-gameranxTV'),true,'the studio restriction must not erase other discovery sources');
 assert.ok(channelCalls.some(call=>call.forHandle==='gameranxTV'));
 const calls=channelCalls.length;await stationSources({userId:'bob'},p);
 assert.equal(channelCalls.length,calls,'only public channel facts are cached, not user taste');
});

test('daily lane requirements do not opt other users into studio brands', async()=>{
 channelCalls.length=0;
 const result=await stationSources({userId:'other'},tvProfileSchema.parse({mandatoryDaily:true}));
 assert.equal(result.origins.size,0);
 assert.equal(channelCalls.length,0);
});
test('missing handles produce visible warnings and are never substituted',async()=>{
 const result=await stationSources({userId:'alice'},tvProfileSchema.parse({preferredHandles:['missing']}));
 assert.equal(result.origins.size,0);assert.match(result.warnings[0],/missing/);
});
test('saved aliases resolve by channel ID and blocked uploads fall back to the same channel',async()=>{
 records.clear();channelCalls.length=0;searchCalls.length=0;
 const p=tvProfileSchema.parse({
   preferredHandles:['WrestlingGifs','WrestlinGifs','NTVKenya','KTNNewsKenya'],
   studioHandles:['WaltDisneyStudios','WarnerBrosPictures','Dreamworks']
 });
 records.set('publicChannelCache/dreamworks',{id:'stale-id',uploads:'stale-uploads',at:Date.now()});
 const result=await stationSources({userId:'alice'},p);
 assert.deepEqual(new Set(channelCalls.map(call=>call.id?.[0])),new Set([
   'UCcvM7fNSMn9Qm3BZnKTK8oQ','UCqBJ47FjJcl61fmSbcadAVg','UCKVsdeoHExltrWMuK0hOWmg',
   'UC_5niPa-d35gg88HaS7RrIw','UCjmJDM5pRKbUlVIzDYYWb6g',dreamWorksId
 ]));
 assert.equal(channelCalls.length,6);
 assert.deepEqual(searchCalls.map(call=>call.channelId),[dreamWorksId]);
 assert.equal(result.origins.get('dreamworks-trailer').officialTrailer,true);
 assert.equal(result.origins.has('dreamworks-podcast'),false);
 assert.equal(result.origins.has('fan-trailer'),false);
 assert.deepEqual(result.warnings,[]);
});
test('faith reads subscribed religious channel uploads and excludes unrelated subscriptions',async()=>{
 uploadCalls.length=0;
 const result=await stationSources({userId:'alice'},tvProfileSchema.parse({stationMode:'faith'}));
 assert.deepEqual(uploadCalls,['UL-faith','UL-news']);
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

