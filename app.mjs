import {COLORS,GOLD,colorOf,normalizeNote,depthFor,displayName,validateBackup,mergeNotes,nextPosition,deleteNote,resolveMotion} from './model.mjs';
import {Universe} from './space.mjs';
import {SpaceAudio,SOUND_MODES,audioActivationEvent} from './audio.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const icon=n=>'<svg aria-hidden="true"><use href="#i-'+n+'"/></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sound=new SpaceAudio();let universe=null,dragging=false,dragFromTray=false,suppressClickUntil=0;
const fmtTime=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const fullDate=t=>new Date(t).toLocaleString('zh-CN',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const dot=c=>'<span class="color-dot" style="--c:'+c.hex+'"></span>';
const point=(n,i=0)=>'<span class="star-point '+(n.kind==='insight'?'burst-point':'')+'" style="--c:'+colorOf(n).hex+';--size:'+(n.kind==='insight'?10:Math.min(4,3+Math.log1p(n.body.length)*.16))+'px;--delay:-'+((i*1.13)%7.7)+'s">'+(n.kind==='insight'?'<span class="burst-aura"></span><span class="burst-dust"></span>':'')+'</span>';
let db=null,state={version:1,notes:[],settings:{motion:null,showDemo:true,sound:'all'}},demo=false,view='space',filter='all',colorFilter='',query='',selected=new Set(),detailId=null,editor=null,draftTimer,toastTimer,installEvent=null;
let pendingDelete=null,deleting=false;
const systemMotion=matchMedia('(prefers-reduced-motion:reduce)');
let mutations=Promise.resolve(),draftWrites=Promise.resolve(),offlineReady=false;
const now=Date.now(),day=86400000;
const example=(id,title,body,color,x,y,offset,kind='idea',sources=[])=>({id,title,body,color,x,y,kind,sources,active:true,createdAt:now-offset,updatedAt:now-offset});
const samples=[
example('sample-rain','雨天的城市','雨天的城市像一座水族馆。\n行人撑着伞，像缓慢游动的鱼。\n\n想把这种感觉留在一个故事的开场里。','blue',.25,.2,day/2),
example('sample-letter','未寄出的信','有些话写下来的时候，就已经抵达了某个地方。\n\n不一定需要寄出，也不一定需要回答。','rose',.8,.28,day+3600000),
example('sample-sound','声音的形状','每个人都有一种，不愿被别人听见的声音。\n\n如果声音有形状，它会藏在哪里？','sage',.1,.48,day/3),
example('sample-night','夜行的人','想试着拍一组夜晚的路灯。\n让画面里的人只留下轮廓，让光替他们说话。','blue',.8,.68,day*2),
example('sample-melody','一段旋律','梦里有一段听不完整的旋律。\n如果每一颗星，都保存着一个人忘记的歌呢？','violet',.3,.8,day*2.5),
{...example('sample-old','旧故事','把暂时没有答案的念头，留给以后。','blue',.84,.94,day*3),active:false},
example('sample-memory','会发光的记忆','也许可以写一个故事：雨夜里，每封未寄出的信都会变成一盏路灯。\n\n夜行的人借着这些光，看见那些没有说出口的话。\n\n从雨天的画面、未寄出的信和夜行的轮廓里，长出了这个新灵感。','gold',.5,.48,3600000,'insight',['sample-rain','sample-letter','sample-night'])];
function notes(){if(!demo)return state.notes;const hidden=new Set(state.settings.hiddenSamples||[]);return samples.filter(n=>!hidden.has(n.id)).map(n=>({...n,sources:n.sources.filter(id=>!hidden.has(id))}));}
function find(id){return notes().find(n=>n.id===id);}
function toast(msg){clearTimeout(toastTimer);$('#toast').textContent=msg;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function storageError(err){$('#storageError').hidden=false;$('#storageError').textContent='本地保存暂不可用，内容尚未保存。请保留当前输入并重试。';$('#saveStatus').innerHTML='<i style="background:#d2a5ae"></i>保存不可用';console.error('Local persistence error',err);}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('stardust-local-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('数据库更新被其他页面占用'));r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();storageError(Error('数据库版本已变化，请刷新页面'));};resolve(r.result);};});}
function get(key){return new Promise((resolve,reject)=>{if(!db)return reject(Error('数据库尚未就绪'));const r=db.transaction('kv','readonly').objectStore('kv').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function put(key,value){return new Promise((resolve,reject)=>{if(!db)return reject(Error('数据库尚未就绪'));const t=db.transaction('kv','readwrite');t.objectStore('kv').put(value,key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('保存中断'));});}
const syncChannel='BroadcastChannel'in window?new BroadcastChannel('stardust-sync'):null; if(syncChannel)syncChannel.onmessage=async()=>{try{const fresh=await get('state');if(fresh){state=fresh;render();}}catch{}};
function mutate(fn){const task=mutations.then(()=>new Promise((resolve,reject)=>{if(!db)return reject(Error('数据库不可用'));const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv'),r=store.get('state');let next,cause;r.onsuccess=()=>{try{next=structuredClone(r.result||state);next.notes=next.notes.map(normalizeNote);fn(next,store);store.put(next,'state');}catch(e){cause=e;tx.abort();}};tx.oncomplete=()=>{state=next;$('#storageError').hidden=true;$('#saveStatus').innerHTML='<i></i>已保存到本地';syncChannel?.postMessage('updated');resolve();};tx.onerror=()=>reject(cause||tx.error);tx.onabort=()=>reject(cause||tx.error||Error('保存中断'));}));mutations=task.catch(()=>{});return task.catch(e=>{storageError(e);throw e;});}
function visible(){return notes().filter(n=>(filter==='all'||n.active===(filter==='active'))&&(!colorFilter||n.color===colorFilter)&&(!query||(n.title+'\n'+n.body).toLocaleLowerCase().includes(query.toLocaleLowerCase())));}
function parentGroups(id){return notes().filter(n=>n.kind==='insight'&&n.sources.includes(id));}
function setView(v){universe?.cancel();view=v;document.body.dataset.view=v;$('#spaceView').hidden=v!=='space';$('#recordsView').hidden=v!=='records';$('#breadcrumb').textContent=v==='space'?'灵感宇宙':'记录';$('#viewTitle').textContent=v==='space'?'让灵感，慢慢发光。':'记录';$('#viewSubtitle').textContent=v==='space'?'给灵感一个坐标，让每次闪念都有迹可循。':'按时间，重逢那些闪闪发亮的灵感。';$('#viewEyebrow').textContent=v==='space'?'A LITTLE SPACE FOR YOUR MIND':'EVERY THOUGHT LEAVES A TRACE';$$('[data-view]').forEach(b=>{const active=b.dataset.view===v;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});render();}
function render(){
 const list=visible();$('#spaceCount').innerHTML='<strong>'+notes().length+'</strong> 条灵感 <span>·</span> '+notes().filter(n=>n.active).length+' 颗点亮';
 $('#demoBanner').hidden=!demo;$('#demoBanner button').innerHTML=state.notes.length?'返回我的灵感 <span>↗</span>':'开始我的记录 <span>↗</span>';
 $('#sidePalette').innerHTML=COLORS.map(c=>'<div class="side-color"><span class="side-spark" style="--c:'+c.hex+'">'+point({kind:'idea',color:c.id,body:''})+'</span><div><span>'+c.name+'</span><small>'+c.hint+'</small></div></div>').join('');
 $('#colorFilters').innerHTML='<span>颜色</span>'+COLORS.map(c=>'<button class="color-filter '+(colorFilter===c.id?'active':'')+'" style="--c:'+c.hex+'" data-color-filter="'+c.id+'" aria-label="筛选'+c.name+'" aria-pressed="'+(colorFilter===c.id)+'" title="'+c.name+'">'+dot(c)+'</button>').join('');
 $$('[data-filter]').forEach(b=>{b.classList.toggle('active',filter===b.dataset.filter);b.setAttribute('aria-pressed',filter===b.dataset.filter);});
 renderStars(list);renderRecords(list);renderSelection();renderMotion();sound.setMode(state.settings.sound);updateAudioUI();
}
function renderStars(list){
 $('#spaceEmpty').hidden=list.length>0;
 if(!list.length){const filtering=query||colorFilter||filter!=='all';$('#spaceEmpty h2').textContent=filtering?'还没有找到这颗星。':'第一颗星，从一个灵感开始。';$('#spaceEmpty p').textContent=filtering?'换一个词，或清除筛选再看看。':'一句话也好，一个还没想清楚的点子也好。';}
 $('#stars').innerHTML=list.map((n,i)=>'<button id="star-'+esc(n.id)+'" class="star-node '+n.kind+(n.active?'':' dim')+(selected.has(n.id)?' selected':'')+'" data-note="'+esc(n.id)+'" aria-label="打开灵感：'+esc(displayName(n))+'">'+point(n,i)+'<span class="star-label">'+esc(displayName(n))+'</span>'+(n.kind==='insight'?'<span class="star-subtitle">灵感奇点 · '+n.sources.length+' 条灵感</span>':'')+'</button>').join('');
 universe?.setItems(list);
}
function dateLabel(t){const d=new Date(t),today=new Date(),yesterday=new Date(Date.now()-day);const same=a=>a.toDateString()===d.toDateString();return (same(today)?'今天 · ':same(yesterday)?'昨天 · ':'')+d.toLocaleDateString('zh-CN',{month:'long',day:'numeric',...(d.getFullYear()===today.getFullYear()?{}:{year:'numeric'})});}
function renderRecords(list){
 const sort=$('#sortOrder').value==='oldest'?1:-1;const sorted=[...list].sort((a,b)=>sort*(a.createdAt-b.createdAt));let last='';
 $('#recordsList').innerHTML=sorted.length?sorted.map((n,i)=>{const date=dateLabel(n.createdAt),heading=last!==date?'<h2 class="date-heading">'+date+'</h2>':'';last=date;const parents=parentGroups(n.id);const tags=(n.kind==='insight'?'<span>'+icon('link')+'来自 '+n.sources.length+' 条灵感</span>':parents.slice(0,2).map(p=>'<span>'+icon('link')+esc(displayName(p))+'</span>').join(''))+(!n.active?'<span>◌ 已熄灭</span>':'')+(selected.has(n.id)?'<span>✓ 已选择</span>':'');return heading+'<div class="record-item"><button class="swipe-delete" data-act="delete-note" data-id="'+esc(n.id)+'" aria-label="删除灵感：'+esc(displayName(n))+'" aria-hidden="true" tabindex="-1" disabled>'+icon('trash')+'<span>删除</span></button><button class="record-row '+n.kind+(n.active?'':' dim')+(selected.has(n.id)?' selected':'')+'" data-note="'+esc(n.id)+'" aria-label="打开灵感：'+esc(displayName(n))+'"><span class="star-slot">'+point(n,i)+'</span><span class="record-content"><span class="record-title"><h3>'+esc(displayName(n))+'</h3><time>'+fmtTime(n.createdAt)+'</time></span><span class="record-excerpt">'+esc(n.body||'先把灵感放在一起，新的想法可以慢慢补充。')+'</span>'+(tags?'<span class="record-tags">'+tags+'</span>':'')+'</span></button></div>';}).join(''):'<div class="list-empty"><span class="empty-spark">✧</span><h3>'+(query||filter!=='all'||colorFilter?'没有找到匹配的灵感':'这里会收下你的每一个灵感')+'</h3><p>'+(query||filter!=='all'||colorFilter?'试试其他关键词，或清除筛选。':'点击「创建灵感」，写下第一句话。')+'</p></div>';
}
function renderSelection(){
 selected=new Set([...selected].filter(id=>find(id)?.kind==='idea'));
 $('#selectionTray').hidden=!dragging&&selected.size===0;
 $('#selectionTray').classList.toggle('receiving',dragging&&!dragFromTray);
 $('#dropMessage').hidden=selected.size>0||!dragging||dragFromTray;
 $('#selectionContent').hidden=selected.size===0;
 document.body.classList.toggle('has-selection',selected.size>0);
 $('.selection-help').textContent=view==='space'?'拖回星空可取消选择':'拖回列表可取消选择';
 $('#selectionCount').textContent='已选灵感 · '+selected.size+' 条';
 $('#selectedChips').innerHTML=[...selected].map(id=>{const n=find(id);return '<div class="selected-chip" data-selected-id="'+esc(id)+'">'+point(n)+'<span class="selected-name">'+esc(displayName(n))+'</span><button class="icon-button" data-act="remove-selection" data-id="'+esc(id)+'" aria-label="取消选择：'+esc(displayName(n))+'">'+icon('close')+'</button></div>';}).join('');
 $('#combineButton').disabled=selected.size<2;$('#combineButton').title=selected.size<2?'再选一条灵感，让灵感迸发':'让灵感迸发';
}
function removeSelection(id){selected.delete(id);sound.play('remove');render();}
function updateAudioUI(){const mode=sound.mode;const labels={all:'音乐与音效开启',effects:'仅音效开启',muted:'全部静音'};const next={all:'关闭音乐',effects:'全部静音',muted:'恢复音乐与音效'};$('#audioButton').innerHTML=icon(mode==='all'?'audio':mode==='effects'?'effects':'muted');$('#audioButton').dataset.mode=mode;$('#audioButton').setAttribute('aria-label','声音：'+labels[mode]+'，点击'+next[mode]);$('#audioButton').title=labels[mode]+' · 点击'+next[mode];$('#settingsAudio').textContent=mode!=='muted'&&!sound.ready?'启用声音':mode==='all'&&sound.error==='music'?'重试音乐':labels[mode];$('#settingsAudio').dataset.act=mode!=='muted'&&(!sound.ready||sound.error==='music')?'retry-audio':'audio';$('#soundDescription').textContent=sound.status;}
async function cycleAudio(){const old=state.settings.sound||'all',mode=SOUND_MODES[(SOUND_MODES.indexOf(old)+1)%3];sound.setMode(mode);void sound.retry();try{await mutate(s=>{s.settings.sound=mode;});updateAudioUI();toast(mode==='all'?'音乐与音效已开启':mode==='effects'?'音乐已关闭，保留音效':'已全部静音');}catch{sound.setMode(old);}}
function openDetail(id){const n=find(id);if(!n)return;sound.play('open');detailId=id;const c=colorOf(n);const relations=n.kind==='insight'?n.sources.map(find).filter(Boolean):parentGroups(n.id);
 $('#detailContent').innerHTML='<div class="sheet-head"><div><div class="eyebrow">'+(demo?'示例灵感':n.kind==='insight'?'灵感之间，长出了新的想法':'A THOUGHT WORTH KEEPING')+'</div><div class="detail-star '+(n.kind==='insight'?'insight ':'')+(n.active?'':'dim')+'">'+point(n)+'</div><h2 class="detail-title">'+esc(displayName(n))+'</h2><div class="detail-meta">'+c.name+' <span> / </span> '+fullDate(n.createdAt)+'</div></div><button class="icon-button" data-act="close-detail" aria-label="关闭详情">'+icon('close')+'</button></div><div class="detail-body '+(!n.body?'detail-empty':'')+'">'+esc(n.body||'新的想法还在酝酿，随时可以补充。')+'</div>'+(relations.length?'<section class="detail-sources"><h3>'+(n.kind==='insight'?'从这些灵感开始':'它参与了这些新想法')+'</h3>'+relations.map(s=>'<button class="source-chip" data-note="'+esc(s.id)+'">'+dot(colorOf(s))+esc(displayName(s))+'</button>').join('')+'</section>':'')+'<div class="detail-actions"><button class="quiet-button" data-act="edit">'+(demo?'复制并编辑':'编辑灵感')+'</button><button class="quiet-button" data-act="toggle">'+(n.active?'熄灭灵感':'重新点亮')+'</button>'+(n.kind==='idea'?'<button class="quiet-button" data-act="select">'+(selected.has(id)?'取消选择':'选择灵感')+'</button>':'')+'<button class="quiet-button danger-button" data-act="delete-note" data-id="'+esc(id)+'">删除灵感</button></div>'+(demo?'<p class="detail-sample">这是一条示例。复制保存后，才会进入你的本地记录。</p>':'');
 if(!$('#detailDialog').open)$('#detailDialog').showModal();
}

function renderMotion(){
 const enabled=resolveMotion(state.settings.motion,systemMotion.matches);document.body.classList.toggle('no-motion',!enabled);document.body.classList.toggle('motion-enabled',enabled);$('#motionToggle').checked=enabled;if(universe)universe.motion=enabled;
 $('#motionDescription').textContent=enabled?'星空流动、连线与星点呼吸已开启':state.settings.motion===false?'动画已暂停；仍可手动旋转':'跟随系统减少动态效果；打开开关可为星尘启用动画';
}
systemMotion.addEventListener('change',renderMotion);
function requestDelete(id){
 const n=find(id);if(!n||deleting)return;universe?.cancel();pendingDelete={id,demo};
 $('#deleteName').textContent=displayName(n);$('#deleteHeading').textContent=n.kind==='insight'?'删除这个灵感奇点？':'删除这条灵感？';
 const count=parentGroups(id).length;$('#deleteImpact').textContent=n.kind==='insight'?'只删除这个灵感奇点，来源灵感仍会保留。':count?'将解除它与 '+count+' 个灵感奇点的关联，奇点内容仍保留。':'';
 $('#deleteError').textContent='';$('#confirmDelete').disabled=false;$('#deleteDialog').showModal();$('#cancelDelete').focus();
}
async function confirmDelete(){
 const pending=pendingDelete;if(!pending||deleting)return;deleting=true;$('#confirmDelete').disabled=true;$('#cancelDelete').disabled=true;$('#deleteError').textContent='';
 try{await draftWrites;
  await mutate((s,store)=>{
   if(pending.demo)s.settings.hiddenSamples=[...new Set([...(s.settings.hiddenSamples||[]),pending.id])];
   else s.notes=deleteNote(s.notes,pending.id);
   // Draft removal shares the state transaction: no partial deletion on storage failure.
   const cursor=store.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const draft=item.value;if(String(item.key)==='draft:'+pending.id)item.delete();else if(String(item.key).startsWith('draft:')&&draft?.editor?.sources?.includes(pending.id)){draft.editor.sources=draft.editor.sources.filter(id=>id!==pending.id);item.update(draft);}item.continue();};
  });
  selected.delete(pending.id);$('#deleteDialog').close();$('#detailDialog').close();detailId=null;render();sound.play('remove');toast('已永久删除，无法找回');
 }catch{$('#deleteError').textContent='删除未能保存，内容仍保留，请重试。';}finally{deleting=false;$('#confirmDelete').disabled=false;$('#cancelDelete').disabled=false;}
}
$('#deleteDialog').addEventListener('cancel',e=>{if(deleting)e.preventDefault();});
$('#deleteDialog').addEventListener('close',()=>{pendingDelete=null;});

function draftKey(e){return 'draft:'+(e.id||(e.kind==='insight'?'combine':'new'));}
function palette(){const composite=editor.kind==='insight',c=composite?GOLD:COLORS.find(c=>c.id===editor.color)||COLORS[0];$('#editorPalette').innerHTML=composite?'<span class="insight-color">'+point({kind:'insight',color:'gold',body:''})+'<span>灵感奇点 · 淡金色</span></span>':COLORS.map(col=>'<button type="button" class="editor-color '+(col.id===c.id?'active':'')+'" style="--c:'+col.hex+'" data-editor-color="'+col.id+'" aria-pressed="'+(col.id===c.id)+'" aria-label="'+col.name+'">'+dot(col)+col.name+'</button>').join('');$('#colorHint').textContent=c.hint;}
async function openEditor(n=null,sources=[]){
 $('#detailDialog').close();editor={id:n&&!demo?n.id:null,kind:n?.kind|| (sources.length?'insight':'idea'),color:n?.color||(sources.length?'gold':COLORS[Math.floor(Math.random()*COLORS.length)].id),sources:n?.sources||sources,copy:!!n&&demo};
 let title=n?.title||'',body=n?.body||'';
 try{const d=await get(draftKey(editor));if(d&&!n&&!sources.length&&d.editor?.kind!=='insight'){editor={...editor,...d.editor};title=d.title;body=d.body;toast('已恢复上次未保存的草稿');}else if(d&&!n&&sources.length&&d.editor?.kind==='insight'&&JSON.stringify([...d.editor.sources].sort())===JSON.stringify([...sources].sort())){title=d.title;body=d.body;toast('已恢复这组灵感的草稿');}else if(d&&n&&!demo){title=d.title;body=d.body;editor.color=d.color||editor.color;toast('已恢复这条灵感的编辑草稿');}}catch{}
 editor.color=editor.kind==='insight'?'gold':COLORS.some(c=>c.id===editor.color)?editor.color:'blue';
 $('#editorTitle').textContent=editor.id?'编辑灵感':editor.kind==='insight'?'灵感迸发':'创建灵感';
 $('#editorEyebrow').textContent=editor.kind==='insight'?'LET YOUR THOUGHTS MEET':'CAPTURE A LITTLE LIGHT';
 $('#noteTitle').value=title;$('#noteBody').value=body;$('#noteBody').placeholder=editor.kind==='insight'?'这些灵感放在一起，让你想到了什么？\n也可以先留空，让它慢慢酝酿。':'此刻，什么在你脑海里闪了一下？';
 $('#sourcePreview').hidden=editor.sources.length===0;
 $('#sourcePreview').innerHTML='<p>'+editor.sources.length+' 条来源灵感'+(demo?' · 保存时会将所选示例一起加入你的记录':'')+'</p>'+editor.sources.map(id=>find(id)||samples.find(s=>s.id===id)).filter(Boolean).map(s=>'<span class="source-chip">'+dot(colorOf(s))+esc(displayName(s))+'</span>').join('');
 $('#draftStatus').textContent='随手写下，不必完整。';$('#saveButton').disabled=false;palette();$('#editorDialog').showModal();setTimeout(()=>$('#noteBody').focus(),100);
}
function scheduleDraft(){clearTimeout(draftTimer);$('#draftStatus').textContent='正在保留草稿…';draftTimer=setTimeout(saveDraft,450);}
function saveDraft(){if(!editor)return Promise.resolve();const key=draftKey(editor),draft={editor:{...editor},title:$('#noteTitle').value,body:$('#noteBody').value,color:editor.color};const task=draftWrites.then(()=>put(key,draft));draftWrites=task.catch(()=>{});return task.then(()=>{$('#draftStatus').textContent='草稿已保存在此浏览器';return true;}).catch(e=>{$('#draftStatus').textContent='草稿未能保存，请保留当前页面';storageError(e);return false;});}
async function closeEditor(){clearTimeout(draftTimer);if(await saveDraft())$('#editorDialog').close();}
async function saveEditor(e){
 e.preventDefault();if(!editor)return;const body=$('#noteBody').value,title=$('#noteTitle').value.trim();if(editor.kind==='idea'&&!body.trim()){$('#noteBody').focus();toast('先写下一点内容吧');return;}
 $('#saveButton').disabled=true;clearTimeout(draftTimer);await draftWrites;const current={...editor},key=draftKey(current);
 try{
  await mutate(next=>{let sourceIds=current.id?[...(next.notes.find(n=>n.id===current.id)?.sources||[])]:[...current.sources];
   if(!current.id&&current.kind==='insight'&&sourceIds.length<2)throw Error('请至少选择两条来源灵感');
   const replacements=new Map();
   for(const id of sourceIds){if(next.notes.some(n=>n.id===id))continue;const sample=samples.find(n=>n.id===id);if(!sample||sample.kind!=='idea')throw Error('来源灵感已不可用，请重新选择');const newId=crypto.randomUUID();next.notes.push({...sample,id:newId,createdAt:Date.now(),updatedAt:Date.now()});replacements.set(id,newId);}
   sourceIds=sourceIds.map(id=>replacements.get(id)||id);
   if(current.id){const n=next.notes.find(n=>n.id===current.id);if(!n)throw Error('没有找到这条灵感');Object.assign(n,{title,body,color:current.color,updatedAt:Date.now()});}
   else{const pos=nextPosition(next.notes);next.notes.push({id:crypto.randomUUID(),title,body,color:current.color,active:true,kind:current.kind,sources:sourceIds,x:pos.x,y:pos.y,z:depthFor(crypto.randomUUID()),createdAt:Date.now(),updatedAt:Date.now()});}
   next.settings.showDemo=false;
  });
  await put(key,null).catch(()=>{});demo=false;if(current.kind==='insight')selected.clear();query='';$('#searchInput').value='';filter='all';colorFilter='';$('#editorDialog').close();editor=null;render();sound.play(current.kind==='insight'?'burst':'save');toast(current.kind==='insight'?'新的灵感已迸发，来源灵感仍保留':'灵感已保存在此浏览器');
 }catch(e){toast('保存失败，输入仍在，请重试。');}finally{$('#saveButton').disabled=false;}
}
async function toggleNote(){sound.play('toggle');const n=find(detailId);if(!n)return;if(demo){samples.find(item=>item.id===n.id).active=!n.active;toast('已切换示例状态');}else{try{await mutate(s=>{const item=s.notes.find(a=>a.id===n.id);item.active=!item.active;item.updatedAt=Date.now();});}catch{return;}}render();openDetail(detailId);}
function openSettings(){$('#backupInfo').textContent=state.settings.lastBackup?'上次导出：'+fullDate(state.settings.lastBackup):'尚未导出备份';renderMotion();$('#offlineStatus').textContent=offlineReady?'离线资源已就绪，可以断网继续记录。':'离线资源正在准备；首次使用请保持联网。';$('#settingsDialog').showModal();}
async function exportBackup(){const backup={format:'stardust-backup',version:1,exportedAt:new Date().toISOString(),notes:state.notes,settings:{motion:state.settings.motion}};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='星尘备份-'+new Date().toLocaleDateString('sv-SE')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);try{await mutate(s=>{s.settings.lastBackup=Date.now();});$('#backupInfo').textContent='上次导出：'+fullDate(state.settings.lastBackup);}catch{}toast('已生成备份，请妥善保存文件');}
async function importBackup(file){if(!file)return;try{if(file.size>25*1024*1024)throw Error('文件超过 25 MB，请分批迁移或联系开发者处理。');const imported=validateBackup(JSON.parse(await file.text()));let result;await mutate(s=>{result=mergeNotes(s.notes,imported);validateBackup({format:'stardust-backup',version:1,notes:result.notes});s.notes=result.notes;s.settings.showDemo=false;});demo=false;selected.clear();render();toast('已导入 '+result.added+' 条，跳过 '+result.skipped+' 条重复记录');}catch(e){toast(e instanceof SyntaxError?'文件不是有效的 JSON 备份，尚未导入。':e.message);}finally{$('#importFile').value='';}}
function resetFilters(){filter='all';colorFilter='';query='';$('#searchInput').value='';}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.view){setView(b.dataset.view);return;}
 if(b.dataset.note){if(performance.now()<suppressClickUntil)return;openDetail(b.dataset.note);return;}
 if(b.dataset.filter){filter=b.dataset.filter;render();return;}
 if(b.dataset.colorFilter){colorFilter=colorFilter===b.dataset.colorFilter?'':b.dataset.colorFilter;render();return;}
 if(b.dataset.editorColor&&editor){editor.color=b.dataset.editorColor;palette();scheduleDraft();return;}
 const act=b.dataset.act;
 if(act==='delete-note'){requestDelete(b.dataset.id);return;}
 if(act==='cancel-delete')$('#deleteDialog').close();
 if(act==='confirm-delete')await confirmDelete();
 if(act==='motion-system'){try{await mutate(s=>{s.settings.motion=null;});renderMotion();}catch{}}

 if(act==='audio')await cycleAudio();
 if(act==='retry-audio')void sound.retry();
 if(act==='remove-selection')removeSelection(b.dataset.id);
 if(act==='new')openEditor();
 if(act==='search'){$('#searchBox').hidden=false;$('#searchInput').focus();}
 if(act==='close-search'){query='';$('#searchInput').value='';$('#searchBox').hidden=true;render();}
 if(act==='settings')openSettings();
 if(act==='close-settings')$('#settingsDialog').close();
 if(act==='close-detail')$('#detailDialog').close();
 if(act==='close-editor')await closeEditor();
 if(act==='edit')openEditor(find(detailId));
 if(act==='toggle')await toggleNote();
 if(act==='select'){sound.play('select');if(selected.has(detailId))selected.delete(detailId);else selected.add(detailId);$('#detailDialog').close();render();toast(selected.size===1?'已选 1 条，再选一条就能组合':selected.size?'已选 '+selected.size+' 条灵感':'已取消选择');}
 if(act==='clear-selection'){selected.clear();render();}
 if(act==='combine'&&selected.size>=2)openEditor(null,[...selected]);
 if(act==='export')await exportBackup();
 if(act==='import')$('#importFile').click();
 if(act==='install'){if(installEvent){await installEvent.prompt();await installEvent.userChoice;installEvent=null;}else toast('请使用下方对应系统的添加指引');}
 if(act==='leave-demo'){try{await mutate(s=>{s.settings.showDemo=false;});demo=false;selected.clear();resetFilters();render();if(!state.notes.length)openEditor();}catch{}}
 if(act==='show-demo'){$('#settingsDialog').close();demo=true;selected.clear();resetFilters();render();toast('正在浏览示例，你的记录仍保留在本地');}
 if(act==='zoom-in')universe.setZoom(universe.camera.zoom*1.2);
 if(act==='zoom-out')universe.setZoom(universe.camera.zoom/1.2);
 if(act==='reset-view')universe.reset();
});
$('#editorForm').addEventListener('submit',saveEditor);
$('#noteTitle').addEventListener('input',scheduleDraft);$('#noteBody').addEventListener('input',scheduleDraft);
$('#editorDialog').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('#searchInput').addEventListener('input',e=>{query=e.target.value.trim();render();});
$('#sortOrder').addEventListener('change',()=>renderRecords(visible()));
$('#importFile').addEventListener('change',e=>importBackup(e.target.files[0]));
$('#motionToggle').addEventListener('change',async e=>{try{await mutate(s=>{s.settings.motion=e.target.checked;});render();}catch{renderMotion();}});
document.addEventListener('keydown',e=>{if($$('dialog[open]').length)return;if(e.target.matches('input,textarea,select'))return;if(e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();openEditor();}if(e.key==='/'||((e.ctrlKey||e.metaKey)&&e.key==='k')){e.preventDefault();$('#searchBox').hidden=false;$('#searchInput').focus();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&$('#editorDialog').open){clearTimeout(draftTimer);saveDraft();}});
window.addEventListener('beforeunload',e=>{if($('#editorDialog').open&&$('#draftStatus').textContent!=='草稿已保存在此浏览器'&&$('#noteBody').value){e.preventDefault();e.returnValue='';}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
window.addEventListener('appinstalled',()=>{installEvent=null;toast('已添加到桌面');});
universe=new Universe({stage:$('#spaceStage'),records:$('#recordsList'),getNote:find,root:$('main'),canvas:$('#connections'),tray:$('#selectionTray'),isActive:()=>view==='space',onSuppress:()=>{suppressClickUntil=performance.now()+450;},onOpen:openDetail,onDrag:(active,fromTray=false)=>{dragging=active;dragFromTray=fromTray;renderSelection();},onDrop:id=>{selected.add(id);sound.play('select');render();},onRemove:removeSelection});
sound.onChange=updateAudioUI;
const unlockSound=e=>{if(audioActivationEvent(e)&&!e.target.closest('[data-act="audio"],[data-act="retry-audio"]'))void sound.unlock();};
for(const event of ['pointerdown','pointerup','touchend','click','keydown'])document.addEventListener(event,unlockSound,{passive:true,capture:true});
async function installOffline(){if(!('serviceWorker'in navigator)){$('#offlineStatus').textContent='当前浏览器不支持离线缓存，请保持联网。';return;}try{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;offlineReady=true;$('#offlineStatus').textContent='离线资源已就绪，可以断网继续记录。';}catch(e){$('#offlineStatus').textContent='离线资源尚未准备成功，请联网后重新打开。';console.warn('Offline resources not ready',e);}}
async function tryPortrait(){if(matchMedia('(display-mode:standalone)').matches&&screen.orientation?.lock){try{await screen.orientation.lock('portrait');}catch{}}}
function updateOrientation(){const type=screen.orientation?.type;const landscape=type?type.startsWith('landscape'):typeof window.orientation==='number'?Math.abs(window.orientation)===90:screen.width>screen.height;document.body.classList.toggle('phone-landscape',matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<700&&landscape);}
window.addEventListener('orientationchange',updateOrientation);window.addEventListener('resize',updateOrientation);screen.orientation?.addEventListener('change',updateOrientation);
async function init(){
 try{db=await openDB();const saved=await get('state');if(saved){if(saved.version!==1||!Array.isArray(saved.notes))throw Error('本地数据格式无法读取');state=saved;state.settings={motion:null,showDemo:true,sound:'all',...saved.settings};await mutate(s=>{s.settings={motion:null,showDemo:true,sound:'all',...s.settings};});}}
 catch(e){storageError(e);}
 demo=state.notes.length===0&&state.settings.showDemo!==false;setView('space');installOffline();tryPortrait();updateOrientation();
}
init();
