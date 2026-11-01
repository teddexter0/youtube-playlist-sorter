const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText,file);
const { tvProfileSchema, defaultTvProfile, selectTvMix, passesMetadataFilter, planTvSearches } = require('../lib/tv-profile.ts');
const { routeForVideo, dueStations } = require('../lib/station-rules.ts');
const { stationProfiles } = require('../lib/station-presets.ts');
const { watchedIdsFromExport, namesFromImdbCsv } = require('../lib/history-import.ts');
const now=Date.parse('2026-11-01T12:00:00Z');
const video=(id,patch={})=>({videoId:id,title:'A robot demonstration',description:'',channelId:id,channelTitle:id,topic:'technology',durationSeconds:300,publishedAt:'2026-10-31T00:00:00Z',score:.8,reason:'match',...patch});

test('distinct stations keep faith, nostalgia and practical life skills out of comfy TV',()=>{
  const p={...defaultTvProfile,strictComfort:true};
  for(const [title,station] of [['Disney Channel Suite Life recap','childhood'],['Jesus sermon','faith'],['First aid CPR explained','lifeskills'],['Celebrity news weekly recap','popculture']]){
    const v=video(title,{title});
    assert.equal(routeForVideo(v),station);
    assert.equal(passesMetadataFilter(v,p,now),false);
  }
  assert.equal(passesMetadataFilter(video('a',{title:'SNL funny sketch'}),p,now),true);
  assert.equal(passesMetadataFilter(video('a',{title:'Occult gothic games ranking'}),p,now),false);
});

test('faith is subscription-only and life-skills talks are allowed in their own station',()=>{
  const faith=tvProfileSchema.parse({stationMode:'faith',lightViewing:false});
  const sermon=video('a',{title:'A Christian sermon',subscribed:true});
  assert.equal(passesMetadataFilter(sermon,faith,now),true);
  assert.equal(passesMetadataFilter({...sermon,subscribed:false},faith,now),false);
  const life=tvProfileSchema.parse({stationMode:'lifeskills',lightViewing:false,maxVideoMinutes:90});
  assert.equal(passesMetadataFilter(video('b',{title:'First aid lecture and practical skills',durationSeconds:2000}),life,now),true);
});

test('Nairobi Friday/Saturday schedules use different slots and never leak weekly jobs into other days',()=>{
  assert.deepEqual(dueStations('evening',new Date('2026-11-06T16:00:00Z')),['tv','faith']);
  assert.deepEqual(dueStations('morning',new Date('2026-11-07T06:00:00Z')),['childhood','popculture','lifeskills']);
  assert.deepEqual(dueStations('morning',new Date('2026-11-08T06:00:00Z')),[]);
  assert.deepEqual(dueStations('evening',new Date('2026-11-08T16:00:00Z')),['tv']);
});

test('personal presets do not seed other users with the owner interests or celebrity list',()=>{
  const bob={userId:'bob',playlistIds:{},tv:tvProfileSchema.parse({interests:['Pottery']})};
  const generic=stationProfiles(bob);
  assert.deepEqual(generic.tv.interests,['Pottery']);
  assert.deepEqual(generic.tv.favoriteCelebrities,[]);
  const personal=stationProfiles(bob,true,{interests:['Example hobby'],preferredHandles:['example_creator'],franchises:['Example Franchise']});
  assert.ok(personal.tv.preferredHandles.includes('example_creator'));
  assert.equal(personal.tv.durationOrder,true);
  assert.equal(personal.tv.liveEnabled,true);
  assert.equal(personal.tv.rollingQueue,true);
  assert.ok(personal.tv.franchises.includes('Example Franchise'));
});

test('trailers need studio provenance and required lanes win slots when available',()=>{
  const p=tvProfileSchema.parse({mandatoryDaily:true,sessionMinutes:15,interests:['Travel','Chess','Cars','Comedy','Film','Tech']});
  const trailer=video('trailer',{title:'Official new movie trailer',officialTrailer:true,durationSeconds:90});
  assert.equal(passesMetadataFilter({...trailer,officialTrailer:false},p,now),false);
  const candidates=[...Array.from({length:10},(_,i)=>video('tech'+i,{score:1})),trailer,video('football',{title:'Premier League official highlights',durationSeconds:300})];
  const mix=selectTvMix(candidates,p,new Set(),now);
  assert.ok(mix.some(v=>v.videoId==='trailer'));
  assert.ok(mix.some(v=>v.videoId==='football'));
  const queries=planTvSearches(p,6);
  assert.ok(queries.some(q=>/trailer/.test(q.topic)));
  assert.ok(queries.some(q=>/highlights/.test(q.topic)));
  assert.ok(queries.length<=8);
});

test('classics stay occasional and awards favour roundups over isolated snippets',()=>{
  const p=tvProfileSchema.parse({allowClassicFootball:true,strictComfort:true});
  const classic=video('classic',{title:'Champions League 2018 highlights',publishedAt:'2018-01-01',classicFootball:true,score:.85});
  assert.equal(passesMetadataFilter(classic,p,now),true);
  assert.equal(selectTvMix([classic],p,new Set(),now,{classicFootballSeen:true}).length,0);
  assert.equal(passesMetadataFilter(video('award',{title:'Oscars acceptance speech'}),p,now),false);
  assert.equal(passesMetadataFilter(video('award',{title:'Oscars full ceremony recap'}),p,now),true);
});

test('Takeout import extracts only video IDs, deduplicates and supports JSON/HTML',()=>{
  const json=JSON.stringify([{titleUrl:'https://www.youtube.com/watch?v=abcdefghijk',title:'Private title',time:'Private date'},{titleUrl:'https://www.youtube.com/watch?v=abcdefghijk'}]);
  assert.deepEqual(watchedIdsFromExport(json),['abcdefghijk']);
  assert.deepEqual(watchedIdsFromExport('<a href="https://www.youtube.com/watch?app=desktop&amp;v=12345678901">private title</a>'),['12345678901']);
  assert.deepEqual(watchedIdsFromExport('https://example.com/watch?v=abcdefghijk'),[]);
});
test('IMDb CSV parses quoted commas and names without carrying other columns',()=>{
  assert.deepEqual(namesFromImdbCsv('Const,Name,Description\n"nm1","Jane Example","private note"\n"nm2","Someone, Jr.","other"'),['Jane Example','Someone, Jr.']);
});
const load=Module._load;
Module._load=function(request,parent,...args){
  if(parent?.filename===path.resolve(__dirname,'../lib/playlist-order.ts')&&request==='./google')return {};
  return load.call(this,request,parent,...args);
};
const { orderExistingQueue }=require('../lib/playlist-order.ts');
Module._load=load;
test('existing entries are reordered by duration before insertion without deleting videos',async()=>{
  const updates=[];const yt={playlistItems:{update:async request=>updates.push(request.requestBody)}};
  const items=[{id:'long-item',contentDetails:{videoId:'long'}},{id:'short-item',contentDetails:{videoId:'short'}}];
  const raw=[{id:'long',contentDetails:{duration:'PT20M'}},{id:'short',contentDetails:{duration:'PT2M'}}];
  assert.deepEqual(await orderExistingQueue(yt,'TV',items,raw),[120,1200]);
  assert.equal(updates.length,1);assert.equal(updates[0].id,'short-item');assert.equal(updates[0].snippet.position,0);
});
