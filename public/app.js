const $=id=>document.getElementById(id);
let state,token,bookId,chapterId,view='editor',tab='text',mode='Continue',style='East Asian ink wash, negative space, restrained colors';
let dirty=false,saving=null,version=0,saveTimer,aiBusy=false,pendingAI,draftOrigin;
const book=()=>state?.books.find(b=>b.id===bookId);
const chapter=()=>book()?.chapters.find(c=>c.id===chapterId);
const labels={editor:'Manuscript',outline:'Outline',characters:'Characters',world:'Worldbuilding',gallery:'Image gallery'};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6500);}
async function api(url,method='GET',data){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Mojian-Token':token||''},...(data?{body:JSON.stringify(data)}:{})});
  const out=await r.json();if(!r.ok)throw Error(out.error||'Request failed');return out;
}
function status(text,error=false){$('saveStatus').textContent=text;$('saveButton').classList.toggle('error',error);}
function changed(){dirty=true;version++;status('Waiting to save…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>{}),650);}
async function save(){
  clearTimeout(saveTimer);
  if(saving) {await saving;if(dirty)return save();return;}
  if(!dirty)return;
  const snapshot=structuredClone(state),v=version;status('Saving…');
  saving=api('/api/library','PUT',snapshot).then(r=>{state.revision=r.revision;if(version===v)dirty=false;status(dirty?'Waiting to save…':'Saved locally');}).catch(e=>{status('Save failed · Click to retry',true);toast(e.message);throw e;}).finally(()=>saving=null);
  await saving;if(dirty)return save();
}
function count(){const n=$('editor').value.replace(/\s/g,'').length;$('wordCount').textContent=n.toLocaleString();$('readingTime').textContent='~ '+Math.ceil(n/500)+' min read';}
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
  $('bookBreadcrumb').textContent=book()?.title||'My study';$('viewBreadcrumb').textContent=labels[view];
  $('exportBook').disabled=!book();$('renameBook').disabled=!book();$('newChapter').disabled=!book();
  if(view==='gallery'){loadGallery();return;}
  if(!book())return;
  const isChapter=view==='editor';
  $('editorEyebrow').textContent=isChapter?'MANUSCRIPT':'STORY NOTES';
  $('chapterTitle').value=isChapter?(chapter()?.title||''):labels[view];$('chapterTitle').readOnly=!isChapter;
  $('editor').value=isChapter?(chapter()?.content||''):(book()[view]||'');
  $('editor').placeholder=isChapter?'Your story starts here.\n\nThe perfect opening can wait. Put your first thought on the page.':{outline:'Plan your story arc, chapters, and foreshadowing.',characters:'Names, personalities, motivations, and relationships.',world:'Describe the era, rules, geography, and background of your world.'}[view];
  count();
}
function askName(title,value=''){
  $('nameDialogTitle').textContent=title;$('nameInput').value=value;$('nameDialog').returnValue='';
  $('nameDialog').showModal();$('nameInput').focus();
  return new Promise(resolve=>$('nameDialog').addEventListener('close',()=>resolve($('nameDialog').returnValue==='ok'?$('nameInput').value.trim():null),{once:true}));
}
async function newBook(){
  const title=await askName('Name your book');if(!title)return;
  const c={id:crypto.randomUUID(),title:'Chapter 1',content:''},b={id:crypto.randomUUID(),title,outline:'',characters:'',world:'',chapters:[c]};
  state.books.push(b);bookId=b.id;chapterId=c.id;view='editor';changed();render();$('editor').focus();
}
$('newBook').onclick=newBook;$('firstBook').onclick=newBook;
$('renameBook').onclick=async()=>{const b=book();if(!b)return;const title=await askName('Rename book',b.title);if(title){b.title=title;changed();renderNavigation();$('bookBreadcrumb').textContent=title;}};
$('newChapter').onclick=async()=>{const b=book();if(!b)return;const title=await askName('New chapter','Chapter '+(b.chapters.length+1));if(!title)return;const c={id:crypto.randomUUID(),title,content:''};b.chapters.push(c);bookId=b.id;chapterId=c.id;view='editor';changed();render();$('editor').focus();};
$('bookSelect').onchange=()=>{bookId=$('bookSelect').value;chapterId=book()?.chapters[0]?.id;render();};
$('nav').onclick=e=>{const btn=e.target.closest('[data-view]');if(btn){view=btn.dataset.view;render();}};
$('editor').oninput=()=>{if(!book())return;if(view==='editor'&&chapter())chapter().content=$('editor').value;else if(['outline','characters','world'].includes(view))book()[view]=$('editor').value;changed();count();};
$('chapterTitle').oninput=()=>{if(view!=='editor'||!chapter())return;chapter().title=$('chapterTitle').value;changed();renderNavigation();};
$('saveButton').onclick=()=>save().then(()=>{if(!dirty)toast('Saved locally');}).catch(()=>{});
$('fontSelect').onchange=()=>$('editor').classList.toggle('sans',$('fontSelect').value==='sans');
$('fontSize').onchange=()=>{for(const n of [18,20,24])$('editor').classList.toggle('size-'+n,$('fontSize').value===String(n));};
$('focusButton').onclick=()=>{document.body.classList.toggle('focus');$('focusButton').textContent=document.body.classList.contains('focus')?'⛶ Exit focus':'⛶ Focus mode';};
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('focus');if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save().catch(()=>{});}});
$('useSelection').onclick=()=>{const text=$('editor').value.slice($('editor').selectionStart,$('editor').selectionEnd);if(!text.trim()){toast('Select an excerpt in the manuscript first.');return;}if(text.length>12000){toast('Select a shorter excerpt (maximum 12,000 characters).');return;}$('excerpt').value=text;excerptCount();toast('Excerpt selected. Nothing has been sent yet.');};
function excerptCount(){$('excerptCount').textContent=$('excerpt').value.length+' chars';}
$('excerpt').oninput=excerptCount;
function switchTab(next){
  tab=next;for(const t of ['text','image']){$(t+'Tab').classList.toggle('active',tab===t);$(t+'Tab').setAttribute('aria-selected',String(tab===t));}
  $('textOptions').hidden=tab!=='text';$('imageOptions').hidden=tab!=='image';
  $('assistantTitle').textContent=tab==='text'?'A little company for your next chapter.':'Give your words a world to live in.';
  $('assistantDescription').textContent=tab==='text'?'A fresh idea, a few more lines. You remain the author.':'Begin with an excerpt. Bring its places and people into view.';
  $('generate').textContent=aiBusy?'Generating, please wait…':tab==='text'?'✦ Start writing':'✦ Generate image';
}
$('textTab').onclick=()=>switchTab('text');$('imageTab').onclick=()=>switchTab('image');
$('modes').onclick=e=>{if(!e.target.dataset.mode)return;mode=e.target.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));};
$('styles').onclick=e=>{if(!e.target.dataset.style)return;style=e.target.dataset.style;document.querySelectorAll('[data-style]').forEach(x=>x.classList.toggle('active',x.dataset.style===style));};
$('generate').onclick=()=>{
  if(aiBusy)return;
  if(!book()){toast('Create a book first.');return;}
  const excerpt=$('excerpt').value.trim(), extra=$('prompt').value.trim();
  if(!excerpt&&!extra){toast('Select an excerpt or enter your writing instructions.');return;}
  pendingAI={kind:tab,confirm:true,bookId,chapterId:chapterId||'',excerpt,prompt:(tab==='text'?'Please '+mode.toLowerCase()+'. ':style+'. ')+extra};
  $('sendPreview').textContent='Instructions:\n'+pendingAI.prompt+'\n\nReference excerpt:\n'+(excerpt||'(none)');$('confirmDialog').showModal();
};
$('cancelGenerate').onclick=()=>$('confirmDialog').close();
$('confirmGenerate').onclick=async()=>{
  $('confirmDialog').close();const request=pendingAI;aiBusy=true;$('generate').disabled=true;switchTab(tab);
  try{
    const r=await api('/api/ai/'+request.kind,'POST',request);
    $('resultEmpty').hidden=true;
    if(request.kind==='text'){draftOrigin=r;$('draft').value=r.text;$('textResult').hidden=false;toast('Draft generated and saved locally.');}
    else{$('generatedImage').src=r.url;$('imageLink').href=r.url;$('imageResult').hidden=false;toast('Image generated and saved to your local gallery.');if(view==='gallery')loadGallery();}
  }catch(e){toast(e.message);}finally{aiBusy=false;$('generate').disabled=false;switchTab(tab);}
};
$('insertDraft').onclick=()=>{
  if(!chapter()){toast('Choose a chapter first.');return;}
  if(draftOrigin?.bookId!==bookId||draftOrigin?.chapterId!==chapterId){if(!confirm('This draft was created for a different chapter. Append it to '+chapter().title+' anyway?'))return;}
  const text=$('draft').value.trim();if(!text)return;chapter().content+=(chapter().content?'\n\n':'')+text;view='editor';changed();render();toast('Appended to the chapter. Your original text is preserved.');
};
$('exportBook').onclick=async()=>{try{await save();const result=await api('/api/export','POST',{bookId});toast('TXT saved to: '+result.path);}catch(e){toast(e.message);}};
async function loadGallery(){
  const grid=$('galleryGrid');grid.replaceChildren();
  try{
    const items=await api('/api/gallery');
    if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='No images yet. Select an excerpt and open the Illustrations tab to get started.';grid.append(p);}
    for(const item of items){const card=document.createElement('a');card.className='gallery-card';card.href=item.url;card.target='_blank';card.rel='noreferrer';const img=document.createElement('img');img.src=item.url;img.alt='Story illustration';img.loading='lazy';const caption=document.createElement('p');caption.textContent=new Date(item.created).toLocaleString('en-US');card.append(img,caption);grid.append(card);}
  }catch(e){toast(e.message);}
}
$('settingsButton').onclick=()=>$('settingsDialog').showModal();$('closeSettings').onclick=()=>$('settingsDialog').close();
$('historyButton').onclick=async()=>{
  try{const items=await api('/api/drafts');$('draftList').replaceChildren();if(!items.length)$('draftList').textContent='No drafts yet.';
    for(const item of items){const button=document.createElement('button');button.className='draft-item';button.textContent=new Date(item.created).toLocaleString('en-US')+'\n'+item.text.slice(0,130);button.onclick=()=>{draftOrigin=item;$('draft').value=item.text;$('textResult').hidden=false;$('resultEmpty').hidden=true;$('historyDialog').close();};$('draftList').append(button);}
    $('historyDialog').showModal();
  }catch(e){toast(e.message);}
};$('closeHistory').onclick=()=>$('historyDialog').close();
window.addEventListener('beforeunload',e=>{if(dirty||saving||aiBusy){e.preventDefault();e.returnValue='';}});
async function init(){
  try{
    const r=await api('/api/bootstrap');state=r.state;token=r.token;
    bookId=state.books[0]?.id;chapterId=book()?.chapters[0]?.id;
    $('keyStatus').textContent=r.keyPresent?'● API key ready':'○ API key missing';
    $('dataPath').textContent=r.dataDir;$('modelInfo').textContent='Text: '+r.models.text+' / Image: '+r.models.image;
    status('Saved locally');render();
  }catch(e){status('Cannot read local data',true);toast(e.message);$('editor').disabled=true;$('newBook').disabled=true;$('firstBook').disabled=true;}
}
init();
