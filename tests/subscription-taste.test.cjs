const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const test=require('node:test'),assert=require('node:assert/strict');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,file);
const original=Module._load;
Module._load=function(request,parent,...args){
 if(parent?.filename===path.resolve(__dirname,'../lib/google.ts')){
  if(request==='googleapis')return{google:{}};
  if(request==='@/lib/crypto')return{};
  if(request==='@/lib/runtime-config')return{};
  if(request==='@/lib/taste-topics')return require('../lib/taste-topics.ts');
 }
 return original.call(this,request,parent,...args);
};
const {getYouTubeAccountTaste}=require('../lib/google.ts');
Module._load=original;
test('subscription guidance reads beyond the first page and batches channel metadata by fifty',async()=>{
 const pages=[],groups=[];
 const youtube={
  videos:{list:async()=>({data:{items:[]}})},
  subscriptions:{list:async({pageToken})=>{pages.push(pageToken);const start=pageToken?50:0,count=pageToken?10:50;return{data:{items:Array.from({length:count},(_,i)=>({snippet:{resourceId:{channelId:'channel'+(start+i)}}})),nextPageToken:pageToken?undefined:'page-two'}};}},
  channels:{list:async({id})=>{groups.push(id);return{data:{items:id.map(channel=>({snippet:{title:channel},topicDetails:{topicCategories:[channel==='channel59'?'https://en.wikipedia.org/wiki/Chess':'https://en.wikipedia.org/wiki/Technology']}}))}};}}
 };
 const taste=await getYouTubeAccountTaste(youtube);
 assert.equal(taste.subscriptionCount,60);
 assert.deepEqual(groups.map(group=>group.length),[50,10]);
 assert.equal(pages.length,2);
 assert.ok(taste.subscriptionTopics.includes('Chess'));
});
