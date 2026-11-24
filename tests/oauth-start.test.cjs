const fs=require('node:fs'), path=require('node:path'), Module=require('node:module'), ts=require('typescript');
const test=require('node:test'), assert=require('node:assert/strict');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
let missing=[];
const original=Module._load;
Module._load=function(request,parent,...rest){
 if(parent?.filename===path.resolve(__dirname,'../app/api/auth/google/start/route.ts')){
  if(request==='@/lib/google')return{googleAuthUrl:state=>'https://accounts.google.com/o/oauth2/v2/auth?state='+state};
  if(request==='@/lib/runtime-config')return{missingGoogleConfig:()=>missing,envValue:()=> 'https://station.example/api/auth/google/callback'};
 }
 return original.call(this,request,parent,...rest);
};
const route=require('../app/api/auth/google/start/route.ts');
Module._load=original;
const req=origin=>({url:origin+'/api/auth/google/start',nextUrl:new URL(origin+'/api/auth/google/start')});
test('OAuth start is dynamic and creates fresh matched state/cookie pairs with cache prevention',async()=>{
 assert.equal(route.dynamic,'force-dynamic');
 missing=[];
 const first=await route.GET(req('https://station.example')),second=await route.GET(req('https://station.example'));
 const a=new URL(first.headers.get('location')).searchParams.get('state'),b=new URL(second.headers.get('location')).searchParams.get('state');
 assert.notEqual(a,b);
 assert.equal(first.cookies.get('yt_oauth_state').value,a);
 assert.equal(second.cookies.get('yt_oauth_state').value,b);
 for(const response of [first,second]){
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('vercel-cdn-cache-control'),'no-store');
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
 }
});
test('aliases start OAuth on the callback host before setting any state cookie',async()=>{
 const response=await route.GET(req('https://alias.example'));
 assert.equal(response.headers.get('location'),'https://station.example/api/auth/google/start');
 assert.equal(response.cookies.get('yt_oauth_state'),undefined);
});
test('missing credentials return a noncached setup redirect rather than a malformed Google URL',async()=>{
 missing=['GOOGLE_CLIENT_ID'];
 const response=await route.GET(req('https://station.example'));
 assert.equal(response.headers.get('location'),'https://station.example/setup');
 assert.match(response.headers.get('cache-control'),/no-store/);
 missing=[];
});
