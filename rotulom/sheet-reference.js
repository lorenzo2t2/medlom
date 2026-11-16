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
      for(const col of runs(columns,Math.max(6,w*.015))){const width=col.end-col.start,aspect=width/height;if(width<w*.18||width>w*.98||aspect<.5||aspect>4.5)continue;boxes.push({left:col.start*iw/w,right:col.end*iw/w,top:row.start*ih/h,bottom:row.end*ih/h,kind:aspect>1.65?'lateral':'extremo'});}
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
      if(bw<w*.20||bh<h*.09||bh<h*.025+12||aspect<.55||aspect>4.5||bw>w*.985&&bh>h*.55)continue;
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
  return{views,references,forZone,outerViews,outlines};
});
