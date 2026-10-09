import http from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes} from 'node:crypto';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const fail = (code,message) => { throw Object.assign(new Error(message),{code}); };
const str = (v,max=2000000) => typeof v==='string' && v.length<=max;
function validate(state) {
  if(!state || !Array.isArray(state.books) || state.books.length>200) fail(400,'Invalid book data');
  const ids=new Set();
  for(const b of state.books){
    if(!str(b.id,80)||ids.has(b.id)||!str(b.title,200)||!Array.isArray(b.chapters)||b.chapters.length>2000) fail(400,'Invalid book data');
    ids.add(b.id);
    for(const field of ['outline','characters','world']) if(!str(b[field])) fail(400,'Invalid story notes');
    const chapters=new Set();
    for(const c of b.chapters){
      if(!str(c.id,80)||chapters.has(c.id)||!str(c.title,200)||!str(c.content)) fail(400,'Invalid chapter data');
      chapters.add(c.id);
    }
  }
  return {books:state.books.map(b=>({id:b.id,title:b.title,outline:b.outline,characters:b.characters,world:b.world,chapters:b.chapters.map(c=>({id:c.id,title:c.title,content:c.content}))}))};
}
export async function createApp({dataDir=path.join(ROOT,'local-data'),fetchImpl=fetch,key=process.env.OPENAI_API_KEY}={}) {
  for(const d of ['', 'backups','images','drafts','exports']) await fs.mkdir(path.join(dataDir,d),{recursive:true});
  const statePath=path.join(dataDir,'library.json');
  let state;
  try { state=JSON.parse(await fs.readFile(statePath,'utf8')); validate(state); if(!Number.isInteger(state.revision)) throw new Error('revision'); }
  catch(e) { if(e.code!=='ENOENT') throw new Error('Cannot read local data. Keep library.json and restore a copy from backups. The original will not be overwritten.'); state={revision:0,books:[]}; }
  let queue=Promise.resolve(), busy=false;
  const token=randomBytes(32).toString('hex');
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  async function body(req){
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>16000000) fail(413,'Content is too large. Please split it into smaller books.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid request format');}
  }
  const models={text:process.env.OPENAI_TEXT_MODEL||'gpt-4.1',image:process.env.OPENAI_IMAGE_MODEL||'gpt-image-2'};
  async function openai(endpoint,payload){
    if(!key) fail(503,'OPENAI_API_KEY is missing. Set the Windows environment variable and restart.');
    let r;
    try{r=await fetchImpl('https://api.openai.com/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(240000)});}
    catch{fail(502,'OpenAI connection failed or timed out. Check your connection and try again.');}
    if(!r.ok) fail(502,'OpenAI request failed ('+r.status+'). Check your balance and model access, or try again later.');
    return r.json();
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host=req.headers.host;
      const allowed=['127.0.0.1:'+server.address().port,'localhost:'+server.address().port];
      if(!allowed.includes(host)) fail(403,'Local access only');
      if(req.headers.origin && !allowed.map(h=>'http://'+h).includes(req.headers.origin)) fail(403,'External website access denied');
      if(req.headers['sec-fetch-site']==='cross-site') fail(403,'Cross-site access denied');
      const url=new URL(req.url,'http://'+host), p=url.pathname;
      if(req.method==='GET' && p==='/api/bootstrap') return json(res,200,{state,token,keyPresent:!!key,models,dataDir});
      if(req.method!=='GET'){
        if(req.headers['x-mojian-token']!==token) fail(403,'This session has expired. Refresh the page and try again.');
        if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'A JSON request is required');
      }
      if(req.method==='PUT' && p==='/api/library'){
        const input=await body(req), clean=validate(input);
        const task=queue.then(async()=>{
          if(input.revision!==state.revision) fail(409,'Another window has updated this library. Copy your unsaved work somewhere safe before refreshing.');
          const next={...clean,revision:state.revision+1};
          await fs.writeFile(path.join(dataDir,'backups',Date.now()+'-'+randomUUID()+'.json'),JSON.stringify(state,null,2),'utf8');
          const temp=statePath+'.tmp';
          await fs.writeFile(temp,JSON.stringify(next,null,2),'utf8');
          await fs.rename(temp,statePath);
          state=next;
          const names=(await fs.readdir(path.join(dataDir,'backups'))).filter(n=>n.endsWith('.json')).sort();
          for(const name of names.slice(0,-50)) await fs.unlink(path.join(dataDir,'backups',name)).catch(()=>{});
          return state.revision;
        });
        queue=task.catch(()=>{});
        return json(res,200,{revision:await task});
      }
      if(req.method==='GET' && p==='/api/gallery'){
        const names=await fs.readdir(path.join(dataDir,'images'));
        const items=await Promise.all(names.filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await fs.readFile(path.join(dataDir,'images',n),'utf8'))));
        return json(res,200,items.sort((a,b)=>b.created.localeCompare(a.created)));
      }
      if(req.method==='GET' && p==='/api/drafts'){
        const names=await fs.readdir(path.join(dataDir,'drafts'));
        const items=await Promise.all(names.filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await fs.readFile(path.join(dataDir,'drafts',n),'utf8'))));
        return json(res,200,items.sort((a,b)=>b.created.localeCompare(a.created)));
      }
      if(req.method==='GET' && /^\/images\/[a-f0-9-]+\.png$/.test(p)){
        const buf=await fs.readFile(path.join(dataDir,'images',path.basename(p)));
        res.writeHead(200,{'Content-Type':'image/png'});return res.end(buf);
      }
      if(req.method==='POST' && p==='/api/export'){
        const b=await body(req), book=state.books.find(x=>x.id===b.bookId);
        if(!book) fail(404,'Book not found');
        const name=book.id.replace(/[^a-zA-Z0-9-]/g,'')+'-'+Date.now()+'.txt';
        await fs.writeFile(path.join(dataDir,'exports',name),book.title+'\n\n'+book.chapters.map(c=>c.title+'\n\n'+c.content).join('\n\n'),'utf8');
        return json(res,200,{path:path.join(dataDir,'exports',name)});
      }
      if(req.method==='POST' && (p==='/api/ai/text'||p==='/api/ai/image')){
        const b=await body(req);
        if(b.confirm!==true) fail(400,'Please confirm before sending the selected content');
        if(!str(b.excerpt,12000)||!str(b.prompt,4000)||!str(b.bookId,80)||!str(b.chapterId,80)) fail(400,'Invalid input or excerpt too long (maximum 12,000 characters)');
        if(!b.prompt.trim()&&!b.excerpt.trim()) fail(400,'Enter instructions or select an excerpt');
        if(busy) fail(429,'A generation request is already running. Please wait.');
        busy=true;
        try {
          const id=randomUUID(), created=new Date().toISOString();
          if(p.endsWith('/text')){
            const r=await openai('responses',{model:models.text,store:false,max_output_tokens:4000,instructions:'You are a web novel writing assistant. Write only from the provided excerpt and instructions. Follow the requested language; otherwise use the language of the excerpt, or English if no excerpt is provided. Return editable prose without commentary unless the author requests an outline.',input:'Writing instructions:\n'+b.prompt+'\n\nExplicitly selected reference excerpt (may be empty):\n'+b.excerpt});
            const text=(r.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');
            if(!text.trim()) fail(502,'The model returned no prose. Adjust your instructions and try again.');
            const draft={id,created,text,bookId:b.bookId,chapterId:b.chapterId};
            await fs.writeFile(path.join(dataDir,'drafts',id+'.json'),JSON.stringify(draft,null,2),'utf8');
            return json(res,200,draft);
          }
          const r=await openai('images/generations',{model:models.image,prompt:'Illustrate the following novel excerpt without adding text to the image. Visual instructions: '+b.prompt+'\nNovel excerpt:'+b.excerpt,n:1,size:'1536x1024',quality:'medium',output_format:'png'});
          const data=r.data?.[0]?.b64_json;
          if(!data) fail(502,'The model returned no image');
          await fs.writeFile(path.join(dataDir,'images',id+'.png'),Buffer.from(data,'base64'));
          const item={id,created,url:'/images/'+id+'.png',bookId:b.bookId,chapterId:b.chapterId,style:b.prompt};
          await fs.writeFile(path.join(dataDir,'images',id+'.json'),JSON.stringify(item,null,2),'utf8');
          return json(res,200,item);
        } finally {busy=false;}
      }
      const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
      if(req.method==='GET' && assets[p]){
        res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
        return res.end(await fs.readFile(path.join(ROOT,'public',assets[p])));
      }
      fail(404,'Not found');
    } catch(e) {json(res,typeof e.code==='number'?e.code:e.code==='ENOENT'?404:500,{error:typeof e.code==='number'?e.message:'Local operation failed. Check file permissions and free disk space.'});}
  });
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createApp();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port is in use. Open http://127.0.0.1:3210 or close the existing instance.':e.message);process.exit(1);});
  server.listen(Number(process.env.PORT)||3210,'127.0.0.1',()=>console.log('Mojian is running at http://127.0.0.1:'+server.address().port));
}
