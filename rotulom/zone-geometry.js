(root=>{
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function move(z,dx,dy,width,height){return{x:clamp(z.x+dx,0,width-z.w),y:clamp(z.y+dy,0,height-z.h),w:z.w,h:z.h};}
  function handles(z){const x=z.x,y=z.y,r=x+z.w,b=y+z.h,c=x+z.w/2,m=y+z.h/2;return{nw:{x,y},n:{x:c,y},ne:{x:r,y},e:{x:r,y:m},se:{x:r,y:b},s:{x:c,y:b},sw:{x,y:b},w:{x,y:m}};}
  function resize(z,handle,p,width,height){let l=z.x,r=z.x+z.w,t=z.y,b=z.y+z.h;if(handle.includes('w'))l=clamp(p.x,0,width);if(handle.includes('e'))r=clamp(p.x,0,width);if(handle.includes('n'))t=clamp(p.y,0,height);if(handle.includes('s'))b=clamp(p.y,0,height);return{x:Math.min(l,r),y:Math.min(t,b),w:Math.abs(r-l),h:Math.abs(b-t)};}
  function hit(zones,p,selected,tolerance){const z=zones[selected];if(z)for(const [handle,q] of Object.entries(handles(z)))if(Math.abs(p.x-q.x)<=tolerance&&Math.abs(p.y-q.y)<=tolerance)return{index:selected,handle};for(let i=zones.length-1;i>=0;i--){const z=zones[i];if(p.x>=z.x&&p.x<=z.x+z.w&&p.y>=z.y&&p.y<=z.y+z.h)return{index:i,handle:null};}return null;}
  function pinch(start,current){const zoom=clamp(start.zoom*current.distance/Math.max(1,start.distance),100,400),scale=zoom/start.zoom;return{zoom,left:start.anchorX*start.width*scale-current.x,top:start.anchorY*start.height*scale-current.y};}
  const api={move,resize,handles,hit,pinch};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RotulomZones=api;
})(globalThis);
