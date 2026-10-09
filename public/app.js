const $=id=>document.getElementById(id);
let state,token,bookId,chapterId,view='editor',tab='text',mode='续写',style='东方水墨，留白，淡雅';
let dirty=false,saving=null,version=0,saveTimer,aiBusy=false,pendingAI,draftOrigin;
const book=()=>state?.books.find(b=>b.id===bookId);
const chapter=()=>book()?.chapters.find(c=>c.id===chapterId);
const labels={editor:'正文创作',outline:'章节大纲',characters:'人物设定',world:'世界观',gallery:'灵感图库'};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6500);}
async function api(url,method='GET',data){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Mojian-Token':token||''},...(data?{body:JSON.stringify(data)}:{})});
  const out=await r.json();if(!r.ok)throw Error(out.error||'请求失败');return out;
}
function status(text,error=false){$('saveStatus').textContent=text;$('saveButton').classList.toggle('error',error);}
function changed(){dirty=true;version++;status('正在等待保存…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>{}),650);}
async function save(){
  clearTimeout(saveTimer);
  if(saving) {await saving;if(dirty)return save();return;}
  if(!dirty)return;
  const snapshot=structuredClone(state),v=version;status('正在保存…');
  saving=api('/api/library','PUT',snapshot).then(r=>{state.revision=r.revision;if(version===v)dirty=false;status(dirty?'正在等待保存…':'已保存到本地');}).catch(e=>{status('保存失败 · 点击重试',true);toast(e.message);throw e;}).finally(()=>saving=null);
  await saving;if(dirty)return save();
}
function count(){const n=$('editor').value.replace(/\s/g,'').length;$('wordCount').textContent=n.toLocaleString();$('readingTime').textContent='约 '+Math.ceil(n/500)+' 分钟阅读';}
function renderNavigation(){
  const select=$('bookSelect');select.replaceChildren();
  for(const b of state.books){const option=document.createElement('option');option.value=b.id;option.textContent=b.title;select.append(option);}
  select.value=bookId||'';
  $('chapters').replaceChildren();
  for(const c of book()?.chapters||[]){
    const btn=document.createElement('button');btn.className='chapter-button'+(c.id===chapterId?' active':'');btn.textContent=c.title;btn.title=c.title;
    btn.onclick=()=>{chapterId=c.id;view='editor';render();};$('chapters').append(btn);
  }
}
function render(){
  renderNavigation();
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  $('emptyView').hidden=!!book()||view==='gallery';
  $('writingView').hidden=!book()||view==='gallery';
  $('galleryView').hidden=view!=='gallery';
  $('bookBreadcrumb').textContent=book()?.title||'我的书房';$('viewBreadcrumb').textContent=labels[view];
  $('exportBook').disabled=!book();$('renameBook').disabled=!book();$('newChapter').disabled=!book();
  if(view==='gallery'){loadGallery();return;}
  if(!book())return;
  const isChapter=view==='editor';
  $('editorEyebrow').textContent=isChapter?'MANUSCRIPT / 正文':'STORY NOTES / 创作手记';
  $('chapterTitle').value=isChapter?(chapter()?.title||''):labels[view];$('chapterTitle').readOnly=!isChapter;
  $('editor').value=isChapter?(chapter()?.content||''):(book()[view]||'');
  $('editor').placeholder=isChapter?'在这里写下你的故事。\n\n不用急着找到完美的开头，先让第一个念头落在纸上。':{outline:'记录故事主线、章节安排与伏笔。',characters:'姓名、性格、动机，以及人物之间的关系。',world:'记录故事的时代、规则、地理与世界背景。'}[view];
  count();
}
function askName(title,value=''){
  $('nameDialogTitle').textContent=title;$('nameInput').value=value;$('nameDialog').returnValue='';
  $('nameDialog').showModal();$('nameInput').focus();
  return new Promise(resolve=>$('nameDialog').addEventListener('close',()=>resolve($('nameDialog').returnValue==='ok'?$('nameInput').value.trim():null),{once:true}));
}
async function newBook(){
  const title=await askName('为作品起个名字');if(!title)return;
  const c={id:crypto.randomUUID(),title:'第一章',content:''},b={id:crypto.randomUUID(),title,outline:'',characters:'',world:'',chapters:[c]};
  state.books.push(b);bookId=b.id;chapterId=c.id;view='editor';changed();render();$('editor').focus();
}
$('newBook').onclick=newBook;$('firstBook').onclick=newBook;
$('renameBook').onclick=async()=>{const b=book();if(!b)return;const title=await askName('重命名作品',b.title);if(title){b.title=title;changed();renderNavigation();$('bookBreadcrumb').textContent=title;}};
$('newChapter').onclick=async()=>{const b=book();if(!b)return;const title=await askName('新建章节','第'+(b.chapters.length+1)+'章');if(!title)return;const c={id:crypto.randomUUID(),title,content:''};b.chapters.push(c);bookId=b.id;chapterId=c.id;view='editor';changed();render();$('editor').focus();};
$('bookSelect').onchange=()=>{bookId=$('bookSelect').value;chapterId=book()?.chapters[0]?.id;render();};
$('nav').onclick=e=>{const btn=e.target.closest('[data-view]');if(btn){view=btn.dataset.view;render();}};
$('editor').oninput=()=>{if(!book())return;if(view==='editor'&&chapter())chapter().content=$('editor').value;else if(['outline','characters','world'].includes(view))book()[view]=$('editor').value;changed();count();};
$('chapterTitle').oninput=()=>{if(view!=='editor'||!chapter())return;chapter().title=$('chapterTitle').value;changed();renderNavigation();};
$('saveButton').onclick=()=>save().then(()=>{if(!dirty)toast('已保存到本地');}).catch(()=>{});
$('fontSelect').onchange=()=>$('editor').classList.toggle('sans',$('fontSelect').value==='sans');
$('fontSize').onchange=()=>{for(const n of [18,20,24])$('editor').classList.toggle('size-'+n,$('fontSize').value===String(n));};
$('focusButton').onclick=()=>{document.body.classList.toggle('focus');$('focusButton').textContent=document.body.classList.contains('focus')?'⛶ 退出专注':'⛶ 专注模式';};
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('focus');if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save().catch(()=>{});}});
$('useSelection').onclick=()=>{const text=$('editor').value.slice($('editor').selectionStart,$('editor').selectionEnd);if(!text.trim()){toast('请先在正文中选中一段文字');return;}if(text.length>12000){toast('片段最多 12000 字，请缩小选择范围');return;}$('excerpt').value=text;excerptCount();toast('已放入参考片段；尚未发送');};
function excerptCount(){$('excerptCount').textContent=$('excerpt').value.length+' 字';}
$('excerpt').oninput=excerptCount;
function switchTab(next){
  tab=next;for(const t of ['text','image']){$(t+'Tab').classList.toggle('active',tab===t);$(t+'Tab').setAttribute('aria-selected',String(tab===t));}
  $('textOptions').hidden=tab!=='text';$('imageOptions').hidden=tab!=='image';
  $('assistantTitle').textContent=tab==='text'?'陪你，把故事写下去。':'让文字，长出画面。';
  $('assistantDescription').textContent=tab==='text'?'一个灵感，一段续写。创作的方向始终在你手中。':'从一段文字出发，看见故事里的山河与人物。';
  $('generate').textContent=aiBusy?'正在生成，请稍候…':tab==='text'?'✦ 开始创作':'✦ 生成配图';
}
$('textTab').onclick=()=>switchTab('text');$('imageTab').onclick=()=>switchTab('image');
$('modes').onclick=e=>{if(!e.target.dataset.mode)return;mode=e.target.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));};
$('styles').onclick=e=>{if(!e.target.dataset.style)return;style=e.target.dataset.style;document.querySelectorAll('[data-style]').forEach(x=>x.classList.toggle('active',x.dataset.style===style));};
$('generate').onclick=()=>{
  if(aiBusy)return;
  if(!book()){toast('请先创建一部作品');return;}
  const excerpt=$('excerpt').value.trim(), extra=$('prompt').value.trim();
  if(!excerpt&&!extra){toast('请选择参考片段，或填写你的创作要求');return;}
  pendingAI={kind:tab,confirm:true,bookId,chapterId:chapterId||'',excerpt,prompt:(tab==='text'?'请'+mode+'。':style+'。')+extra};
  $('sendPreview').textContent='要求：\n'+pendingAI.prompt+'\n\n参考片段：\n'+(excerpt||'（无）');$('confirmDialog').showModal();
};
$('cancelGenerate').onclick=()=>$('confirmDialog').close();
$('confirmGenerate').onclick=async()=>{
  $('confirmDialog').close();const request=pendingAI;aiBusy=true;$('generate').disabled=true;switchTab(tab);
  try{
    const r=await api('/api/ai/'+request.kind,'POST',request);
    $('resultEmpty').hidden=true;
    if(request.kind==='text'){draftOrigin=r;$('draft').value=r.text;$('textResult').hidden=false;toast('草稿已生成并保存到本地');}
    else{$('generatedImage').src=r.url;$('imageLink').href=r.url;$('imageResult').hidden=false;toast('配图已生成并保存到本地图库');if(view==='gallery')loadGallery();}
  }catch(e){toast(e.message);}finally{aiBusy=false;$('generate').disabled=false;switchTab(tab);}
};
$('insertDraft').onclick=()=>{
  if(!chapter()){toast('请先选择要插入的章节');return;}
  if(draftOrigin?.bookId!==bookId||draftOrigin?.chapterId!==chapterId){if(!confirm('当前章节与生成草稿时不同，仍追加到「'+chapter().title+'」吗？'))return;}
  const text=$('draft').value.trim();if(!text)return;chapter().content+=(chapter().content?'\n\n':'')+text;view='editor';changed();render();toast('已追加到章节末尾，原文已保留');
};
$('exportBook').onclick=async()=>{try{await save();const result=await api('/api/export','POST',{bookId});toast('TXT 已保存：'+result.path);}catch(e){toast(e.message);}};
async function loadGallery(){
  const grid=$('galleryGrid');grid.replaceChildren();
  try{
    const items=await api('/api/gallery');
    if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='还没有配图。选中正文片段，在右侧「片段配图」中开始。';grid.append(p);}
    for(const item of items){const card=document.createElement('a');card.className='gallery-card';card.href=item.url;card.target='_blank';card.rel='noreferrer';const img=document.createElement('img');img.src=item.url;img.alt='小说配图';img.loading='lazy';const caption=document.createElement('p');caption.textContent=new Date(item.created).toLocaleString('zh-CN');card.append(img,caption);grid.append(card);}
  }catch(e){toast(e.message);}
}
$('settingsButton').onclick=()=>$('settingsDialog').showModal();$('closeSettings').onclick=()=>$('settingsDialog').close();
$('historyButton').onclick=async()=>{
  try{const items=await api('/api/drafts');$('draftList').replaceChildren();if(!items.length)$('draftList').textContent='还没有历史草稿。';
    for(const item of items){const button=document.createElement('button');button.className='draft-item';button.textContent=new Date(item.created).toLocaleString('zh-CN')+'\n'+item.text.slice(0,130);button.onclick=()=>{draftOrigin=item;$('draft').value=item.text;$('textResult').hidden=false;$('resultEmpty').hidden=true;$('historyDialog').close();};$('draftList').append(button);}
    $('historyDialog').showModal();
  }catch(e){toast(e.message);}
};$('closeHistory').onclick=()=>$('historyDialog').close();
window.addEventListener('beforeunload',e=>{if(dirty||saving||aiBusy){e.preventDefault();e.returnValue='';}});
async function init(){
  try{
    const r=await api('/api/bootstrap');state=r.state;token=r.token;
    bookId=state.books[0]?.id;chapterId=book()?.chapters[0]?.id;
    $('keyStatus').textContent=r.keyPresent?'● API Key 已就绪':'○ 未配置 API Key';
    $('dataPath').textContent=r.dataDir;$('modelInfo').textContent='文字：'+r.models.text+'　/　配图：'+r.models.image;
    status('已保存到本地');render();
  }catch(e){status('无法读取本地资料',true);toast(e.message);$('editor').disabled=true;$('newBook').disabled=true;$('firstBook').disabled=true;}
}
init();
