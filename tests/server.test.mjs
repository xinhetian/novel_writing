import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {createApp,ROOT} from '../server.mjs';

test('local storage, conflict protection, private boundaries and explicit AI requests',async t=>{
  const base=path.join(ROOT,'local-data');
  await fs.mkdir(base,{recursive:true});
  const dir=await fs.mkdtemp(path.join(base,'test-'));
  const calls=[];
  const mock=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return {ok:true,json:async()=>url.endsWith('/responses')?{output:[{content:[{type:'output_text',text:'MOCK_GENERATED_DRAFT'}]}]}:{data:[{b64_json:Buffer.from('mock-image').toString('base64')}]}};
  };
  let app=await createApp({dataDir:dir,fetchImpl:mock,key:'test-placeholder'});
  const start=async()=>{app.listen(0,'127.0.0.1');await once(app,'listening');return 'http://127.0.0.1:'+app.address().port;};
  let url=await start();
  t.after(async()=>{await new Promise(r=>app.close(r));if(path.resolve(dir).startsWith(path.resolve(base)+path.sep)&&path.basename(dir).startsWith('test-'))await fs.rm(dir,{recursive:true,force:true});});
  const bootstrap=await(await fetch(url+'/api/bootstrap')).json(), token=bootstrap.token;
  const send=(p,method,data,extra={})=>fetch(url+p,{method,headers:{'Content-Type':'application/json','X-Mojian-Token':token,...extra},body:JSON.stringify(data)});
  assert.equal(bootstrap.keyPresent,true);
  assert.equal(JSON.stringify(bootstrap).includes('test-placeholder'),false);
  assert.equal((await fetch(url+'/local-data/library.json')).status,404);
  assert.equal((await fetch(url+'/api/bootstrap',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal(await new Promise((resolve,reject)=>{http.get(url+'/api/bootstrap',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);}),403);
  assert.equal((await fetch(url+'/api/bootstrap',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  const state={revision:0,books:[{id:'book-1',title:'TEST_BOOK',outline:'PRIVATE_OUTLINE',characters:'PRIVATE_CHARACTER',world:'PRIVATE_WORLD',chapters:[{id:'chapter-1',title:'TEST_CHAPTER',content:'PRIVATE_FULL_CHAPTER'}]}]};
  assert.equal((await send('/api/library','PUT',state,{'X-Mojian-Token':'wrong'})).status,403);
  const saved=await send('/api/library','PUT',state);assert.equal(saved.status,200);
  assert.equal((await saved.json()).revision,1);
  assert.equal((await send('/api/library','PUT',state)).status,409);
  const parallel=await Promise.all([send('/api/library','PUT',{...state,revision:1}),send('/api/library','PUT',{...state,revision:1})]);
  assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
  assert.equal((await send('/api/library','PUT',{revision:2,books:[{}]})).status,400);
  const request={confirm:false,bookId:'book-1',chapterId:'chapter-1',excerpt:'EXPLICIT_SELECTION',prompt:'EXPLICIT_INSTRUCTION'};
  assert.equal((await send('/api/ai/text','POST',request)).status,400);assert.equal(calls.length,0);
  assert.equal((await send('/api/ai/text','POST',{...request,confirm:true})).status,200);
  assert.equal(calls[0].body.store,false);
  assert.ok(calls[0].body.input.includes('EXPLICIT_SELECTION'));
  assert.ok(!JSON.stringify(calls).includes('PRIVATE_'));
  const drafts=await(await fetch(url+'/api/drafts')).json();assert.equal(drafts[0].text,'MOCK_GENERATED_DRAFT');
  assert.equal((await send('/api/ai/image','POST',{...request,confirm:true})).status,200);
  const images=await(await fetch(url+'/api/gallery')).json();assert.equal(images.length,1);
  assert.equal(await(await fetch(url+images[0].url)).text(),'mock-image');
  const exported=await(await send('/api/export','POST',{bookId:'book-1'})).json();
  assert.ok(exported.path.startsWith(dir));assert.ok((await fs.readFile(exported.path,'utf8')).includes('PRIVATE_FULL_CHAPTER'));
  assert.ok((await fs.readdir(path.join(dir,'backups'))).length>=2);
  await new Promise(r=>app.close(r));
  app=await createApp({dataDir:dir,fetchImpl:mock,key:''});url=await start();
  const reloaded=await(await fetch(url+'/api/bootstrap')).json();assert.equal(reloaded.state.books[0].chapters[0].content,'PRIVATE_FULL_CHAPTER');
  const missing=await fetch(url+'/api/ai/text',{method:'POST',headers:{'Content-Type':'application/json','X-Mojian-Token':reloaded.token},body:JSON.stringify({...request,confirm:true})});
  assert.equal(missing.status,503);
});
test('corrupt library is never silently overwritten',async()=>{
  const base=path.join(ROOT,'local-data');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'test-'));
  await fs.writeFile(path.join(dir,'library.json'),'{broken');
  try{await assert.rejects(createApp({dataDir:dir}),/will not be overwritten/);assert.equal(await fs.readFile(path.join(dir,'library.json'),'utf8'),'{broken');}
  finally{if(path.resolve(dir).startsWith(path.resolve(base)+path.sep)&&path.basename(dir).startsWith('test-'))await fs.rm(dir,{recursive:true,force:true});}
});
