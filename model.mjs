export const COLORS=[{id:'blue',name:'一念',hex:'#9ebee5',hint:'留住突然亮起的一个想法。'},{id:'sage',name:'思考',hex:'#a6cdb8',hint:'记下值得继续追问的问题。'},{id:'rose',name:'感受',hex:'#dfadc2',hint:'看清此刻内心的真实感受。'},{id:'violet',name:'想象',hex:'#c4b0e6',hint:'收藏暂时没有边界的画面。'}];
export const GOLD={id:'gold',name:'灵感奇点',hex:'#dac9a8',hint:'让彼此相遇的灵感，迸发新的发现。'};
export function depthFor(id){let h=2166136261;for(const c of id){h=Math.imul(h^c.codePointAt(0),16777619);}return ((h>>>0)%1000/999-.5)*.8;}
export function normalizeNote(n){return {...n,color:n.kind==='insight'?'gold':n.color==='gold'?'blue':n.color,z:Number.isFinite(n.z)?n.z:depthFor(n.id)};}
export function colorOf(n){return n.kind==='insight'?GOLD:COLORS.find(c=>c.id===n.color)||COLORS[0];}
export function resolveMotion(preference,systemReduced=false){return typeof preference==='boolean'?preference:!systemReduced;}
export function deleteNote(notes,id,now=Date.now()){
 if(!notes.some(n=>n.id===id))throw Error('这条灵感已经不存在。');
 return notes.filter(n=>n.id!==id).map(n=>n.sources.includes(id)?{...n,sources:n.sources.filter(source=>source!==id),updatedAt:now}:n);
}
export function displayName(n){return n.title.trim()||Array.from(n.body.replace(/\s+/g,' ').trim()).slice(0,10).join('')||'等待酝酿的灵感';}
export function validateBackup(raw){
 if(!raw||raw.format!=='stardust-backup'||raw.version!==1||!Array.isArray(raw.notes))throw Error('这不是有效的星尘备份文件。');
 const ids=new Set();
 for(const n of raw.notes){
  if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id)||typeof n.title!=='string'||typeof n.body!=='string'||!(n.color==='gold'||COLORS.some(c=>c.id===n.color))||typeof n.active!=='boolean'||!['idea','insight'].includes(n.kind)||!Array.isArray(n.sources)||!n.sources.every(s=>typeof s==='string')||new Set(n.sources).size!==n.sources.length||!Number.isFinite(n.createdAt)||!Number.isFinite(n.updatedAt)||!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<0||n.x>1||n.y<0||n.y>1||(n.z!==undefined&&(!Number.isFinite(n.z)||Math.abs(n.z)>1)))throw Error('备份内容不完整或格式有误，尚未导入任何数据。');
  if(n.kind==='idea'&&(!n.body.trim()||n.sources.length))throw Error('普通灵感的数据不完整。');
  // Creation requires two sources; a surviving singularity may have fewer after deletion.
  ids.add(n.id);
 }
 const byId=new Map(raw.notes.map(n=>[n.id,n]));
 for(const n of raw.notes)if(n.sources.some(s=>!byId.has(s)||s===n.id||byId.get(s).kind!=='idea'))throw Error('备份的来源关联不完整，尚未导入。');
 return raw.notes.map(n=>normalizeNote({id:n.id,title:n.title,body:n.body,color:n.color,active:n.active,kind:n.kind,sources:[...n.sources],createdAt:n.createdAt,updatedAt:n.updatedAt,x:n.x,y:n.y,z:n.z}));
}
export function mergeNotes(existing,incoming){const ids=new Set(existing.map(n=>n.id));const added=incoming.filter(n=>!ids.has(n.id));return {notes:[...existing,...added],added:added.length,skipped:incoming.length-added.length};}
export function nextPosition(notes){const points=Array.from({length:80},(_,i)=>({x:.12+((i*.61803398875)%1)*.76,y:.14+((i*.41421356237)%1)*.70}));return points.reduce((best,p)=>{const score=notes.length?Math.min(...notes.map(n=>(n.x-p.x)**2+(n.y-p.y)**2)):1;return score>best.score?{...p,score}:best},{x:.5,y:.45,score:-1});}
