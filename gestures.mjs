export const HOLD_MS=450;
export const HOLD_SLOP=9;
export const IDLE_MS=3000;
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const defaultCamera=()=>({yaw:0,pitch:0,zoom:1,panX:0,panY:0});
// Once a press becomes a scroll/rotation, waiting longer cannot turn it into a drag.
export function pressIntent({held,moved,elapsed,touch,record=false,draggable=true}){
 if(!draggable)return 'navigate';
 if(held)return 'drag';
 if(moved)return 'navigate';
 return (!touch&&!record)||elapsed>=HOLD_MS?'drag':'pending';
}
export function twoFingerCamera(start,a,b,width,height){
 const distance=Math.hypot(a.x-b.x,a.y-b.y);
 return {...start.camera,zoom:clamp(start.camera.zoom*distance/Math.max(1,start.distance),.65,2.5),
  panX:clamp(start.camera.panX+((a.x+b.x)/2-start.x)/width,-1.5,1.5),
  panY:clamp(start.camera.panY+((a.y+b.y)/2-start.y)/height,-1.5,1.5)};
}
