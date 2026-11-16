/* Localiza vistas por su geometría. No lee títulos, cotas ni marcas de agua. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RotulomSheet=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  function overlap(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));}
  function outerViews(boxes){return boxes.filter((b,i)=>!boxes.some((a,j)=>j!==i&&(a.right-a.left)*(a.bottom-a.top)>(b.right-b.left)*(b.bottom-b.top)*1.5&&overlap(a,b)/((b.right-b.left)*(b.bottom-b.top))>.94));}
  function dedupe(boxes){const area=b=>(b.right-b.left)*(b.bottom-b.top);return boxes.filter((b,i)=>!boxes.some((a,j)=>j!==i&&(area(a)>area(b)||area(a)===area(b)&&j<i)&&overlap(a,b)/area(b)>.25));}
  function runs(values,gap=4){const result=[];for(const v of values){let r=result.at(-1);if(!r||v-r.end>gap){r={start:v,end:v};result.push(r);}else r.end=v;}return result;}
  function paperViews(gray,w,h,iw,ih){
    let white=0;for(const v of gray)if(v>240)white++;if(white/gray.length<.35)return [];
    const rows=[];for(let y=0;y<h;y++){let n=0;for(let x=0;x<w;x++)if(gray[y*w+x]<210)n++;if(n>w*.08)rows.push(y);}
    const boxes=[];for(const row of runs(rows,4)){
      const height=row.end-row.start;if(height<h*.085)continue;const columns=[];
      for(let x=0;x<w;x++){let n=0;for(let y=row.start;y<=row.end;y++)if(gray[y*w+x]<210)n++;if(n>height*.12)columns.push(x);}
      for(const col of runs(columns,Math.max(6,w*.015))){const width=col.end-col.start,aspect=width/height;if(width<w*.12||width>w*.98||aspect<.5||aspect>4.5)continue;boxes.push({left:col.start*iw/w,right:col.end*iw/w,top:row.start*ih/h,bottom:row.end*ih/h,kind:aspect>1.65?'lateral':'extremo'});}
    }
    return boxes.length>1&&boxes.some(b=>b.kind==='lateral')?boxes:[];
  }
  function views(image){
    const {width:iw,height:ih,data}=image,w=Math.min(640,iw),h=Math.round(ih*w/iw),gray=new Uint8Array(w*h),edge=new Uint8Array(w*h),mask=new Uint8Array(w*h),seen=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.floor(y*ih/h)*iw+Math.floor(x*iw/w))*4,r=data[i],g=data[i+1],b=data[i+2],annotation=r>170&&g>80&&g<205&&b<110&&r>g*1.25;gray[y*w+x]=annotation?255:(r*3+g*6+b)/10;}
    const page=paperViews(gray,w,h,iw,ih);if(page.length)return dedupe(outerViews(page));
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(Math.abs(gray[i-2]-gray[i+2])+Math.abs(gray[i-2*w]-gray[i+2*w])>65)edge[i]=1;}
    const radius=2;
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++)if(edge[y*w+x])for(let yy=y-radius;yy<=y+radius;yy++)for(let xx=x-radius;xx<=x+radius;xx++)mask[yy*w+xx]=1;
    const boxes=[];
    for(let i=0;i<mask.length;i++){
      if(!mask[i]||seen[i])continue;const q=[i];seen[i]=1;let left=w,right=0,top=h,bottom=0;
      for(let p=0;p<q.length;p++){const n=q[p],x=n%w,y=Math.floor(n/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);for(const k of [x?n-1:-1,x<w-1?n+1:-1,y?n-w:-1,y<h-1?n+w:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;q.push(k);}}
      const bw=right-left,bh=bottom-top,aspect=bw/bh;
      // Los títulos, flechas de cota y pies no tienen la altura de una carrocería.
      if(bw<w*.12||bh<h*.09||bh<h*.025+12||aspect<.55||aspect>4.5||bw>w*.985&&bh>h*.55)continue;
      const kind=aspect>1.65?'lateral':'extremo',support=bh*(kind==='lateral'?.10:.20),columns=[];
      for(let x=left;x<=right;x++){let n=0;for(let y=top;y<=bottom;y++)n+=kind==='lateral'?mask[y*w+x]:(gray[y*w+x]<190?1:0);if(n>=support)columns.push(x);}
      const runs=[];for(const x of columns){let run=runs.at(-1);if(!run||x-run.right>Math.max(8,bw*.04)){run={left:x,right:x};runs.push(run);}else run.right=x;}
      const body=runs.sort((a,b)=>(b.right-b.left)-(a.right-a.left))[0];
      if(body&&body.right-body.left>bw*.5){left=body.left;right=body.right;}
      boxes.push({left:left*iw/w,right:right*iw/w,top:top*ih/h,bottom:bottom*ih/h,kind});
    }
    return dedupe(outerViews(boxes)).sort((a,b)=>a.top-b.top||a.left-b.left);
  }
  function references(boxes,vehicle,lengthChoice){
    const dim=vehicle?.dimensionsMm||{},length=(dim.exteriorLength||0)/10||Number(lengthChoice)||0;
    const width=(dim.exteriorWidth||dim.exteriorWidthMirrorsFolded||0)/10;
    return dedupe(outerViews(boxes)).map((b,i)=>({...b,id:'vista-'+i,label:b.kind==='lateral'?'Lateral':'Frontal / trasera',knownCm:b.kind==='lateral'?length:width,points:[{x:b.left,y:b.bottom},{x:b.right,y:b.bottom}],source:b.kind==='lateral'?'largo del modelo seleccionado':(/sin retrovisores/i.test(vehicle?.catalogueDetails?.widthConvention||'')?'ancho del modelo seleccionado (sin retrovisores)':'ancho del modelo seleccionado: confirma si incluye retrovisores')}));
  }
  /* Busca las dos ruedas de un lateral (círculos) con una transformada de Hough sobre los bordes. */
  function wheels(image,box){
    const {width:iw,height:ih,data}=image,bw=box.right-box.left,bh=box.bottom-box.top;if(!(bw>40&&bh>20))return null;
    const x0=Math.max(0,Math.floor(box.left)),x1=Math.min(iw,Math.ceil(box.right)),y0=Math.max(0,Math.floor(box.top+bh*.45)),y1=Math.min(ih,Math.ceil(box.bottom+bh*.06));
    if(x1-x0<40||y1-y0<20)return null;
    const k=Math.min(1,520/(x1-x0)),w=Math.max(16,Math.round((x1-x0)*k)),h=Math.max(16,Math.round((y1-y0)*k)),g=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((y0+Math.min(y1-y0-1,Math.floor(y/k)))*iw+x0+Math.min(x1-x0-1,Math.floor(x/k)))*4,r=data[i],gg=data[i+1],b=data[i+2];
      const mark=(r>170&&gg>80&&gg<205&&b<110&&r>gg*1.25)||(gg>75&&gg-r>25&&gg-b>15&&r<gg*.8);g[y*w+x]=mark?200:(r*3+gg*6+b)/10;}
    const rMin=Math.max(5,Math.round(w*.035)),rMax=Math.max(rMin+2,Math.round(w*.095)),nr=rMax-rMin+1,acc=new Uint16Array(w*h*nr),gx=new Float32Array(w*h),gy=new Float32Array(w*h);let sum=0,n=0;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,a=g[i-w-1],b=g[i-w],c=g[i-w+1],d=g[i-1],f=g[i+1],e=g[i+w-1],hh=g[i+w],j=g[i+w+1];
      const dx=(c+2*f+j)-(a+2*d+e),dy=(e+2*hh+j)-(a+2*b+c);gx[i]=dx;gy[i]=dy;const m=Math.hypot(dx,dy);sum+=m;n++;}
    const thr=Math.max(60,sum/n*2.2);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,m=Math.hypot(gx[i],gy[i]);if(m<thr)continue;const ux=gx[i]/m,uy=gy[i]/m;
      for(let ri=0;ri<nr;ri++){const r=rMin+ri;for(const sg of [1,-1]){const cx=Math.round(x+sg*ux*r),cy=Math.round(y+sg*uy*r);if(cx>=0&&cx<w&&cy>=0&&cy<h)acc[(cy*w+cx)*nr+ri]++;}}}
    const cands=[];
    for(let cy=2;cy<h-2;cy++)for(let cx=2;cx<w-2;cx++)for(let ri=0;ri<nr;ri++){let v=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)v+=acc[((cy+dy)*w+cx+dx)*nr+ri];const r=rMin+ri;if(v>=1.7*r)cands.push({cx,cy,r,v,score:v/Math.pow(r,0.0)});}
    cands.sort((a,b)=>b.score-a.score);const picked=[];
    for(const c of cands){if(picked.length>=10)break;if(picked.some(p=>Math.hypot(p.cx-c.cx,p.cy-c.cy)<Math.max(p.r,c.r)*.7))continue;picked.push(c);}
    const bottom=(box.bottom-y0)*k,tol=Math.max(6,bh*k*.14);let best=null;
    for(let i=0;i<picked.length;i++)for(let j=i+1;j<picked.length;j++){const a=picked[i],b=picked[j],R=Math.max(a.r,b.r);
      if(Math.abs(a.r-b.r)>R*.18||Math.abs(a.cx-b.cx)<R*2.6||Math.abs(a.cy-b.cy)>R*.3)continue;
      if(Math.abs(a.cy+a.r-bottom)>tol*1.4||Math.abs(b.cy+b.r-bottom)>tol*1.4)continue;
      const sc=a.score+b.score;if(!best||sc>best.sc)best={sc,a,b};}
    if(!best)return null;
    const mag=new Float32Array(w*h);for(let i=0;i<mag.length;i++)mag[i]=Math.hypot(gx[i],gy[i]);
    /* El círculo más nítido suele ser la llanta; el neumático es el borde exterior fuerte de la mitad inferior. */
    const refine=c=>{const lo=Math.round(c.r*.85),hi=Math.min(Math.round(c.r*2.1),Math.round((bottom-c.cy)*1.08)),E=[];if(hi<=lo)return c.r;
      for(let r=lo;r<=hi;r++){let t=0,m=0;for(let a=25;a<=155;a+=6){const q=a*Math.PI/180,x=Math.round(c.cx+Math.cos(q)*r),y=Math.round(c.cy+Math.sin(q)*r);if(x>0&&x<w-1&&y>0&&y<h-1){t+=mag[y*w+x];m++;}}E.push(m?t/m:0);}
      const mx=Math.max(...E);let out=c.r;for(let i=1;i<E.length-1;i++)if(E[i]>=E[i-1]&&E[i]>=E[i+1]&&E[i]>=.6*mx)out=Math.max(out,lo+i);return out;};
    const R=(refine(best.a)+refine(best.b))/2;best.a.r=R;best.b.r=R;
    const toImg=c=>({x:x0+c.cx/k,y:y0+c.cy/k,r:c.r/k});
    return{diameter:(best.a.r+best.b.r)/k,circles:[toImg(best.a),toImg(best.b)]};
  }
  /* Estima escalas cuando no hay ficha: el lateral por el diámetro de sus ruedas y las vistas de frente y detrás por la altura del vehículo. */
  function estimate(image,refs,wheelCm){
    const lateral=refs.filter(r=>r.kind==='lateral'&&!(r.knownCm>0));let heightCm=0,done=false;
    for(const r of refs.filter(r=>r.kind==='lateral')){
      if(r.knownCm>0){heightCm=heightCm||(r.bottom-r.top)*r.knownCm/Math.max(1,r.points?Math.hypot(r.points[1].x-r.points[0].x,r.points[1].y-r.points[0].y):r.right-r.left);continue;}
      const w=wheels(image,r);if(!w)continue;const scale=wheelCm/w.diameter;r.knownCm=(r.right-r.left)*scale;r.points=[{x:r.left,y:r.bottom},{x:r.right,y:r.bottom}];r.estimated=true;r.wheels=w.circles;r.source='estimado con las ruedas ('+wheelCm+' cm)';heightCm=heightCm||(r.bottom-r.top)*scale;done=true;}
    if(heightCm>0)for(const r of refs){if(r.kind==='lateral'||r.knownCm>0)continue;const cx=(r.left+r.right)/2;r.knownCm=heightCm;r.points=[{x:cx,y:r.top},{x:cx,y:r.bottom}];r.estimated=true;r.source='estimado con la altura del vehículo';done=true;}
    return done;
  }
  function forZone(refs,z){
    const matches=outerViews(refs).filter(r=>{const area=Math.max(0,Math.min(z.x+z.w,r.right)-Math.max(z.x,r.left))*Math.max(0,Math.min(z.y+z.h,r.bottom)-Math.max(z.y,r.top));return area/(z.w*z.h)>.92;});
    if(matches.length!==1||!(matches[0].knownCm>0))return null;const ref=matches[0],a=ref.points?.[0],b=ref.points?.[1],distance=a&&b?Math.hypot(b.x-a.x,b.y-a.y):ref.right-ref.left;if(!(distance>2))return null;const scale=ref.knownCm/distance;return{scale,ref};
  }
  function outlines(image){
    const {width:iw,height:ih,data}=image,w=Math.min(1000,iw),h=Math.round(ih*w/iw),green=new Uint8Array(w*h),mask=new Uint8Array(w*h),seen=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.floor(y*ih/h)*iw+Math.floor(x*iw/w))*4,r=data[i],g=data[i+1],b=data[i+2];if(g>75&&g-r>25&&g-b>15&&r<g*.8)green[y*w+x]=1;}
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(green[y*w+x])for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)mask[yy*w+xx]=1;
    const found=[];for(let i=0;i<mask.length;i++){
      if(!mask[i]||seen[i])continue;const q=[i];seen[i]=1;let l=w,r=0,t=h,b=0;
      for(let p=0;p<q.length;p++){const n=q[p],x=n%w,y=Math.floor(n/w);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);for(const k of [x?n-1:-1,x<w-1?n+1:-1,y?n-w:-1,y<h-1?n+w:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;q.push(k);}}
      const width=r-l,height=b-t;if(width<w*.06||height<h*.04||width<20||height<20||q.length/(width*height)>.32)continue;
      const support=(horizontal,at,start,end)=>{let n=0;for(let v=start;v<=end;v++){let hit=false;for(let k=-3;k<=3;k++){const x=horizontal?v:at+k,y=horizontal?at+k:v;if(x>=0&&x<w&&y>=0&&y<h&&green[y*w+x]){hit=true;break;}}if(hit)n++;}return n/(end-start+1);};
      const sides=[support(true,t,l,r),support(true,b,l,r),support(false,l,t,b),support(false,r,t,b)];
      // Una etiqueta puede tapar parte de un borde; exige tres bordes completos y evidencia del cuarto.
      if(sides.every(v=>v>.65)||sides.filter(v=>v>.9).length>=3&&sides.every(v=>v>.3))found.push({x:(l+1)*iw/w,y:(t+1)*ih/h,w:(width-2)*iw/w,h:(height-2)*ih/h,copies:1,origin:'outline'});
    }
    return found;
  }
  return{views,references,forZone,outerViews,outlines,wheels,estimate};
});
