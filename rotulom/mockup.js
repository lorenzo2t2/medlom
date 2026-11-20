/* Mockup: coloca un diseño (PDF, SVG o imagen) sobre la plantilla o la foto del vehículo, lo mueve, lo escala, lo gira y lo
   curva con una malla para que siga las formas de la carrocería. Se mezcla con las sombras de la foto y se guarda como imagen. */
(() => {
 const $=id=>document.getElementById(id);
 const S=window.rotulomSession;
 if(!S||!$('clearZones'))return;
 const COLS=8,ROWS=5,MAX_LAYERS=6;
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const state={base:null,outside:null,layers:[],sel:-1,curve:false,clip:true,guides:true,pointers:new Map(),drag:null,fit:1,busy:false};
 let ov,cv,g,raf=0;

 /* ---------- ventana del mockup ---------- */
 function build(){
  ov=document.createElement('div');ov.id='mockupOverlay';ov.className='mockup-overlay';ov.hidden=true;ov.tabIndex=-1;
  ov.innerHTML='<div class="mockup-bar"><button type="button" class="tool-button" id="mkClose">← Volver</button><b>Mockup con diseño</b><button type="button" class="button button-primary" id="mkSave">Guardar imagen</button></div>'+
   '<div class="mockup-stage" id="mkStage"><canvas id="mkCanvas" aria-label="Vehículo con el diseño colocado"></canvas><p id="mkHint" class="mockup-hint">Pulsa «＋ Añadir diseño» y elige un PDF, un SVG o una imagen.</p></div>'+
   '<div class="mockup-panel">'+
    '<div class="mockup-row"><label class="button button-secondary" for="mkFile">＋ Añadir diseño<input id="mkFile" type="file" accept="application/pdf,.pdf,image/svg+xml,.svg,image/png,image/jpeg,image/webp" hidden></label>'+
    '<select id="mkLayers" aria-label="Diseño seleccionado"></select><button type="button" class="tool-button" id="mkDel">Quitar</button></div>'+
    '<div class="mockup-sliders">'+
     '<label>Tamaño<input id="mkSize" type="range" min="3" max="200" step="0.5" value="40"><output id="mkSizeV"></output></label>'+
     '<label>Giro<input id="mkRot" type="range" min="-180" max="180" step="0.5" value="0"><output id="mkRotV"></output></label>'+
     '<label>Opacidad<input id="mkOp" type="range" min="10" max="100" step="1" value="100"><output id="mkOpV"></output></label>'+
     '<label>Sombras del vehículo<input id="mkReal" type="range" min="0" max="100" step="1" value="100"><output id="mkRealV"></output></label>'+
    '</div>'+
    '<div class="mockup-row mockup-toggles">'+
     '<button type="button" class="tool-button" id="mkCurve" aria-pressed="false">〰 Curvar para adaptar</button>'+
     '<button type="button" class="tool-button" id="mkFlat">Quitar curvas</button>'+
     '<button type="button" class="tool-button" id="mkClip" aria-pressed="true">✂ Recortar fuera del vehículo</button>'+
     '<button type="button" class="tool-button" id="mkWhite" aria-pressed="false">Quitar fondo blanco</button>'+
     '<button type="button" class="tool-button" id="mkGuides" aria-pressed="true">Guías</button>'+
    '</div>'+
    '<p class="mockup-help" id="mkHelp">Arrastra el diseño para moverlo. Con dos dedos lo agrandas y lo giras. Con «Curvar» arrastra los puntos para adaptarlo a la curva de la carrocería.</p>'+
   '</div>';
  document.body.append(ov);cv=$('mkCanvas');g=cv.getContext('2d');
  $('mkClose').onclick=close;$('mkSave').onclick=save;$('mkDel').onclick=removeLayer;
  $('mkFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(f)await addFile(f);};
  $('mkLayers').onchange=e=>{state.sel=Number(e.target.value);sync();draw();};
  const bind=(id,fn)=>$(id).addEventListener('input',()=>{const L=cur();if(!L)return;fn(L,Number($(id).value));sync(true);draw();});
  bind('mkSize',(L,v)=>{const w=state.base.w*v/100,r=w/L.w;L.off=L.off.map(o=>o*r);L.h*=r;L.w=w;});
  bind('mkRot',(L,v)=>{L.rot=v*Math.PI/180;});
  bind('mkOp',(L,v)=>{L.op=v/100;});
  bind('mkReal',(L,v)=>{L.real=v/100;});
  const toggle=(id,key,after)=>{$(id).onclick=()=>{state[key]=!state[key];$(id).setAttribute('aria-pressed',String(state[key]));after&&after();sync();draw();};};
  toggle('mkCurve','curve');toggle('mkClip','clip');toggle('mkGuides','guides');
  $('mkFlat').onclick=()=>{const L=cur();if(L){L.off.fill(0);draw();}};
  $('mkWhite').onclick=()=>{const L=cur();if(!L)return;L.noWhite=!L.noWhite;prepare(L);sync();draw();};
  cv.addEventListener('pointerdown',down);cv.addEventListener('pointermove',move);
  for(const t of ['pointerup','pointercancel','pointerleave'])cv.addEventListener(t,up);
  cv.style.touchAction='none';
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}if((e.key==='Delete'||e.key==='Backspace')&&!/INPUT|SELECT/.test(e.target.tagName)){removeLayer();}});
  window.addEventListener('resize',()=>{if(!ov.hidden)fitCanvas();});
  if(window.ResizeObserver)new ResizeObserver(()=>{if(!ov.hidden)fitCanvas();}).observe($('mkStage'));
 }
 const cur=()=>state.layers[state.sel]||null;

 /* ---------- base: foto o plantilla del editor ---------- */
 function floodOutside(img){
  /* En las plantillas el fondo es blanco puro: lo que se alcanza desde los bordes sin cruzar el vehículo queda fuera del recorte. */
  const w=img.width,h=img.height,data=img.getContext('2d').getImageData(0,0,w,h).data,mark=new Uint8Array(w*h),stack=[];
  const white=i=>data[i*4]>=252&&data[i*4+1]>=252&&data[i*4+2]>=252;
  const push=i=>{if(!mark[i]&&white(i)){mark[i]=1;stack.push(i);}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  while(stack.length){const i=stack.pop(),x=i%w;if(x>0)push(i-1);if(x<w-1)push(i+1);if(i>=w)push(i-w);if(i<w*(h-1))push(i+w);}
  const out=document.createElement('canvas');out.width=w;out.height=h;const o=out.getContext('2d'),px=o.createImageData(w,h);
  for(let i=0;i<w*h;i++)if(mark[i]){px.data[i*4+3]=255;}
  o.putImageData(px,0,0);
  /* un píxel de margen para que el borde del vehículo no quede con halo blanco */
  const soft=document.createElement('canvas');soft.width=w;soft.height=h;const s=soft.getContext('2d');s.filter='blur(0.6px)';s.drawImage(out,0,0);
  return soft;
 }

 /* ---------- diseños ---------- */
 function trim(c){
  const w=c.width,h=c.height,d=c.getContext('2d').getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>10){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(x1<0||(x0===0&&y0===0&&x1===w-1&&y1===h-1))return c;
  const o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,x0,y0,o.width,o.height,0,0,o.width,o.height);return o;
 }
 async function rasterPdf(file){
  const engine=await S.pdfEngine();
  const doc=await engine.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',wasmUrl:'./vendor/pdfjs/wasm/',isEvalSupported:false}).promise;
  const page=await doc.getPage(1),unit=page.getViewport({scale:1}),vp=page.getViewport({scale:Math.min(2600/unit.width,2600/unit.height,4)});
  const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
  await page.render({canvasContext:c.getContext('2d'),viewport:vp,background:'rgba(0,0,0,0)'}).promise;
  return{canvas:trim(c),pages:doc.numPages};
 }
 async function rasterSvg(file){
  let text=await file.text();
  if(text.length>12*1024*1024)throw Error('El SVG es demasiado grande');
  const root=/<svg\b[^>]*>/i.exec(text);if(!root)throw Error('El SVG no es válido');
  const tag=root[0],vb=/viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/i.exec(tag);
  let w=parseFloat((/\swidth\s*=\s*["']([\d.]+)/i.exec(tag)||[])[1]),h=parseFloat((/\sheight\s*=\s*["']([\d.]+)/i.exec(tag)||[])[1]);
  if(!(w>0&&h>0)){if(vb){w=parseFloat(vb[3]);h=parseFloat(vb[4]);}else{w=1000;h=1000;}}
  const k=Math.min(2600/w,2600/h),W=Math.max(1,Math.round(w*k)),H=Math.max(1,Math.round(h*k));
  const fixed=tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi,'').replace(/<svg\b/i,'<svg width="'+W+'" height="'+H+'"'+(vb?'':' viewBox="0 0 '+w+' '+h+'"'));
  text=text.replace(tag,fixed);
  const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));
  try{
   const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('No se pudo leer el SVG'));i.src=url;});
   const c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').drawImage(img,0,0,W,H);return{canvas:trim(c)};
  }finally{URL.revokeObjectURL(url);}
 }
 async function rasterImage(file){
  const bmp=await createImageBitmap(file),k=Math.min(1,3000/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(bmp.width*k));c.height=Math.max(1,Math.round(bmp.height*k));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close();return{canvas:c};
 }
 function prepare(L){
  if(!L.noWhite){L.view=L.src;return;}
  const c=document.createElement('canvas');c.width=L.src.width;c.height=L.src.height;const x=c.getContext('2d');x.drawImage(L.src,0,0);
  const im=x.getImageData(0,0,c.width,c.height),d=im.data;
  for(let i=0;i<d.length;i+=4){const m=Math.min(d[i],d[i+1],d[i+2]);if(m>=246)d[i+3]=0;else if(m>225)d[i+3]=Math.round(d[i+3]*(246-m)/21);}
  x.putImageData(im,0,0);L.view=c;
 }
 async function addFile(file){
  if(state.busy)return;
  if(state.layers.length>=MAX_LAYERS){alert('Puedes poner hasta '+MAX_LAYERS+' diseños. Quita alguno primero.');return;}
  if(file.size>60*1024*1024){alert('El archivo supera 60 MB');return;}
  state.busy=true;const hint=$('mkHint');hint.hidden=false;hint.textContent='Preparando el diseño…';
  try{
   const name=file.name||'Diseño',type=file.type||'',isPdf=type==='application/pdf'||/\.pdf$/i.test(name),isSvg=type==='image/svg+xml'||/\.svg$/i.test(name);
   const r=isPdf?await rasterPdf(file):isSvg?await rasterSvg(file):await rasterImage(file);
   const src=r.canvas,aspect=src.height/src.width,B=state.base;
   let w=B.w*.42;if(w*aspect>B.h*.7)w=B.h*.7/aspect;
   const L={name,src,view:src,w,h:w*aspect,cx:B.w/2,cy:B.h/2,rot:0,op:1,real:1,noWhite:false,off:new Float32Array(2*(COLS+1)*(ROWS+1))};
   state.layers.push(L);state.sel=state.layers.length-1;hint.hidden=true;sync();draw();
   if(r.pages>1)alert('El PDF tiene '+r.pages+' páginas; se ha usado la primera.');
  }catch(err){hint.textContent=err.message||'No se pudo abrir el diseño';alert('No se pudo abrir el diseño: '+(err.message||err));}
  finally{state.busy=false;if(state.layers.length)hint.hidden=true;}
 }
 function removeLayer(){if(state.sel<0)return;state.layers.splice(state.sel,1);state.sel=Math.min(state.sel,state.layers.length-1);if(!state.layers.length)$('mkHint').hidden=false,$('mkHint').textContent='Pulsa «＋ Añadir diseño» y elige un PDF, un SVG o una imagen.';sync();draw();}

 /* ---------- geometría y dibujo ---------- */
 function gridPoints(L){
  const pts=[],c=Math.cos(L.rot),s=Math.sin(L.rot);
  for(let j=0;j<=ROWS;j++)for(let i=0;i<=COLS;i++){
   const x=(i/COLS-.5)*L.w,y=(j/ROWS-.5)*L.h,k=(j*(COLS+1)+i)*2;
   pts.push({x:L.cx+x*c-y*s+L.off[k],y:L.cy+x*s+y*c+L.off[k+1]});
  }
  return pts;
 }
 const curved=L=>L.off.some(v=>v!==0);
 function tri(ctx,img,s0,s1,s2,d0,d1,d2){
  const sx1=s1.x-s0.x,sy1=s1.y-s0.y,sx2=s2.x-s0.x,sy2=s2.y-s0.y,det=sx1*sy2-sx2*sy1;if(!det)return;
  const ux1=d1.x-d0.x,vy1=d1.y-d0.y,ux2=d2.x-d0.x,vy2=d2.y-d0.y;
  const a=(ux1*sy2-ux2*sy1)/det,c=(ux2*sx1-ux1*sx2)/det,b=(vy1*sy2-vy2*sy1)/det,d=(vy2*sx1-vy1*sx2)/det;
  const e=d0.x-(a*s0.x+c*s0.y),f=d0.y-(b*s0.x+d*s0.y);
  /* el triángulo se ensancha medio píxel para que no queden rendijas entre trozos */
  const mx=(d0.x+d1.x+d2.x)/3,my=(d0.y+d1.y+d2.y)/3,grow=p=>{const dx=p.x-mx,dy=p.y-my,l=Math.hypot(dx,dy)||1;return{x:p.x+dx/l*.7,y:p.y+dy/l*.7};};
  const p0=grow(d0),p1=grow(d1),p2=grow(d2);
  ctx.save();ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();ctx.clip();
  ctx.transform(a,b,c,d,e,f);ctx.drawImage(img,0,0);ctx.restore();
 }
 function drawWarped(ctx,L,sub){
  const img=L.view,W=img.width,H=img.height;
  if(!curved(L)){const k=L.w/W;ctx.save();ctx.translate(L.cx,L.cy);ctx.rotate(L.rot);ctx.scale(k,k);ctx.drawImage(img,-W/2,-H/2);ctx.restore();return;}
  const P=gridPoints(L),at=(i,j)=>P[j*(COLS+1)+i];
  for(let j=0;j<ROWS;j++)for(let i=0;i<COLS;i++){
   const a=at(i,j),b=at(i+1,j),c=at(i,j+1),d=at(i+1,j+1);
   for(let v=0;v<sub;v++)for(let u=0;u<sub;u++){
    const u0=u/sub,u1=(u+1)/sub,v0=v/sub,v1=(v+1)/sub;
    const q=(uu,vv)=>({x:(1-vv)*((1-uu)*a.x+uu*b.x)+vv*((1-uu)*c.x+uu*d.x),y:(1-vv)*((1-uu)*a.y+uu*b.y)+vv*((1-uu)*c.y+uu*d.y)});
    const sp=(uu,vv)=>({x:(i+uu)/COLS*W,y:(j+vv)/ROWS*H});
    const D00=q(u0,v0),D10=q(u1,v0),D01=q(u0,v1),D11=q(u1,v1),S00=sp(u0,v0),S10=sp(u1,v0),S01=sp(u0,v1),S11=sp(u1,v1);
    tri(ctx,img,S00,S10,S01,D00,D10,D01);tri(ctx,img,S10,S11,S01,D10,D11,D01);
   }
  }
 }
 function compose(ctx,final){
  const B=state.base;ctx.clearRect(0,0,B.w,B.h);ctx.drawImage(B.image,0,0);
  const tmp=compose.tmp||(compose.tmp=document.createElement('canvas'));tmp.width=B.w;tmp.height=B.h;const t=tmp.getContext('2d');
  const sub=!final&&state.drag?3:8;
  for(const L of state.layers){
   t.clearRect(0,0,B.w,B.h);t.globalCompositeOperation='source-over';drawWarped(t,L,sub);
   if(state.clip&&state.outside){t.globalCompositeOperation='destination-out';t.drawImage(state.outside,0,0);t.globalCompositeOperation='source-over';}
   ctx.save();ctx.globalAlpha=L.op*(1-L.real);ctx.drawImage(tmp,0,0);
   ctx.globalAlpha=L.op*L.real;ctx.globalCompositeOperation='multiply';ctx.drawImage(tmp,0,0);ctx.restore();
  }
 }
 function guides(ctx){
  const k=state.fit?1/state.fit:1,L=cur();if(!L||!state.guides)return;
  ctx.save();ctx.lineWidth=2*k;ctx.strokeStyle='#208cba';ctx.fillStyle='#fff';
  const c=Math.cos(L.rot),s=Math.sin(L.rot),corner=(sx,sy)=>({x:L.cx+sx*L.w/2*c-sy*L.h/2*s,y:L.cy+sx*L.w/2*s+sy*L.h/2*c});
  const q=[corner(-1,-1),corner(1,-1),corner(1,1),corner(-1,1)];
  ctx.setLineDash([7*k,5*k]);ctx.beginPath();q.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  if(state.curve){
   const P=gridPoints(L);ctx.strokeStyle='rgba(32,140,186,.65)';ctx.lineWidth=1.4*k;
   for(let j=0;j<=ROWS;j++){ctx.beginPath();for(let i=0;i<=COLS;i++){const p=P[j*(COLS+1)+i];i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.stroke();}
   for(let i=0;i<=COLS;i++){ctx.beginPath();for(let j=0;j<=ROWS;j++){const p=P[j*(COLS+1)+i];j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.stroke();}
   ctx.strokeStyle='#208cba';ctx.lineWidth=2*k;
   for(const p of P){ctx.beginPath();ctx.arc(p.x,p.y,6*k,0,7);ctx.fill();ctx.stroke();}
  }else{
   const hs=9*k;for(const p of q){ctx.fillRect(p.x-hs,p.y-hs,hs*2,hs*2);ctx.strokeRect(p.x-hs,p.y-hs,hs*2,hs*2);}
   const top=corner(0,-1);
   const up={x:top.x+Math.sin(L.rot)*38*k,y:top.y-Math.cos(L.rot)*38*k};
   ctx.beginPath();ctx.moveTo(top.x,top.y);ctx.lineTo(up.x,up.y);ctx.stroke();ctx.beginPath();ctx.arc(up.x,up.y,10*k,0,7);ctx.fill();ctx.stroke();
  }
  ctx.restore();
 }
 function draw(){
  if(!state.base||ov.hidden)return;
  cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{compose(g,false);guides(g);});
 }
 function fitCanvas(){
  const B=state.base;if(!B)return;const st=$('mkStage'),r=st.getBoundingClientRect();
  const k=Math.min((r.width-8)/B.w,(r.height-8)/B.h);state.fit=Math.max(.05,k);
  cv.style.width=Math.floor(B.w*state.fit)+'px';cv.style.height=Math.floor(B.h*state.fit)+'px';draw();
 }
 function sync(slidersOnly){
  const L=cur(),B=state.base;
  if(!slidersOnly){
   $('mkLayers').innerHTML=state.layers.map((l,i)=>'<option value="'+i+'"'+(i===state.sel?' selected':'')+'>'+(i+1)+'. '+String(l.name).replace(/[<>&"]/g,'').slice(0,28)+'</option>').join('')||'<option value="-1">Sin diseños</option>';
  }
  for(const id of ['mkSize','mkRot','mkOp','mkReal','mkDel','mkFlat','mkWhite','mkLayers'])$(id).disabled=!L&&id!=='mkLayers';
  $('mkCurve').setAttribute('aria-pressed',String(state.curve));$('mkClip').setAttribute('aria-pressed',String(state.clip));$('mkGuides').setAttribute('aria-pressed',String(state.guides));
  $('mkClip').hidden=!state.outside;$('mkWhite').setAttribute('aria-pressed',String(!!L?.noWhite));
  if(L){
   $('mkSize').value=String(clamp(L.w/B.w*100,3,200));$('mkRot').value=String(Math.round(L.rot*1800/Math.PI)/10);$('mkOp').value=String(Math.round(L.op*100));$('mkReal').value=String(Math.round(L.real*100));
   $('mkSizeV').textContent=Math.round(L.w/B.w*100)+'%';$('mkRotV').textContent=(Math.round(L.rot*180/Math.PI)||0)+'°';$('mkOpV').textContent=Math.round(L.op*100)+'%';$('mkRealV').textContent=Math.round(L.real*100)+'%';
  }
  $('mkHelp').textContent=state.curve?'Arrastra un punto azul: la zona que lo rodea se dobla con él. Úsalo para seguir pasos de rueda, molduras y curvas.':'Arrastra el diseño para moverlo. Con dos dedos lo agrandas y lo giras. Las esquinas cambian el tamaño y el círculo superior lo gira.';
 }

 /* ---------- puntero ---------- */
 function pos(e){const r=cv.getBoundingClientRect(),B=state.base;return{x:(e.clientX-r.left)/r.width*B.w,y:(e.clientY-r.top)/r.height*B.h};}
 function local(L,p){const c=Math.cos(-L.rot),s=Math.sin(-L.rot),dx=p.x-L.cx,dy=p.y-L.cy;return{x:dx*c-dy*s,y:dx*s+dy*c};}
 function hitLayer(p){for(let i=state.layers.length-1;i>=0;i--){const L=state.layers[i],q=local(L,p);if(Math.abs(q.x)<=L.w/2&&Math.abs(q.y)<=L.h/2)return i;}return -1;}
 function down(e){
  if(!state.base)return;cv.setPointerCapture?.(e.pointerId);state.pointers.set(e.pointerId,pos(e));
  const p=pos(e),k=1/state.fit,L=cur();
  if(state.pointers.size===2&&L){const [a,b]=[...state.pointers.values()];state.drag={type:'pinch',d0:Math.hypot(b.x-a.x,b.y-a.y)||1,a0:Math.atan2(b.y-a.y,b.x-a.x),w0:L.w,h0:L.h,r0:L.rot,off0:Float32Array.from(L.off)};return;}
  if(L&&state.guides){
   if(state.curve){
    const P=gridPoints(L);let best=-1,bd=26*k;P.forEach((q,i)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bd){bd=d;best=i;}});
    if(best>=0){state.drag={type:'mesh',idx:best,start:p,off0:Float32Array.from(L.off),P0:P};return;}
   }else{
    const c=Math.cos(L.rot),s=Math.sin(L.rot),corner=(sx,sy)=>({x:L.cx+sx*L.w/2*c-sy*L.h/2*s,y:L.cy+sx*L.w/2*s+sy*L.h/2*c}),top=corner(0,-1);
    const knob={x:top.x+Math.sin(L.rot)*38*k,y:top.y-Math.cos(L.rot)*38*k};
    if(Math.hypot(knob.x-p.x,knob.y-p.y)<24*k){state.drag={type:'rot',a0:Math.atan2(p.y-L.cy,p.x-L.cx),r0:L.rot};return;}
    for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const q=corner(sx,sy);if(Math.hypot(q.x-p.x,q.y-p.y)<22*k){state.drag={type:'scale',d0:Math.hypot(q.x-L.cx,q.y-L.cy)||1,w0:L.w,h0:L.h,off0:Float32Array.from(L.off)};return;}}
   }
  }
  const hit=hitLayer(p);
  if(hit>=0){state.sel=hit;sync();state.drag={type:'move',start:p,cx0:state.layers[hit].cx,cy0:state.layers[hit].cy};}
  else if(!state.curve){state.sel=-1;sync();}
  draw();
 }
 function move(e){
  if(!state.pointers.has(e.pointerId))return;state.pointers.set(e.pointerId,pos(e));
  const d=state.drag,L=cur();if(!d||!L)return;const p=pos(e);
  if(d.type==='pinch'&&state.pointers.size>=2){
   const [a,b]=[...state.pointers.values()],f=Math.hypot(b.x-a.x,b.y-a.y)/d.d0;
   L.w=clamp(d.w0*f,state.base.w*.03,state.base.w*2);const r=L.w/d.w0;L.h=d.h0*r;L.rot=d.r0+(Math.atan2(b.y-a.y,b.x-a.x)-d.a0);for(let i=0;i<L.off.length;i++)L.off[i]=d.off0[i]*r;
  }else if(d.type==='move'){L.cx=d.cx0+(p.x-d.start.x);L.cy=d.cy0+(p.y-d.start.y);}
  else if(d.type==='rot'){L.rot=d.r0+Math.atan2(p.y-L.cy,p.x-L.cx)-d.a0;}
  else if(d.type==='scale'){const f=Math.hypot(p.x-L.cx,p.y-L.cy)/d.d0;L.w=clamp(d.w0*f,state.base.w*.03,state.base.w*2);const r=L.w/d.w0;L.h=d.h0*r;for(let i=0;i<L.off.length;i++)L.off[i]=d.off0[i]*r;}
  else if(d.type==='mesh'){
   const dx=p.x-d.start.x,dy=p.y-d.start.y,ix=d.idx%(COLS+1),iy=Math.floor(d.idx/(COLS+1)),cw=L.w/COLS,ch=L.h/ROWS,R=Math.max(cw,ch)*2.4;
   for(let j=0;j<=ROWS;j++)for(let i=0;i<=COLS;i++){
    const dist=Math.hypot((i-ix)*cw,(j-iy)*ch),wgt=Math.max(0,1-dist/R),w2=wgt*wgt*(3-2*wgt),k=(j*(COLS+1)+i)*2;
    L.off[k]=d.off0[k]+dx*w2;L.off[k+1]=d.off0[k+1]+dy*w2;
   }
  }
  sync(true);draw();
 }
 function up(e){
  state.pointers.delete(e.pointerId);
  if(state.pointers.size<2&&state.drag?.type==='pinch')state.drag=null;
  if(!state.pointers.size){state.drag=null;draw();}
 }

 /* ---------- abrir, cerrar y guardar ---------- */
 function open(){
  const b=S.currentBase();if(!b){alert('Abre primero una plantilla o una foto del vehículo.');return;}
  if(!ov)build();
  const same=state.base&&state.base.image===b.image;
  const w=b.image.width,h=b.image.height;
  if(!same){state.layers=[];state.sel=-1;state.outside=b.template?floodOutside(b.image):null;state.clip=!!state.outside;}
  state.base={image:b.image,name:b.name,w,h};cv.width=w;cv.height=h;
  ov.hidden=false;$('mkHint').hidden=!!state.layers.length;sync();
  requestAnimationFrame(()=>{fitCanvas();ov.focus({preventScroll:true});});
  window.dispatchEvent(new CustomEvent('rotulom-mockup-open'));
 }
 function close(){ov.hidden=true;state.drag=null;state.pointers.clear();window.dispatchEvent(new CustomEvent('rotulom-mockup-close'));}
 async function save(){
  if(!state.base||!state.layers.length){alert('Añade primero un diseño.');return;}
  const out=document.createElement('canvas');out.width=state.base.w;out.height=state.base.h;compose(out.getContext('2d'),true);
  const blob=await new Promise(res=>out.toBlob(res,'image/png'));if(!blob){alert('No se pudo crear la imagen');return;}
  const name='Mockup - '+String(state.base.name||'vehículo').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,60)+'.png';
  if(parent&&parent!==window){parent.postMessage({type:'medlom-export-image',blob,name},location.origin);return;}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 }
 const btn=document.createElement('button');btn.type='button';btn.id='openMockup';btn.className='tool-button';btn.textContent='🖼 Mockup con diseño';
 btn.onclick=open;$('clearZones').after(btn);
 window.rotulomMockup={open,close,isOpen:()=>!!ov&&!ov.hidden};
})();
