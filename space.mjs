import {depthFor} from './model.mjs';
import {clamp,defaultCamera,pressIntent,twoFingerCamera,HOLD_MS,HOLD_SLOP,IDLE_MS} from './gestures.mjs';
export {clamp};
export function projectPoint(n,camera,width,height,time=0){
 const x=(n.x-.5)*2,y=(n.y-.5)*1.65+Math.sin(time*.15+depthFor(n.id)*9)*.012,z=n.z??depthFor(n.id);
 const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
 const rx=x*cy+z*sy,rz=z*cy-x*sy,ry=y*cp-rz*sp,depth=y*sp+rz*cp;
 const perspective=3.6/(3.6+depth),scale=perspective*camera.zoom;
 return {x:width*(.5+(camera.panX||0))+rx*width*.45*scale,y:height*(.47+(camera.panY||0))+ry*height*.51*scale,depth,scale:clamp(perspective,.74,1.25),opacity:clamp(1-depth*.2,.64,1)};
}
export class Universe {
 constructor({stage,records,root,canvas,tray,onDrag,onDrop,onRemove,onOpen,onSuppress,getNote,isActive}){
  Object.assign(this,{stage,records,root,canvas,tray,onDrag,onDrop,onRemove,onOpen,onSuppress,getNote,isActive});
  this.camera=defaultCamera();this.items=[];this.pointers=new Map();this.ctx=canvas.getContext('2d');this.motion=true;this.time=0;this.lastPaint=0;this.pauseUntil=0;this.hovered=null;this.spaceHeld=false;
  this.reduced=matchMedia('(prefers-reduced-motion:reduce)');
  this.resize=new ResizeObserver(()=>this.measure());this.resize.observe(stage);
  root.addEventListener('pointerdown',e=>this.down(e));
  root.addEventListener('pointermove',e=>this.move(e));
  root.addEventListener('pointerup',e=>this.up(e));
  root.addEventListener('pointercancel',e=>this.up(e,true));
  root.addEventListener('lostpointercapture',e=>{if(e.target===root&&this.pointers.has(e.pointerId))this.up(e,true);});
  // Records keep native scrolling until the long press has actually armed.
  records.addEventListener('touchmove',e=>{if(this.gesture?.ready||this.gesture?.drag||this.gesture?.swipe)e.preventDefault();},{passive:false});
  root.addEventListener('contextmenu',e=>{if(e.target.closest('.star-node,.record-row,.selected-chip'))e.preventDefault();});
  stage.addEventListener('pointerover',e=>{const n=e.target.closest('[data-note]');if(n)this.hovered=n.dataset.note;});
  stage.addEventListener('pointerout',e=>{if(!e.relatedTarget?.closest?.('[data-note]'))this.hovered=null;});
  stage.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.camera.zoom*Math.exp(-e.deltaY*.001));},{passive:false});
  document.addEventListener('pointerdown',()=>this.pause(),{passive:true});
  window.addEventListener('pointerup',e=>{if(this.pointers.has(e.pointerId))this.up(e);this.pause();},{passive:true});
  window.addEventListener('pointercancel',e=>{if(this.pointers.has(e.pointerId))this.up(e,true);},{passive:true});
  document.addEventListener('touchend',e=>{if(e.touches.length===0){if(this.pointers.size)this.cancel();this.pause();}},{passive:true});
  window.addEventListener('pageshow',()=>{this.cancel();this.lastPaint=0;});
  document.addEventListener('keydown',e=>{
   this.pause();if(e.key==='Escape')this.cancel();
   if(e.code==='Space'&&!e.target.closest('input,textarea,select,[contenteditable=true],dialog')&&this.isActive()){e.preventDefault();this.spaceHeld=true;document.body.classList.add('space-pan');}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){this.spaceHeld=false;document.body.classList.remove('space-pan');}});
  window.addEventListener('blur',()=>{this.cancel();this.spaceHeld=false;document.body.classList.remove('space-pan');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();this.lastPaint=0;this.pause();});
  this.frame=t=>{requestAnimationFrame(this.frame);
   if(document.hidden||!this.isActive()){this.lastPaint=0;return;}
   if(t-this.lastPaint<30)return;const dt=this.lastPaint?Math.min((t-this.lastPaint)/1000,.08):0;this.lastPaint=t;
   if(this.resetTween){const r=this.resetTween,u=clamp((t-r.start)/550,0,1),ease=1-(1-u)**3;for(const k of Object.keys(r.to))this.camera[k]=r.from[k]+(r.to[k]-r.from[k])*ease;if(u===1)this.resetTween=null;this.updateZoom();}
   const moving=this.motion&&!this.pointers.size&&!this.resetTween&&t>this.pauseUntil&&!document.querySelector('dialog[open]')&&!(document.activeElement?.matches('input,textarea')&&document.activeElement.getClientRects().length);
   if(moving){const ease=clamp((t-this.pauseUntil)/800,0,1);this.time+=dt;this.camera.yaw+=dt*.024*ease;}
   this.paint();
  };requestAnimationFrame(this.frame);
 }
 pause(){this.pauseUntil=performance.now()+IDLE_MS;}
 measure(){this.width=this.stage.clientWidth;this.height=this.stage.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.ctx?.setTransform(dpr,0,0,dpr,0,0);this.paint();}
 setItems(items){this.items=items.map(n=>({n,el:document.getElementById('star-'+n.id)}));this.hovered=null;this.paint();}
 updateZoom(){document.querySelector('.zoom-value').textContent=Math.round(this.camera.zoom*100)+'%';}
 setZoom(z){this.resetTween=null;this.camera.zoom=clamp(z,.65,2.5);this.updateZoom();this.pause();this.paint();}
 reset(){this.cancel();this.camera.yaw=((this.camera.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;this.resetTween={from:{...this.camera},to:defaultCamera(),start:performance.now()};this.time=0;if(!this.motion){this.camera=defaultCamera();this.resetTween=null;this.updateZoom();this.paint();}this.pause();}
 paint(){
  const {width:w,height:h,ctx}=this;if(!w||!h||!ctx)return;ctx.clearRect(0,0,w,h);
  for(let i=0;i<43;i++){const n={id:'dust'+i,x:(i*.6180339)%1,y:(i*.4142135)%1,z:depthFor('dust'+i)};const p=projectPoint(n,{...this.camera,zoom:1+(this.camera.zoom-1)*.2,yaw:this.camera.yaw*.35},w,h,this.time*.5);ctx.fillStyle=`rgba(183,196,213,${.10+(i%4)*.045})`;ctx.beginPath();ctx.arc(p.x,p.y,i%7===0?.8:.5,0,Math.PI*2);ctx.fill();}
  const positions=new Map();
  for(const {n,el} of this.items){if(!el)continue;const p=projectPoint(n,this.camera,w,h,this.time);positions.set(n.id,p);el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.setProperty('--depth-scale',p.scale);el.style.opacity=p.opacity;el.style.zIndex=Math.round((2-p.depth)*100);}
  for(const {n} of this.items){if(n.kind!=='insight')continue;const end=positions.get(n.id);if(!end)continue;for(const id of n.sources){const start=positions.get(id);if(!start)continue;const active=this.hovered===n.id||this.hovered===id;const yoff=Math.min(35,Math.abs(end.x-start.x)*.08);const cp={x:(start.x+end.x)/2,y:(start.y+end.y)/2+yoff};const gradient=ctx.createLinearGradient(start.x,start.y,end.x,end.y);gradient.addColorStop(0,'rgba(177,193,209,.13)');gradient.addColorStop(.35,'rgba(185,197,207,.46)');gradient.addColorStop(1,'rgba(218,201,168,.5)');ctx.strokeStyle=gradient;ctx.lineWidth=active?1.05:.75;ctx.globalAlpha=n.active?1:.35;ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(cp.x,cp.y,end.x,end.y);ctx.stroke();
    const phase=(this.time*.037+(depthFor(id)+.4))%1;const x=(1-phase)**2*start.x+2*(1-phase)*phase*cp.x+phase**2*end.x,y=(1-phase)**2*start.y+2*(1-phase)*phase*cp.y+phase**2*end.y;
    ctx.fillStyle='rgba(232,223,202,.65)';ctx.shadowColor='#dac9a8';ctx.shadowBlur=5;ctx.beginPath();ctx.arc(x,y,.9,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
  }}
 }
 down(e){
  if(e.button!==0||document.querySelector('dialog[open]'))return;
  const chip=e.target.closest('[data-selected-id]'),node=e.target.closest('.star-node,.record-row'),fromRecord=!!node?.matches('.record-row');
  if(!this.stage.contains(e.target)&&!chip&&!fromRecord)return;
  if(e.target.closest('[data-act="remove-selection"]'))return;
  if(this.pointers.size>=2)return;
  this.closeSwipes(node?.closest('.record-item'));
  this.resetTween=null;this.pause();this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(this.pointers.size===2){
   const previous=this.gesture;this.finishDrag();this.clearHold();
   if(fromRecord||previous?.fromRecord){this.cancel();this.onSuppress();return;}
   for(const id of this.pointers.keys())this.capture(id);
   const [a,b]=[...this.pointers.values()];this.gesture={multi:true,distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2,camera:{...this.camera},moved:true};this.onSuppress();return;
  }
  if(this.pointers.size>2)return;
  const id=chip?.dataset.selectedId||node?.dataset.note,n=this.getNote(id),pan=this.spaceHeld&&!fromRecord&&!chip,touch=e.pointerType==='touch';
  const g=this.gesture={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,camera:{...this.camera},n:pan?null:n,fromTray:!!chip,fromRecord,node:chip||node,drag:false,moved:false,ready:false,touch,pan,wasOpen:!!node?.closest('.record-item')?.classList.contains('swipe-open'),start:performance.now()};
  if(!fromRecord||!touch)this.capture(e.pointerId);
  const intent=pressIntent({held:false,moved:false,elapsed:0,touch,record:fromRecord,draggable:g.n?.kind==='idea'});
  if(intent==='drag')g.ready=true;
  else if(intent==='pending')this.holdTimer=setTimeout(()=>{
   if(this.gesture!==g||g.moved||this.pointers.size!==1)return;
   g.ready=true;g.node.classList.add('drag-armed');this.capture(e.pointerId);this.pause();
  },HOLD_MS);
 }
 capture(id){try{this.root.setPointerCapture(id);}catch{}}
 clearHold(){clearTimeout(this.holdTimer);this.holdTimer=null;this.gesture?.node?.classList.remove('drag-armed');}
 move(e){
  if(!this.pointers.has(e.pointerId))return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=this.gesture;if(!g)return;
  if(this.pointers.size>=2&&g.multi){const[a,b]=[...this.pointers.values()];this.camera=twoFingerCamera(g,a,b,this.width,this.height);this.updateZoom();this.pause();this.paint();this.onSuppress();e.preventDefault();return;}
  if(this.pointers.size!==1||g.id!==e.pointerId)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;g.lastX=e.clientX;g.lastY=e.clientY;
  if(g.fromRecord&&g.touch&&!g.ready&&!g.navigation&&matchMedia('(max-width:700px)').matches&&(g.swipe||(Math.abs(dx)>=HOLD_SLOP&&Math.abs(dx)>Math.abs(dy)*1.4&&(dx<0||g.wasOpen)))){
   this.clearHold();g.swipe=true;g.moved=true;g.shift=clamp((g.wasOpen?-80:0)+dx,-88,0);this.capture(e.pointerId);g.node.closest('.record-item')?.classList.add('swiping');g.node.style.setProperty('--swipe-x',g.shift+'px');this.onSuppress();e.preventDefault();return;
  }
  if(!g.moved&&Math.hypot(dx,dy)<(g.touch?HOLD_SLOP:5))return;
  if(!g.moved&&!g.ready){this.clearHold();g.navigation=true;}
  g.moved=true;this.pause();this.onSuppress();
  if(g.ready&&g.n?.kind==='idea'){
   e.preventDefault();if(!g.drag)this.startDrag(g);this.positionGhost(e.clientX,e.clientY);
  }else if(!g.fromRecord&&!g.fromTray){
   e.preventDefault();if(g.pan){this.camera.panX=clamp(g.camera.panX+dx/this.width,-1.5,1.5);this.camera.panY=clamp(g.camera.panY+dy/this.height,-1.5,1.5);}
   else{this.camera.yaw=g.camera.yaw+dx*.006;this.camera.pitch=clamp(g.camera.pitch+dy*.005,-1.2,1.2);}
   this.paint();
  }
 }
 startDrag(g){
  this.clearHold();this.closeSwipes();g.drag=true;this.capture(g.id);g.node.classList.add('dragging-source');document.body.classList.add('dragging-star');this.onDrag(true,g.fromTray);
  this.ghost=document.createElement('div');this.ghost.className='drag-ghost';this.ghost.setAttribute('aria-hidden','true');this.ghost.innerHTML=g.node.querySelector('.star-point')?.outerHTML||'';
  const label=document.createElement('span');label.textContent=g.n.title||g.node.querySelector('.star-label,.selected-name,h3')?.textContent||'灵感';this.ghost.append(label);document.body.append(this.ghost);
 }
 positionGhost(x,y){
  if(!this.ghost)return;const r=this.ghost.getBoundingClientRect(),left=clamp(x-r.width/2,8,innerWidth-r.width-8),top=Math.max(8,y-r.height-24);
  this.ghost.style.transform='translate('+left+'px,'+top+'px)';const rect=this.tray.getBoundingClientRect();this.over=x>=rect.left&&x<=rect.right&&y>=rect.top-22&&y<=rect.bottom+16;this.tray.classList.toggle('drop-ready',this.over);
 }
 up(e,cancelled=false){
  if(!this.pointers.has(e.pointerId))return;const g=this.gesture;this.clearHold();
  if(g?.swipe)this.setSwipe(g.node?.closest('.record-item'),!cancelled&&g.shift<=-40);
  else if(g?.wasOpen&&!g.moved)this.closeSwipes();
  if(g?.drag&&!cancelled){const r=(this.isActive()?this.stage:this.records).getBoundingClientRect();
   if(this.over&&!g.fromTray)this.onDrop(g.n.id);
   else if(g.fromTray&&!this.over&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)this.onRemove(g.n.id);
  }
  if(!cancelled&&g?.n&&!g.moved&&!g.fromTray&&!g.wasOpen&&(!g.touch&&!g.fromRecord||!g.ready)){this.onSuppress();this.onOpen(g.n.id);}
  if(g?.moved||g?.ready||g?.multi||g?.wasOpen||cancelled)this.onSuppress();
  this.finishDrag();this.pointers.delete(e.pointerId);if(this.root.hasPointerCapture(e.pointerId))this.root.releasePointerCapture(e.pointerId);this.pause();
  if(this.pointers.size===1){const [id,p]=[...this.pointers.entries()][0];this.gesture={id,x:p.x,y:p.y,camera:{...this.camera},moved:true,fromRecord:g?.fromRecord};}
  else this.gesture=null;
 }
 finishDrag(){this.clearHold();if(this.ghost){this.ghost.remove();this.ghost=null;}this.gesture?.node?.classList.remove('dragging-source');this.tray.classList.remove('drop-ready');document.body.classList.remove('dragging-star');if(this.gesture?.drag)this.onDrag(false);this.over=false;}
 setSwipe(item,open){if(!item)return;item.classList.remove('swiping');item.classList.toggle('swipe-open',open);item.querySelector('.record-row').style.removeProperty('--swipe-x');const button=item.querySelector('.swipe-delete');button.disabled=!open;button.tabIndex=open?0:-1;button.setAttribute('aria-hidden',String(!open));}
 closeSwipes(except=null){for(const item of this.records.querySelectorAll?.('.record-item')||[])if(item!==except)this.setSwipe(item,false);}
 cancel(){this.closeSwipes();this.finishDrag();const ids=[...this.pointers.keys()];this.pointers.clear();this.gesture=null;for(const id of ids)if(this.root.hasPointerCapture(id))this.root.releasePointerCapture(id);this.pause();}
}
