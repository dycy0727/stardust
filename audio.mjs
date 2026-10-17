export const SOUND_MODES=['all','effects','muted'];
// Tail meets head inside the buffer, so looping never depends on a JS timer.
export function crossfadeLoop(channels,rate,seconds=4){
 const length=channels[0].length,overlap=Math.min(Math.round(seconds*rate),Math.floor(length/4));
 return channels.map(input=>{
  const out=new Float32Array(length-overlap);out.set(input.subarray(overlap,length-overlap));
  for(let i=0;i<overlap;i++){const t=i/Math.max(1,overlap-1);out[length-2*overlap+i]=input[length-overlap+i]*Math.cos(t*Math.PI/2)+input[i]*Math.sin(t*Math.PI/2);}
  return out;
 });
}
export function audioActivationEvent(e){return !!e.isTrusted&&(e.type==='click'||e.type==='touchend'||e.type==='keydown'&&e.key!=='Escape'||e.type==='pointerup'&&e.pointerType!=='mouse'||e.type==='pointerdown'&&e.pointerType==='mouse');}
export class SpaceAudio {
 constructor(){this.mode='all';this.context=null;this.activated=false;this.ducked=false;this.lastEffect=0;this.error='';
  document.addEventListener('visibilitychange',()=>this.visibility());
  window.addEventListener('pageshow',()=>{if(this.activated&&this.mode!=='muted')void this.unlock();});
  document.addEventListener('focusin',e=>{this.ducked=e.target.matches('input,textarea');this.levels();});
  document.addEventListener('focusout',()=>{this.ducked=false;this.levels();});
 }
 get ready(){return !!this.context&&this.context.state==='running'&&this.activated;}
 get status(){if(this.mode==='muted')return '已全部静音';if(this.error==='unsupported')return '当前浏览器暂不支持声音';if(!this.ready)return '声音尚未启动，点按「启用声音」';if(this.error==='music')return '背景音乐加载失败，点按「重试音乐」';if(this.mode==='all'&&!this.musicSource)return '正在准备背景音乐…';return this.mode==='all'?'背景音乐与音效已就绪':'仅音效开启';}
 notify(){this.onChange?.();}
 setMode(mode){const next=SOUND_MODES.includes(mode)?mode:'all';const changed=next!==this.mode;this.mode=next;this.levels();if(next==='all'&&this.ready)void this.loadMusic();if(changed)this.notify();}
 visibility(){clearTimeout(this.suspendTimer);if(!this.context)return;
  if(document.hidden){this.music.gain.setTargetAtTime(0,this.context.currentTime,.12);this.effects.gain.setTargetAtTime(0,this.context.currentTime,.08);this.suspendTimer=setTimeout(()=>{if(document.hidden)void this.context?.suspend().catch(()=>{});},500);}
  else if(this.activated&&this.mode!=='muted')void this.unlock();
 }
 unlock(){
  if(this.mode==='muted'||document.hidden)return Promise.resolve(false);
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){this.error='unsupported';this.notify();return Promise.resolve(false);}
  try{
   // iOS otherwise treats Web Audio as ambient sound, including the silent switch.
   try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
   if(!this.context||this.context.state==='closed'){
    const c=this.context=new Audio();this.primed=false;this.musicSource=null;this.music=c.createGain();this.effects=c.createGain();this.music.gain.value=0;this.effects.gain.value=0;this.music.connect(c.destination);this.effects.connect(c.destination);
    c.addEventListener('statechange',()=>{if(c!==this.context)return;if(c.state==='running'){this.activated=true;this.levels();if(this.mode==='all')void this.loadMusic();this.flushEffect();}this.notify();});
   }
   const c=this.context;
   // Both calls are made synchronously inside the trusted click / finger-up handler.
   const resuming=c.resume();
   if(!this.primed){const prime=c.createBufferSource();prime.buffer=c.createBuffer(1,1,c.sampleRate);prime.connect(c.destination);prime.start(0);prime.onended=()=>prime.disconnect();this.primed=true;}
   if(c.state==='running'){this.activated=true;this.levels();if(this.mode==='all')void this.loadMusic();this.flushEffect();}
   this.notify();
   return Promise.resolve(resuming).then(()=>{this.activated=c.state==='running';this.levels();if(this.activated&&this.mode==='all')void this.loadMusic();this.flushEffect();this.notify();return this.activated;}).catch(()=>{this.notify();return false;});
  }catch{this.notify();return Promise.resolve(false);}
 }
 retry(){this.retryAfter=0;this.error='';return this.unlock();}
 async loadMusic(){
  if(this.musicSource||this.loadingMusic||!this.context||performance.now()<(this.retryAfter||0))return;
  this.loadingMusic=true;
  try{const response=await fetch(new URL('./audio/stardust-ambient.mp3',import.meta.url));if(!response.ok)throw Error('music unavailable');
   const c=this.context,decoded=await c.decodeAudioData(await response.arrayBuffer());
   const data=crossfadeLoop(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
   const loop=c.createBuffer(data.length,data[0].length,decoded.sampleRate);data.forEach((channel,i)=>loop.copyToChannel(channel,i));
   const source=this.musicSource=c.createBufferSource();source.buffer=loop;source.loop=true;source.connect(this.music);source.start();this.error='';this.levels();
  }catch{this.error='music';this.retryAfter=performance.now()+15000;}finally{this.loadingMusic=false;this.notify();}
 }
 levels(){const c=this.context;if(!c)return;const quiet=document.hidden||this.mode==='muted';const music=!quiet&&this.mode==='all'?(this.ducked?.010:.024):0,effects=quiet?0:.054;
  for(const [gain,target,fade]of [[this.music.gain,music,.9],[this.effects.gain,effects,.08]]){gain.cancelScheduledValues(c.currentTime);if(target===0)gain.setValueAtTime(0,c.currentTime);else gain.setTargetAtTime(target,c.currentTime,fade);}
 }
 flushEffect(){const pending=this.pendingEffect;this.pendingEffect=null;if(pending&&performance.now()-pending.time<800)this.play(pending.kind);}
 tone(hz,target,volume,duration,delay=0){const c=this.context;if(!c||c.state!=='running')return;const osc=c.createOscillator(),gain=c.createGain(),start=c.currentTime+delay;osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+Math.min(.12,duration*.2));gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain);gain.connect(target);osc.start(start);osc.stop(start+duration+.05);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
 play(kind='open'){if(this.mode==='muted'||document.hidden)return;if(!this.ready){this.pendingEffect={kind,time:performance.now()};return;}const now=performance.now();if(now-this.lastEffect<100)return;this.lastEffect=now;const pitches={open:523.25,select:659.25,remove:440,save:783.99,burst:523.25,toggle:392};this.tone(pitches[kind]||523.25,this.effects,.2,1.25);if(kind==='burst'){this.tone(659.25,this.effects,.12,2,.16);this.tone(783.99,this.effects,.09,2.5,.32);}}
}
