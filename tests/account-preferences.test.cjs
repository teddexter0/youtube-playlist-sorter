const fs=require('node:fs'),ts=require('typescript');
const test=require('node:test'),assert=require('node:assert/strict');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
const {accountPreferencesPatch}=require('../lib/account-preferences.ts');
const {tvProfileSchema}=require('../lib/tv-profile.ts');
const user={userId:'owner-id',email:'owner@example.com',playlistIds:{tv:'original-tv'},stationAutopilot:false,tv:tvProfileSchema.parse({playlistId:'original-tv',interests:['Chess','Travel'],preferredHandles:['existing_creator'],archivePercent:33,liveEnabled:false}),stationProfiles:{faith:tvProfileSchema.parse({stationMode:'faith',playlistId:'original-faith',interests:['My existing subscriptions']})},tvHistory:['keep-history'],tvFeedback:{a:{action:'like'}}};
const raw=JSON.stringify({interests:['Movie trailers'],childhood:{franchises:['Example Show']}});
test('personal repair adds studio preferences without erasing interests, playlists, history or enabled state',()=>{
 const patch=accountPreferencesPatch(user,'owner@example.com',raw);
 assert.deepEqual(patch.tv.interests,['Chess','Travel','Movie trailers']);
 assert.ok(patch.tv.studioHandles.includes('HBO'));
 assert.ok(patch.tv.preferredHandles.includes('existing_creator'));
 assert.equal(patch.tv.archivePercent,33);
 assert.equal(patch.tv.playlistId,'original-tv');
 assert.equal(patch.stationProfiles.faith.playlistId,'original-faith');
 assert.deepEqual(patch.stationProfiles.faith.interests,['My existing subscriptions']);
 assert.equal(patch.tv.liveEnabled,false);
 assert.equal(patch.stationAutopilot,undefined);
 assert.equal(patch.tvHistory,undefined);
 assert.equal(patch.tvFeedback,undefined);
});
test('the owner config cannot seed someone else and is applied only once per version',()=>{
 assert.equal(accountPreferencesPatch({...user,email:'other@example.com'},'owner@example.com',raw),null);
 const patch=accountPreferencesPatch(user,'owner@example.com',raw);
 assert.equal(accountPreferencesPatch({...user,...patch},'owner@example.com',raw),null);
});
test('a malformed optional preference config cannot block sign-in',()=>{
 assert.equal(accountPreferencesPatch(user,'owner@example.com','invalid json'),null);
});
