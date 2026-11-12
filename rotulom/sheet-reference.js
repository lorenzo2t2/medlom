/* Localiza vistas por su geometría. No lee títulos, cotas ni marcas de agua. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RotulomSheet=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  function views(image){
    const {width:iw,height:ih,data}=image,w=Math.min(640,iw),h=Math.round(ih*w/iw),gray=new Uint8Array(w*h),edge=new Uint8Array(w*h),mask=new Uint8Array(w*h),seen=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.floor(y*ih/h)*iw+Math.floor(x*iw/w))*4;gray[y*w+x]=(data[i]*3+data[i+1]*6+data[i+2])/10;}
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
    return boxes.sort((a,b)=>a.top-b.top||a.left-b.left);
  }
  function references(boxes,vehicle,lengthChoice){
    const dim=vehicle?.dimensionsMm||{},length=(dim.exteriorLength||0)/10||Number(lengthChoice)||0;
    const width=/sin retrovisores/i.test(vehicle?.catalogueDetails?.widthConvention||'')?(dim.exteriorWidth||0)/10:0;
    return boxes.map((b,i)=>({...b,id:'vista-'+i,label:b.kind==='lateral'?'Lateral':'Frontal / trasera',knownCm:b.kind==='lateral'?length:width,points:[{x:b.left,y:b.bottom},{x:b.right,y:b.bottom}],source:'modelo seleccionado'}));
  }
  function forZone(refs,z){
    const matches=refs.filter(r=>{const area=Math.max(0,Math.min(z.x+z.w,r.right)-Math.max(z.x,r.left))*Math.max(0,Math.min(z.y+z.h,r.bottom)-Math.max(z.y,r.top));return area/(z.w*z.h)>.92;});
    if(matches.length!==1||!(matches[0].knownCm>0))return null;const ref=matches[0],a=ref.points?.[0],b=ref.points?.[1],distance=a&&b?Math.hypot(b.x-a.x,b.y-a.y):ref.right-ref.left;if(!(distance>2))return null;const scale=ref.knownCm/distance;return{scale,ref};
  }
  return{views,references,forZone};
});
