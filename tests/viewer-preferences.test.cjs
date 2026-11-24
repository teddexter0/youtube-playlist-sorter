const fs = require('node:fs'), ts = require('typescript');
const test = require('node:test'), assert = require('node:assert/strict');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText, file);
const { tvProfileSchema, planTvSearches, passesMetadataFilter } = require('../lib/tv-profile.ts');
const { activeStationKeys } = require('../lib/station-rules.ts');
const now = Date.parse('2026-11-02T08:00:00Z');
const guest = { videoId:'abcdefghijk', title:'An unfamiliar movie cast interview', topic:'film', description:'', channelTitle:'Interview show', channelId:'abc', durationSeconds:300, publishedAt:'2026-11-01', score:.8, reason:'discovery', discovery:true };
test('new accounts get only their own main station, while existing playlists are retained', () => {
  assert.deepEqual(activeStationKeys({stationProfiles:{childhood:{interests:[]}}}), ['tv']);
  assert.deepEqual(activeStationKeys({stationProfiles:{childhood:{playlistId:'mine'}}}), ['tv','childhood']);
  assert.deepEqual(activeStationKeys({enabledStations:['tv','custom2'],stationProfiles:{faith:{playlistId:'old'}}}), ['tv','custom2']);
});
test('whole detailed interests and large people catalogues survive schema parsing', () => {
  const interest = 'Thoughtful behind the scenes explanations from familiar film casts, with practical effects and production design';
  const names = Array.from({length:316}, (_,i)=>`Person ${i}`);
  const p = tvProfileSchema.parse({interests:[interest], favoriteCelebrities:names});
  assert.deepEqual(p.interests,[interest]); assert.equal(p.favoriteCelebrities.length,316);
  assert.deepEqual(tvProfileSchema.parse({}).favoriteCelebrities,[]);
});
test('sports and familiar guests both get searches within the existing eight-call budget', () => {
  const p = tvProfileSchema.parse({interests:['Art','Cooking','Travel','Music','Science','Film'],selectedSports:['tennis'],favoriteCelebrities:['My Favourite Person']});
  const queries=planTvSearches(p,6);
  assert.ok(queries.some(q=>/tennis/.test(q.topic)));
  assert.ok(queries.some(q=>/My Favourite Person/.test(q.topic)));
  assert.ok(queries.length<=8);
  assert.deepEqual(p.interests,['Art','Cooking','Travel','Music','Science','Film']);
});
test('new guest discovery works without AI, can be disabled and cannot bypass exclusions', () => {
  const p = tvProfileSchema.parse({celebrityDiscoveryPercent:25,aiEnabled:false});
  assert.equal(passesMetadataFilter(guest,p,now),true);
  assert.equal(passesMetadataFilter(guest,{...p,celebrityDiscoveryPercent:0},now),false);
  assert.equal(passesMetadataFilter(guest,{...p,avoid:['unfamiliar']},now),false);
  assert.equal(passesMetadataFilter({...guest,discovery:false},p,now),false);
});

const {guideArrow}=require('../lib/guide-geometry.ts');
test('mobile guide points to the actual target border and follows scroll geometry',()=>{
const card={left:20,right:370,top:550,bottom:800};
const target={left:30,right:300,top:150,bottom:200};
const a=guideArrow(target,card,390,844);assert.ok(a);assert.ok(a.end.x>=30&&a.end.x<=300);assert.equal(a.end.y,200);
const b=guideArrow({...target,top:80,bottom:130},card,390,844);assert.equal(b.end.y,130);assert.notEqual(a.path,b.path);
assert.equal(guideArrow({...target,top:-200,bottom:-100},card,390,844),null);
});
test('explicit football competitions participate in both ordinary and required searches',()=>{
for(const mandatoryDaily of [false,true]){const p=tvProfileSchema.parse({interests:['Travel'],footballLeagues:['CAF Champions League'],mandatoryDaily});assert.ok(planTvSearches(p,0).some(q=>q.topic.includes('CAF Champions League')));}
});
