import http from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, randomBytes} from 'node:crypto';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const fail = (code,message) => { throw Object.assign(new Error(message),{code}); };
const str = (v,max=2000000) => typeof v==='string' && v.length<=max;
function validate(state) {
  if(!state || !Array.isArray(state.books) || state.books.length>200) fail(400,'作品数据格式不正确');
  const ids=new Set();
  for(const b of state.books){
    if(!str(b.id,80)||ids.has(b.id)||!str(b.title,200)||!Array.isArray(b.chapters)||b.chapters.length>2000) fail(400,'作品数据格式不正确');
    ids.add(b.id);
    for(const field of ['outline','characters','world']) if(!str(b[field])) fail(400,'设定数据格式不正确');
    const chapters=new Set();
    for(const c of b.chapters){
      if(!str(c.id,80)||chapters.has(c.id)||!str(c.title,200)||!str(c.content)) fail(400,'章节数据格式不正确');
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
  catch(e) { if(e.code!=='ENOENT') throw new Error('本地资料无法读取。请保留 library.json 并从 backups 恢复，程序不会覆盖它。'); state={revision:0,books:[]}; }
  let queue=Promise.resolve(), busy=false;
  const token=randomBytes(32).toString('hex');
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  async function body(req){
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>16000000) fail(413,'内容太大，请拆分作品');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'请求格式不正确');}
  }
  const models={text:process.env.OPENAI_TEXT_MODEL||'gpt-4.1',image:process.env.OPENAI_IMAGE_MODEL||'gpt-image-2'};
  async function openai(endpoint,payload){
    if(!key) fail(503,'未检测到 OPENAI_API_KEY，请设置 Windows 环境变量后重新启动。');
    let r;
    try{r=await fetchImpl('https://api.openai.com/v1/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(240000)});}
    catch{fail(502,'OpenAI 连接失败或超时，请检查网络后重试。');}
    if(!r.ok) fail(502,'OpenAI 请求失败（'+r.status+'）。请检查余额、模型权限或稍后重试。');
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
      if(!allowed.includes(host)) fail(403,'仅允许本机访问');
      if(req.headers.origin && !allowed.map(h=>'http://'+h).includes(req.headers.origin)) fail(403,'拒绝外部网站访问');
      if(req.headers['sec-fetch-site']==='cross-site') fail(403,'拒绝跨站访问');
      const url=new URL(req.url,'http://'+host), p=url.pathname;
      if(req.method==='GET' && p==='/api/bootstrap') return json(res,200,{state,token,keyPresent:!!key,models,dataDir});
      if(req.method!=='GET'){
        if(req.headers['x-mojian-token']!==token) fail(403,'页面已过期，请刷新后重试');
        if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'需要 JSON 请求');
      }
      if(req.method==='PUT' && p==='/api/library'){
        const input=await body(req), clean=validate(input);
        const task=queue.then(async()=>{
          if(input.revision!==state.revision) fail(409,'另一个窗口已更新作品。请先将当前内容复制留存，再刷新本页。');
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
        if(!book) fail(404,'作品不存在');
        const name=book.id.replace(/[^a-zA-Z0-9-]/g,'')+'-'+Date.now()+'.txt';
        await fs.writeFile(path.join(dataDir,'exports',name),book.title+'\n\n'+book.chapters.map(c=>c.title+'\n\n'+c.content).join('\n\n'),'utf8');
        return json(res,200,{path:path.join(dataDir,'exports',name)});
      }
      if(req.method==='POST' && (p==='/api/ai/text'||p==='/api/ai/image')){
        const b=await body(req);
        if(b.confirm!==true) fail(400,'请确认发送所选内容');
        if(!str(b.excerpt,12000)||!str(b.prompt,4000)||!str(b.bookId,80)||!str(b.chapterId,80)) fail(400,'输入格式不正确或选中内容过长（最多 12000 字）');
        if(!b.prompt.trim()&&!b.excerpt.trim()) fail(400,'请填写提示词或选择片段');
        if(busy) fail(429,'已有生成任务正在进行，请稍候');
        busy=true;
        try {
          const id=randomUUID(), created=new Date().toISOString();
          if(p.endsWith('/text')){
            const r=await openai('responses',{model:models.text,store:false,max_output_tokens:4000,instructions:'你是中文网络小说创作助手。仅按用户提供的片段和要求创作。默认只输出可供作者编辑的正文，不添加解释。',input:'创作要求：\n'+b.prompt+'\n\n用户明确选中的参考片段（可能为空）：\n'+b.excerpt});
            const text=(r.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');
            if(!text.trim()) fail(502,'模型未返回正文，请调整要求后重试');
            const draft={id,created,text,bookId:b.bookId,chapterId:b.chapterId};
            await fs.writeFile(path.join(dataDir,'drafts',id+'.json'),JSON.stringify(draft,null,2),'utf8');
            return json(res,200,draft);
          }
          const r=await openai('images/generations',{model:models.image,prompt:'为小说片段创作一幅配图，不要添加文字。画面要求：'+b.prompt+'\n小说片段：'+b.excerpt,n:1,size:'1536x1024',quality:'medium',output_format:'png'});
          const data=r.data?.[0]?.b64_json;
          if(!data) fail(502,'模型未返回图片');
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
      fail(404,'未找到内容');
    } catch(e) {json(res,typeof e.code==='number'?e.code:e.code==='ENOENT'?404:500,{error:typeof e.code==='number'?e.message:'本地操作失败，请检查文件权限及磁盘空间。'});}
  });
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createApp();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口已占用。请打开 http://127.0.0.1:3210 或关闭已有实例。':e.message);process.exit(1);});
  server.listen(Number(process.env.PORT)||3210,'127.0.0.1',()=>console.log('墨间已启动：http://127.0.0.1:'+server.address().port));
}
