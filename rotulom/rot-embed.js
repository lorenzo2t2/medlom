/* ===== mobile-runtime.js ===== */
(() => {
  window.ROTU_ANDROID=false;
  const nativeFetch=window.fetch.bind(window),KEY='rotulom-mobile-vehicles-v1';
  let seedPromise;
  const stored=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}};
  async function vehicles(){
    seedPromise=seedPromise||nativeFetch('./rotulom/data/vehicles.json').then(r=>r.json());
    const seed=(await seedPromise).filter(v=>v.catalogueDetails?.templateArtwork?.atlas),base=new URL('./',location.href).pathname;
    for(const v of seed){if(v.imageUrl?.startsWith('/data/'))v.imageUrl=base+v.imageUrl.slice(1);const d=v.catalogueDetails;if(d?.profileImageUrl?.startsWith('/data/'))d.profileImageUrl=base+d.profileImageUrl.slice(1);}
    const overrides=stored(),map=new Map(seed.map(v=>[v.id,v]));
    for(const v of Object.values(overrides)){
      const original=map.get(v.id);
      map.set(v.id,original?{...original,...v,catalogueDetails:{...original.catalogueDetails,...v.catalogueDetails,templateId:original.catalogueDetails.templateId,templateArtwork:original.catalogueDetails.templateArtwork}}:v);
    }
    return [...map.values()].sort((a,b)=>(a.make+' '+a.model).localeCompare(b.make+' '+b.model,'es'));
  }
  function persist(value){try{localStorage.setItem(KEY,JSON.stringify(value));}catch{throw new Error('No queda espacio local para guardar más fichas.');}}
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  function parseCsv(text){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw Error('El CSV contiene una comilla sin cerrar.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);const headers=(rows.shift()||[]).map(h=>h.trim().replace(/^\uFEFF/,''));return {headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])))};}
  window.fetch=async(input,options={})=>{
    const u=new URL(typeof input==='string'?input:input.url,location.href);
    if(u.origin!==location.origin||!u.pathname.startsWith('/api/'))return nativeFetch(input,options);
    try{
      const method=(options.method||'GET').toUpperCase(),path=u.pathname,body=options.body?JSON.parse(options.body):{};
      if(method==='GET'&&path==='/api/version')return response({version:'0.5.0',platform:'android',updatesConfigured:false});
      if(method==='GET'&&path==='/api/health')return response({ok:true,app:'RotuLoM'});
      if(method==='GET'&&path==='/api/quotes')return response([]);
      if(method==='GET'&&path==='/api/vehicles'){let data=await vehicles();const q=(u.searchParams.get('q')||'').toLowerCase(),category=u.searchParams.get('category');if(q)data=data.filter(v=>`${v.make} ${v.model} ${v.generation}`.toLowerCase().includes(q));if(category)data=data.filter(v=>v.category===category);return response(data);}
      if(method==='POST'&&/^\/api\/vehicles\/[^/]+\/photo$/.test(path)){
        const id=decodeURIComponent(path.split('/')[3]),v=(await vehicles()).find(v=>v.id===id);if(!v)return response({error:'No existe esa ficha.'},404);
        if(!window.RotulomNative)return response({error:'El guardado de fotos requiere abrir el APK.'},400);
        const saved=JSON.parse(window.RotulomNative.savePhoto(body.image||''));if(saved.error)return response(saved,400);
        const catalogueDetails={...(v.catalogueDetails||{}),profileImageUrl:saved.url,profileImageSource:'Aportada por el usuario',profileImageKind:'Foto de perfil aportada',profilePhotoCredit:'Biblioteca personal',profilePhotoSourceUrl:'',profileImageExactVariant:false,isSideView:true};
        const overrides=stored();overrides[id]={...v,catalogueDetails};persist(overrides);return response({catalogueDetails});
      }
      if(method==='POST'&&path==='/api/vehicles/import'){
        const csv=parseCsv(body.csv||''),required=['id','make','model','source_url','exterior_length_mm','exterior_width_mm','exterior_height_mm'];if(required.some(k=>!csv.headers.includes(k)))return response({error:'Faltan columnas obligatorias del CSV.'},400);
        if(csv.rows.length>10000)return response({error:'El límite es 10.000 filas por importación.'},400);
        const overrides=stored(),existing=new Set((await vehicles()).map(v=>v.id));let inserted=0,updated=0,ignored=0;const errors=[];
        for(let i=0;i<csv.rows.length;i++){const r=csv.rows[i];try{
          const n=k=>{if(!r[k])return null;const value=Number(r[k].replace(',','.'));if(!Number.isFinite(value))throw Error('Medida o año no numérico.');return value;};
          const dimensionsMm={exteriorLength:n('exterior_length_mm'),exteriorWidth:n('exterior_width_mm'),exteriorHeight:n('exterior_height_mm'),exteriorWidthMirrorsFolded:n('exterior_width_mirrors_folded_mm'),wheelbase:n('wheelbase_mm'),cargoLength:n('cargo_length_mm'),cargoMaxWidth:n('cargo_width_max_mm'),cargoMinWidth:n('cargo_width_min_mm'),cargoHeight:n('cargo_height_mm'),cargoVolumeLitres:n('cargo_volume_l')};
          if(!r.id||!r.make||!r.model||!/^https?:\/\//.test(r.source_url)||!['exteriorLength','exteriorWidth','exteriorHeight'].every(k=>dimensionsMm[k]>0))throw Error('Revisa identificación, fuente y medidas exteriores.');
          const category=r.category||'Coche';if(!['Coche','Furgoneta','Furgoneta con caja'].includes(category))throw Error('Categoría no válida.');if(category==='Furgoneta con caja'&&!r.box_model)throw Error('Falta el modelo de caja.');if(r.image_url&&!/^https?:\/\//.test(r.image_url))throw Error('La URL de imagen debe ser http o https.');
          const v={id:r.id,make:r.make,model:r.model,generation:r.generation,yearFrom:n('year_from'),yearTo:n('year_to'),category,bodyStyle:r.body_style,variant:r.variant,imageUrl:r.image_url,imageAlt:r.image_alt,sourceUrl:r.source_url,sourceLabel:r.source_label,verifiedAt:r.verified_at,verificationStatus:r.verification_status||'pendiente',dimensionsMm,wrapAreasM2:null,boxDetails:{coachbuilder:r.coachbuilder,boxModel:r.box_model,market:r.market,notes:r.box_notes},catalogueDetails:overrides[r.id]?.catalogueDetails||{}};overrides[v.id]=v;if(existing.has(v.id))updated++;else{inserted++;existing.add(v.id);}
        }catch(e){ignored++;if(errors.length<10)errors.push({row:i+2,error:e.message});}}
        persist(overrides);return response({inserted,updated,ignored,errors});
      }
      return response({error:'Esta función no está disponible en la versión local de Android.'},404);
    }catch(e){return response({error:e.message||'No se pudo completar la operación local.'},400);}
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById('checkUpdateButton');
    if(button)button.onclick=()=>{const t=document.getElementById('toast');t.textContent='Actualizaciones por APK: instala la nueva versión cuando esté disponible. No hay un servidor de actualizaciones configurado.';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),6500);};
    const install=document.getElementById('installButton');if(install)install.hidden=true;
    const label=document.getElementById('updateLabel');if(label)label.textContent='v0.5.0 · Android';
  });
})();

;
/* ===== auto-reference.js ===== */
/* Propuesta local de extremos por bordes. No identifica marca ni modelo. */
window.rotulomFindVehicleExtent = function(image) {
  const {width:iw,height:ih,data}=image,w=Math.min(640,iw),h=Math.round(ih*w/iw),gray=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=(Math.min(ih-1,Math.floor(y*ih/h))*iw+Math.min(iw-1,Math.floor(x*iw/w)))*4;gray[y*w+x]=(data[n]*3+data[n+1]*6+data[n+2])/10;}
  const edges=new Uint8Array(w*h),mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),margin=Math.ceil(w*.018),top=Math.floor(h*.12),bottom=Math.floor(h*.89);
  for(let y=top+2;y<bottom-2;y++)for(let x=margin+2;x<w-margin-2;x++){
    const i=y*w+x,g=Math.abs(gray[i-2]-gray[i+2])+Math.abs(gray[i-2*w]-gray[i+2*w]);
    if(g>44)edges[i]=1;
  }
  const radius=3;
  for(let y=top;y<bottom;y++)for(let x=margin;x<w-margin;x++)if(edges[y*w+x])for(let yy=Math.max(top,y-radius);yy<=Math.min(bottom-1,y+radius);yy++)for(let xx=Math.max(margin,x-radius);xx<=Math.min(w-margin-1,x+radius);xx++)mask[yy*w+xx]=1;
  const candidates=[];
  for(let i=top*w;i<bottom*w;i++){
    if(!mask[i]||seen[i])continue;const queue=[i];seen[i]=1;let left=w,right=0,up=h,down=0;
    for(let p=0;p<queue.length;p++){const n=queue[p],x=n%w,y=Math.floor(n/w);left=Math.min(left,x);right=Math.max(right,x);up=Math.min(up,y);down=Math.max(down,y);
      for(const m of [x>margin?n-1:-1,x<w-margin-1?n+1:-1,y>top?n-w:-1,y<bottom-1?n+w:-1])if(m>=0&&mask[m]&&!seen[m]){seen[m]=1;queue.push(m);}}
    const bw=right-left,bh=down-up,cx=(left+right)/2;
    if(bw>w*.32&&bh>h*.22&&Math.abs(cx-w/2)<w*.25)candidates.push({left,right,top:up,bottom:down,score:bw*bh});
  }
  candidates.sort((a,b)=>b.score-a.score);const c=candidates[0];if(!c)return null;
  const support=Math.max(7,(c.bottom-c.top)*.07),columns=[];
  for(let x=c.left;x<=c.right;x++){let n=0;for(let y=c.top;y<=c.bottom;y++)n+=mask[y*w+x];if(n>=support)columns.push(x);}
  if(columns.length){const left=Math.max(c.left,columns[0]-2),right=Math.min(c.right,columns[columns.length-1]+2);if(right-left>w*.32){c.left=left;c.right=right;}}
  const hitsBorder=c.left<=margin+1||c.right>=w-margin-2;
  return {left:c.left*iw/w,right:c.right*iw/w,top:c.top*ih/h,bottom:c.bottom*ih/h,uncertain:hitsBorder||c.right-c.left<w*.6,method:'Bordes del vehículo · referencia aproximada'};
};

;
/* ===== sheet-reference.js ===== */
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
    for(let cy=2;cy<h-2;cy++)for(let cx=2;cx<w-2;cx++)for(let ri=0;ri<nr;ri++){let v=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)v+=acc[((cy+dy)*w+cx+dx)*nr+ri];const r=rMin+ri;if(v>=1.7*r)cands.push({cx,cy,r,v,score:v});}
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
    /* Neumático: desde el centro se camina hacia fuera por la parte oscura hasta el suelo o el guardabarros claros; esos puntos de salida están sobre el borde real y se les ajusta un círculo (Kasa), aunque el centro de Hough esté desplazado. */
    const tire=c=>{const pts=[];
      for(let a=0;a<360;a+=8){if(a>200&&a<340)continue;const q=a*Math.PI/180,ux=Math.cos(q),uy=Math.sin(q),L=r=>{const x=Math.round(c.cx+ux*r),y=Math.round(c.cy+uy*r);return x>0&&x<w-1&&y>0&&y<h-1?g[y*w+x]:-1;};
        let dark=1e9;for(let r=Math.round(c.r*.8);r<=c.r;r++){const v=L(r);if(v>=0)dark=Math.min(dark,v);}if(dark>150)continue;
        const thr=Math.max(60,dark*2.4+12),max=Math.round(c.r*1.8);let ex=0;
        for(let r=c.r;r<=max;r++){const v=L(r),v2=L(r+1);if(v<0||v2<0)break;if(v>thr&&v2>thr){ex=r-.5;break;}}
        if(ex)pts.push({x:c.cx+ux*ex,y:c.cy+uy*ex,r:ex});}
      if(pts.length<7)return null;
      const med=pts.map(p=>p.r).sort((u,v)=>u-v)[pts.length>>1];let use=pts.filter(p=>Math.abs(p.r-med)<=med*.3);
      for(let pass=0;pass<2&&use.length>=7;pass++){let sx=0,sy=0,sxx=0,syy=0,sxy=0,sz=0,sxz=0,syz=0;const m=use.length;
        for(const p of use){const z=p.x*p.x+p.y*p.y;sx+=p.x;sy+=p.y;sxx+=p.x*p.x;syy+=p.y*p.y;sxy+=p.x*p.y;sz+=z;sxz+=p.x*z;syz+=p.y*z;}
        const A=[[sxx,sxy,sx,-sxz],[sxy,syy,sy,-syz],[sx,sy,m,-sz]];
        for(let i=0;i<3;i++){let mx=i;for(let j=i+1;j<3;j++)if(Math.abs(A[j][i])>Math.abs(A[mx][i]))mx=j;[A[i],A[mx]]=[A[mx],A[i]];if(Math.abs(A[i][i])<1e-9)return null;
          for(let j=0;j<3;j++)if(j!==i){const f=A[j][i]/A[i][i];for(let k2=i;k2<4;k2++)A[j][k2]-=f*A[i][k2];}}
        const D=A[0][3]/A[0][0],E=A[1][3]/A[1][1],F=A[2][3]/A[2][2],cx=-D/2,cy=-E/2,R2=cx*cx+cy*cy-F;if(!(R2>0))return null;const R=Math.sqrt(R2);
        const res=use.map(p=>Math.abs(Math.hypot(p.x-cx,p.y-cy)-R));const rms=Math.sqrt(res.reduce((u,v)=>u+v*v,0)/m);
        if(pass===0&&rms>R*.05){use=use.filter((p,i)=>res[i]<=rms*1.6+.5);continue;}
        if(rms>R*.09||R<c.r*.9||R>c.r*2.1)return null;return{cx,cy,r:R};}
      return null;};
    for(const c of [best.a,best.b]){const t=tire(c);if(t){c.cx=t.cx;c.cy=t.cy;c.r=t.r;c.fit=true;}else c.r=refine(c);}
    const Rm=(best.a.r+best.b.r)/2;if(!(best.a.fit&&best.b.fit&&Math.abs(best.a.r-best.b.r)>Rm*.2)){best.a.r=Rm;best.b.r=Rm;}
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

;
/* ===== vehicle-vision.js ===== */
/* Similitud visual local con el catálogo; nunca confirma por sí sola una versión. */
(() => {
  /* El motor (≈23 MB) no va dentro de la app de Android: se descarga la primera vez que se usa y queda guardado
     en el dispositivo (Cache API). En la versión web se lee de la propia carpeta. */
  const REMOTE='https://lorenzo2t2.github.io/medlom/rotulom/vendor/vision/',LOCAL=new URL('./rotulom/vendor/vision/',document.currentScript.src),CACHE='rotulom-vision-v1';
  let baseUrl,enginePromise,indexPromise,progress={done:0,total:0},blobs=new Map();
  const report=(done,total)=>{progress={done,total};window.dispatchEvent(new CustomEvent('rotulom-vision-progress',{detail:progress}));};
  async function base(){
    if(baseUrl)return baseUrl;
    try{const r=await fetch(new URL('model.json',LOCAL),{method:'HEAD'});baseUrl=r.ok?LOCAL:new URL(REMOTE);}catch{baseUrl=new URL(REMOTE);}
    if(remote())report(0,23000000);
    return baseUrl;
  }
  const remote=()=>baseUrl.href===REMOTE;
  /* Descarga con progreso; si el almacenamiento del navegador no está, se descarga sin guardar. */
  async function load(url){
    url=String(url);let store=null,hit;
    if(remote()&&window.caches){try{store=await caches.open(CACHE);hit=await store.match(url);}catch{store=null;}}
    if(hit)return hit;
    const r=await fetch(url);if(!r.ok)throw Error('Motor visual no disponible');
    if(!remote())return r;
    const len=Number(r.headers.get('content-length'))||0,reader=r.body&&r.body.getReader();let res=r;
    if(reader){const parts=[];let got=0;for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);got+=value.length;report(progress.done+value.length,progress.total+(len?0:value.length));}res=new Response(new Blob(parts),{status:200,headers:r.headers});}
    if(store){try{await store.put(url,res.clone());}catch{}}
    return res;
  }
  async function blobUrl(name){if(!blobs.has(name))blobs.set(name,URL.createObjectURL(await (await load(new URL(name,baseUrl))).blob()));return blobs.get(name);}
  async function script(name){const src=remote()?await blobUrl(name):new URL(name,baseUrl).href;return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('No se pudo abrir el motor visual'));document.head.append(s);});}
  async function engine(){
    if(!enginePromise)enginePromise=(async()=>{
      await base();
      await script('tf.min.js');await script('tf-backend-wasm.min.js');
      if(remote()){const w={};for(const n of['tfjs-backend-wasm.wasm','tfjs-backend-wasm-simd.wasm','tfjs-backend-wasm-threaded-simd.wasm'])w[n]=await blobUrl(n);tf.wasm.setWasmPaths(w);}else tf.wasm.setWasmPaths(baseUrl.href);
      tf.wasm.setThreadsCount(1);await tf.setBackend('wasm');await tf.ready();
      const net=await tf.loadLayersModel(tf.io.browserHTTPRequest(new URL('model.json',baseUrl).href,{fetchFunc:(u,o)=>load(u)}));
      const features=tf.model({inputs:net.inputs,outputs:net.getLayer('global_average_pooling2d_1').output});features.classifier=net;return features;
    })().catch(e=>{enginePromise=null;throw e;});
    return enginePromise;
  }
  function crop(image,bounds,flip=false){
    const c=document.createElement('canvas');c.width=c.height=224;const g=c.getContext('2d',{willReadFrequently:true}),b=bounds||{left:0,top:0,right:image.width,bottom:image.height},w=b.right-b.left,h=b.bottom-b.top,s=Math.min(216/w,216/h);
    g.fillStyle='#fff';g.fillRect(0,0,224,224);if(flip){g.translate(224,0);g.scale(-1,1);}g.drawImage(image,b.left,b.top,w,h,(224-w*s)/2,(224-h*s)/2,w*s,h*s);
    const pixels=g.getImageData(0,0,224,224);for(let i=0;i<pixels.data.length;i+=4){const v=Math.round(pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}g.setTransform(1,0,0,1,0,0);g.putImageData(pixels,0,0);return c;
  }
  async function embedding(image,bounds,flip=false){const model=await engine(),input=crop(image,bounds,flip),tensor=tf.tidy(()=>model.predict(tf.browser.fromPixels(input).toFloat().div(127.5).sub(1).expandDims())),data=await tensor.data();tensor.dispose();const norm=Math.hypot(...data)||1;return Array.from(data,v=>v/norm);}
  async function index(){if(!indexPromise)indexPromise=(async()=>{await base();const [meta,buffer]=await Promise.all([fetch('./rotulom/data/template-index.json').then(r=>r.json()),fetch('./rotulom/data/template-vectors.bin').then(r=>r.arrayBuffer())]);const vectors=new Float32Array(buffer);if(vectors.length!==meta.entries.length*meta.dimension)throw Error('Índice visual incompleto');return{...meta,vectors};})().catch(e=>{indexPromise=null;throw e;});return indexPromise;}
  async function suggest(image,bounds,vehicles){
    const bank=await index(),valid=new Map(vehicles.map(v=>[v.id,v])),features=[await embedding(image,bounds),await embedding(image,bounds,true)],families=new Map();
    const model=await engine(),classification=tf.tidy(()=>model.classifier.predict(tf.browser.fromPixels(crop(image,bounds)).toFloat().div(127.5).sub(1).expandDims())),prob=await classification.data();classification.dispose();const van=prob[654]+prob[656]+prob[675]+prob[757],car=prob[407]+prob[436]+prob[468]+prob[511]+prob[609]+prob[661]+prob[817];
    for(let n=0;n<bank.entries.length;n++){const v=valid.get(bank.entries[n]);if(!v)continue;let score=-1;for(const f of features){let sum=0;for(let j=0;j<bank.dimension;j++)sum+=f[j]*bank.vectors[n*bank.dimension+j];score=Math.max(score,sum);}const key=(v.make+' '+v.model).toLowerCase(),old=families.get(key);if(!old||score>old.score)families.set(key,{vehicle:v,score});}
    return [...families.values()].filter(r=>!(van>.12&&van>car*1.8)||['Furgoneta','Furgoneta con caja'].includes(r.vehicle.category)||/multivan|caravelle|tourneo|traveller|evalia|proace|spacetourer|transit|nv200|staria/i.test(r.vehicle.model)).sort((a,b)=>b.score-a.score).filter(r=>r.score>=.65).slice(0,4);
  }
  window.RotulomVision={embedding,suggest,crop};
})();

;
/* ===== catalog-photos.js ===== */
/* Plantillas exactas por versión; nunca se sustituye un vehículo por un icono. */
window.vehicleCatalogPhoto = (vehicle, compact=false) => {
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const meta=vehicle.catalogueDetails||{},personal=meta.profileImageSource==='Aportada por el usuario'&&meta.profileImageUrl;
 const cls='catalog-photo '+(compact?'compact-photo':'');
 if(personal)return `<figure class="${cls}"><img loading="lazy" src="${esc(meta.profileImageUrl)}" alt="Fotografía aportada por el usuario"><figcaption><b>Fotografía aportada por el usuario</b></figcaption></figure>`;
 const art=meta.templateArtwork,clip=art?.views?.lateral?.clip,size=art?.atlasSize;
 const valid=art&&/^[a-z0-9-]+\.webp$/.test(art.atlas)&&Array.isArray(size)&&size.length===2&&size.every(n=>Number.isFinite(n)&&n>0)&&Array.isArray(clip)&&clip.length===4&&clip.every(Number.isFinite)&&clip[0]>=0&&clip[1]>=0&&clip[2]>0&&clip[3]>0&&clip[0]+clip[2]<=size[0]&&clip[1]+clip[3]<=size[1];
 if(!valid)return `<figure class="${cls}"><div class="photo-unavailable">Plantilla no disponible</div></figure>`;
 const src=new URL('./rotulom/artwork/templates/'+art.atlas,document.baseURI).href,title='Plantilla · '+vehicle.make+' '+vehicle.model+' · '+(vehicle.variant||'');
 return `<figure class="${cls}" data-catalog-template="${esc(meta.templateId)}"><svg viewBox="${clip.join(' ')}" role="img" aria-label="${esc(title)}"><image href="${esc(src)}" width="${size[0]}" height="${size[1]}"/></svg><figcaption><b>Plantilla de esta versión</b>${compact?'':'<span>Referencia exterior nominal</span>'}</figcaption></figure>`;
};

;
/* ===== material-pricing.js ===== */
((root)=>{
  const source='https://www.clickprinting.es/';
  function defaults(){return [
    {id:'click-monomer',name:'Monomérico mate permanente · sin laminado',price:9.94,pricing:'table',points:[{area:1,total:9.94},{area:1.5,total:14.86},{area:2,total:18.85}],source:source+'impresion-vinilos-adhesivos-para-superficies-planas',notes:'Clickprinting · 12/11/2026 · Relax · Látex 720 dpi · corte rectangular · sin laminado. Sin IVA, portes ni revisión de archivos.'},
    {id:'click-monomer-laminated',name:'Monomérico mate permanente · laminado brillo UVI',price:17.82,pricing:'table',points:[{area:1,total:17.82},{area:1.5,total:26.68},{area:2,total:33.27}],source:source+'impresion-vinilos-adhesivos-para-superficies-planas',notes:'Clickprinting · 17/11/2026 · Relax · Látex 720 dpi · corte rectangular · laminado monomérico brillo con filtro UVI (el laminado mate cuesta lo mismo). Sin IVA, portes ni revisión de archivos.'},
    {id:'click-polymer',name:'Polimérico brillo trasera gris · sin laminado',price:13.70,source:source+'impresion-vinilos-adhesivos-para-superficies-planas',notes:'Clickprinting · 12/11/2026 · Relax · Látex 720 dpi · corte rectangular · sin laminado. Solo comprobado 100 × 100 cm; tarifa fija estimada para otras superficies. Sin IVA, portes ni revisión.'},
    {id:'click-polymer-laminated',name:'Polimérico brillo trasera gris · laminado brillo UVI',price:23.95,pricing:'table',points:[{area:1,total:23.95},{area:1.5,total:35.87},{area:2,total:46.04}],source:source+'impresion-vinilos-adhesivos-para-superficies-planas',notes:'Clickprinting · 17/11/2026 · Relax · Látex 720 dpi · corte rectangular · laminado polimérico brillo con filtro UVI (el laminado mate cuesta lo mismo). Sin IVA, portes ni revisión de archivos.'},
    {id:'click-cast',name:'Fundición 55 micras · sin laminado',price:21.60,pricing:'table',points:[{area:1,total:21.60},{area:1.5,total:31},{area:2,total:41.30}],source:source+'impresiones-de-vinilos-adhesivos-para-vehiculos',notes:'Clickprinting · 12/11/2026 · Relax · Látex 1200 dpi · corte rectangular · sin laminado. Sin IVA, portes ni revisión de archivos.'},
    {id:'click-cast-laminated',name:'Fundición 55 micras · laminado brillo UVI',price:42.60,source:source+'impresiones-de-vinilos-adhesivos-para-vehiculos',notes:'Clickprinting · 12/11/2026 · Relax · Látex 1200 dpi · corte rectangular · laminado fundición brillo UVI. Solo comprobado 100 × 100 cm; tarifa fija estimada para otras superficies. Sin IVA, portes ni revisión.'},
    {id:'click-perforated',name:'Microperforado para cristales de vehículos',price:17.45,source:source+'impresion-vinilos-adhesivos-microperforados-cristales',notes:'Clickprinting · 12/11/2026 · Relax · impresión UVI · corte rectangular. Solo comprobado 100 × 100 cm; tarifa fija estimada para otras superficies. Sin IVA, portes ni revisión. Revisar ficha técnica del proveedor.'}
  ].map(m=>({unit:'m²',pricing:'fixed',rollCm:0,...m}));}
  function validatePoints(points){return Array.isArray(points)&&points.length>0&&points.every((p,i)=>Number.isFinite(p.area)&&p.area>=1&&Number.isFinite(p.total)&&p.total>=0&&(!i||(p.area>points[i-1].area&&p.total>=points[i-1].total)))&&points[0].area===1;}
  function quote(m,area,pieces=1){
    if(!Number.isFinite(area)||area<=0)return{value:0,qty:0,billableArea:0,method:'empty'};
    const billableArea=Math.max(1,area);let qty=billableArea,value,method='fixed';
    if(m.unit==='unidad')qty=pieces;
    if(m.unit==='m lineal'){if(!(m.rollCm>0))return null;qty=billableArea/(m.rollCm/100);}
    if(m.unit==='m²'&&m.pricing==='table'){
      if(!validatePoints(m.points))return null;
      const points=m.points,exact=points.find(p=>Math.abs(p.area-billableArea)<1e-9),high=points.findIndex(p=>p.area>billableArea);
      if(exact){value=exact.total;method='point';}
      else if(high>0){const a=points[high-1],b=points[high];value=a.total+(b.total-a.total)*(billableArea-a.area)/(b.area-a.area);method='interpolated';}
      else{const last=points[points.length-1];value=billableArea*last.total/last.area;method='extended';}
    }else value=qty*Number(m.price);
    return{value:Math.round((value+Number.EPSILON)*100)/100,qty,billableArea,method};
  }
  const api={defaults,quote,validatePoints};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RotulomPricing=api;
})(globalThis);

;
/* ===== zone-geometry.js ===== */
(root=>{
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function move(z,dx,dy,width,height){return{x:clamp(z.x+dx,0,width-z.w),y:clamp(z.y+dy,0,height-z.h),w:z.w,h:z.h};}
  function handles(z){const x=z.x,y=z.y,r=x+z.w,b=y+z.h,c=x+z.w/2,m=y+z.h/2;return{nw:{x,y},n:{x:c,y},ne:{x:r,y},e:{x:r,y:m},se:{x:r,y:b},s:{x:c,y:b},sw:{x,y:b},w:{x,y:m}};}
  function resize(z,handle,p,width,height){let l=z.x,r=z.x+z.w,t=z.y,b=z.y+z.h;if(handle.includes('w'))l=clamp(p.x,0,width);if(handle.includes('e'))r=clamp(p.x,0,width);if(handle.includes('n'))t=clamp(p.y,0,height);if(handle.includes('s'))b=clamp(p.y,0,height);return{x:Math.min(l,r),y:Math.min(t,b),w:Math.abs(r-l),h:Math.abs(b-t)};}
  function hit(zones,p,selected,tolerance){const z=zones[selected];if(z)for(const [handle,q] of Object.entries(handles(z)))if(Math.abs(p.x-q.x)<=tolerance&&Math.abs(p.y-q.y)<=tolerance)return{index:selected,handle};for(let i=zones.length-1;i>=0;i--){const z=zones[i];if(p.x>=z.x&&p.x<=z.x+z.w&&p.y>=z.y&&p.y<=z.y+z.h)return{index:i,handle:null};}return null;}
  function pinch(start,current){const zoom=clamp(start.zoom*current.distance/Math.max(1,start.distance),100,400),scale=zoom/start.zoom;return{zoom,left:start.anchorX*start.width*scale-current.x,top:start.anchorY*start.height*scale-current.y};}
  const api={move,resize,handles,hit,pinch};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RotulomZones=api;
})(globalThis);

;
/* ===== medlom-geometry.js ===== */
/* ================= pure helpers: geometry, colors and sync dates (no app state, no DOM; tested in pruebas/) ================= */
function hexRgb(h){h=String(h||'').replace('#','');if(h.length===3)h=h.replace(/./g,'$&$&');const n=parseInt(h,16)||0;return[n>>16&255,n>>8&255,n&255]}
function rgbHex(c){return'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')}
function mixHex(a,b,t){const x=hexRgb(a),y=hexRgb(b);return rgbHex(x.map((v,i)=>v+(y[i]-v)*t))}
function relLum(h){return hexRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=relLum(a),y=relLum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
// The four chosen colors drive every other shade so text stays readable.
function colorVars(c){
  const dark=relLum(c.bg)<.2,[r,g,b]=hexRgb(c.panel),[fr,fg,fb]=hexRgb(c.fg);
  let at=c.accent;for(let i=1;i<=10&&contrast(at,c.bg)<4.5;i++)at=mixHex(c.accent,c.fg,i/10);
  return{'--bg':c.bg,'--panel':c.panel,'--raise':mixHex(c.panel,c.fg,.07),'--line':mixHex(c.panel,c.fg,.17),'--fg':c.fg,'--muted':mixHex(c.fg,c.bg,.38),
    '--accent':c.accent,'--accent-ink':contrast(c.accent,'#111111')>=contrast(c.accent,'#ffffff')?'#111111':'#ffffff','--accent-text':at,
    '--hud':`rgba(${r},${g},${b},.93)`,'--grid':`rgba(${fr},${fg},${fb},${dark?.03:.045})`,'--field':mixHex(c.fg,c.bg,.5),
    '--dim-halo':dark?'rgba(0,0,0,.72)':'rgba(255,255,255,.85)','color-scheme':dark?'dark':'light'};
}
// change date for sync: never earlier than the previous one, even if this device's clock is behind
const stamp=prev=>Math.max(Date.now(),(+prev||0)+1);
// Homography that maps the 4 points s onto the 4 points d.
function homography(s,d){
  const A=[];for(let i=0;i<4;i++){const{x,y}=s[i],{x:u,y:v}=d[i];A.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v])}
  for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];if(Math.abs(A[c][c])<1e-12)return null;
    for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let k=c;k<9;k++)A[r][k]-=f*A[c][k]}}
  return A.map((r,i)=>r[8]/r[i]);
}
const hApply=(m,q)=>{const w=m[6]*q.x+m[7]*q.y+1;return{x:(m[0]*q.x+m[1]*q.y+m[2])/w,y:(m[3]*q.x+m[4]*q.y+m[5])/w}};
function rotFit(w,h,t){const c=Math.abs(Math.cos(t)),s=Math.abs(Math.sin(t));return Math.min(w/(w*c+h*s),h/(w*s+h*c))}

window.RotulomPerspective={homography,hApply};

;
/* ===== scale-assistant.js ===== */
/* Resuelve la referencia en Material, junto al cálculo que necesita esa escala. */
window.RotulomScaleAssistant=function(target,actions){
  const panel=document.createElement('section');panel.id='scaleAssistant';panel.className='scale-assistant';panel.hidden=true;
  const title=document.createElement('h3'),status=document.createElement('p'),candidates=document.createElement('div'),fields=document.createElement('div'),vehicleLabel=document.createElement('label'),search=document.createElement('input'),vehicle=document.createElement('select'),lengthLabel=document.createElement('label'),length=document.createElement('select'),buttons=document.createElement('div'),otherFiles=document.createElement('div'),summary=document.createElement('div');
  title.id='scaleAssistantTitle';panel.setAttribute('aria-labelledby',title.id);status.setAttribute('role','status');fields.className='scale-assistant-fields';candidates.className='scale-candidates';buttons.className='workflow-actions';summary.id='materialZoneSummary';summary.className='material-zone-summary';
  vehicleLabel.textContent='Confirmar vehículo y generación';search.type='search';search.placeholder='Buscar marca o modelo';search.setAttribute('aria-label','Buscar vehículo para la escala');vehicle.id='scaleVehicle';vehicle.setAttribute('aria-label','Vehículo confirmado para calcular');vehicleLabel.append(search,vehicle);
  lengthLabel.textContent='Longitud de tu furgoneta';length.id='scaleLength';length.setAttribute('aria-label','Longitud L1 o L2 para calcular');lengthLabel.append(length);fields.append(vehicleLabel,lengthLabel);panel.append(title,status,candidates,fields,buttons,otherFiles);target.querySelector('.simple-area').before(panel,summary);
  let current=null,lastKey='';
  const option=(text,value)=>new Option(text,value);
  function fillVehicles(){const selected=current.vehicle?.id||'',terms=search.value.toLocaleLowerCase('es').split(/\s+/).filter(Boolean);vehicle.replaceChildren(option('Selecciona el vehículo',''));for(const v of current.vehicles)if(v.id===selected||terms.every(t=>(v.make+' '+v.model+' '+v.generation).toLocaleLowerCase('es').includes(t)))vehicle.add(option(v.make+' '+v.model+' · '+v.generation,v.id));vehicle.value=selected;}
  search.oninput=fillVehicles;vehicle.onchange=()=>actions.vehicle(vehicle.value);length.onchange=()=>actions.length(length.value);
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='button button-secondary';b.textContent=text;b.onclick=fn;return b;};
  function render(data){
    current=data;const key=JSON.stringify([data.vehicle?.id,data.lengthChoice,data.lengths,data.candidates,data.rows,data.pendingFiles,data.outlineCount,data.reason,data.vehicles.length]);if(key===lastKey)return;lastKey=key;
    summary.replaceChildren();for(const row of data.rows){const item=document.createElement('div'),label=document.createElement('span'),value=document.createElement('b');label.textContent=row.label;value.textContent=row.value;item.append(label,value);summary.append(item);}
    panel.hidden=!data.document||!data.reason;if(panel.hidden)return;
    const messages={vehicle:['Confirma el vehículo','Las áreas ya están marcadas. Falta confirmar el modelo para obtener su medida real; pulsa un candidato o selecciónalo abajo.'],length:['Elige la longitud L1/L2','El modelo está confirmado, pero cada longitud tiene una escala distinta. Selecciona la de tu furgoneta y se recalcularán las áreas.'],areas:['Falta añadir las áreas','Los recuadros impresos en la foto deben convertirse en áreas del cálculo. Puedes añadir los detectados o marcarlas en Editar.'],reference:['Hay que ajustar una referencia','Alguna zona queda fuera de una vista o esa vista no tiene una medida confirmada. Revisa sus extremos y su distancia real en Editar → ⚙.'],other:['Hay otro archivo sin escala','Abre el archivo pendiente para completar su referencia.']};
    const message=messages[data.reason]||messages.reference;title.textContent=message[0];status.textContent=message[1];fillVehicles();length.replaceChildren(option('Selecciona L1, L2…',''));for(const item of data.lengths)length.add(option(item.label+' · '+item.cm.toLocaleString('es-ES')+' cm',String(item.cm)));length.value=data.lengthChoice||'';lengthLabel.hidden=!data.lengths.length||!!data.vehicle?.dimensionsMm?.exteriorLength;
    candidates.replaceChildren();if(!data.vehicle)for(const id of data.candidates){const v=data.vehicles.find(v=>v.id===id);if(v)candidates.append(button(v.make+' '+v.model+' · '+v.generation,()=>actions.vehicle(id)));}
    buttons.replaceChildren();if(data.outlineCount)buttons.append(button('Añadir '+data.outlineCount+' recuadro(s) verde(s)',actions.outlines));buttons.append(button('Revisar en Editar',actions.edit));
    otherFiles.replaceChildren();for(const f of data.pendingFiles)otherFiles.append(button(f.name+' · '+f.pending+' zona(s) pendiente(s)',()=>actions.document(f.index)));
  }
  return{render};
};

;
/* ===== simple-app.js ===== */
(() => {
  const $=id=>document.getElementById(id),esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n).toLocaleString('es-ES',{maximumFractionDigits:1}),euro=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
  document.querySelector('.sidebar').innerHTML=`<a class="brand" href="#"><span class="brand-mark">R</span><span>RotuLoM</span></a><nav class="main-nav" aria-label="Secciones"><button class="nav-item active" data-view="medir"><span class="nav-icon">⌗</span><span>Cálculo de material</span></button><button class="nav-item" data-view="presupuestos"><span class="nav-icon">▤</span><span>Materiales</span></button><button class="nav-item" data-view="vehiculos"><span class="nav-icon">▣</span><span>Vehículos</span></button></nav><div class="sidebar-spacer"></div><p class="simple-side-note">Medidas en centímetros.<br>Fotos y PDF en tu dispositivo.</p>`;
  document.querySelector('.main-area').innerHTML=`<header class="topbar"><div class="breadcrumbs">RotuLoM <span>/</span><b id="currentCrumb">Cálculo de material</b></div><label class="theme-select-wrap">◐ <select id="themeSelect" aria-label="Tema"><option value="claro">Luz de taller</option><option value="grafito">Grafito</option><option value="bosque">Bosque</option><option value="azul">Azul técnico</option></select></label></header>
<section id="view-medir" class="view active"><div class="page-heading"><div><div class="eyebrow"></div><h1>Marca el diseño. Obtén su tamaño.</h1><p>Elige el vehículo y el material. La app propone la referencia y calcula en centímetros.</p></div><label class="button button-primary" for="designFiles">＋ Subir foto o PDF<input id="designFiles" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden></label></div><div class="simple-steps"><span><b>1</b> Foto y vehículo</span><span><b>2</b> Marca la zona</span><span><b>3</b> Elige material</span></div><div id="documentTabs" class="measurement-docs"></div><div class="simple-workspace"><section class="panel simple-photo-panel"><div class="simple-vehicle-fields"><div class="field"><label for="vehicleFind">Buscar vehículo</label><input id="vehicleFind" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="vehicleSuggestions" autocomplete="off" placeholder="Ej. Ford Transit o SEAT León 2018"><div id="vehicleSuggestions" class="vehicle-suggestions" role="listbox" aria-label="Modelos y versiones" hidden></div></div><div class="field"><label for="designVehicle">Modelo y versión</label><select id="designVehicle"><option value="">Selecciona el vehículo</option></select></div><div class="field"><label for="photoSide">Vista de la foto</label><select id="photoSide"><option value="lateral">Lateral · vehículo completo</option><option value="trasera">Trasera</option><option value="delantera">Delantera</option><option value="superior">Superior</option></select></div><div class="field" id="lengthChoiceField" hidden><label for="lengthChoice">Longitud de esta furgoneta</label><select id="lengthChoice"><option value="">Selecciona L1, L2…</option></select></div></div><button id="photoEmpty" type="button" class="upload-zone" aria-label="Subir una foto o un PDF"><span class="upload-symbol" aria-hidden="true">↑</span><b>Toca para subir una foto o un PDF</b><span>Si es una foto, mejor de perfil y con el vehículo completo.</span></button><div id="photoEditor" hidden><div class="simple-photo-toolbar"><b id="documentName"></b><button class="text-button" id="removeDocument">Quitar</button></div><div id="pdfOptions" class="measurement-toolbar" hidden><button class="tool-button" id="pdfPrevious">←</button><span id="pdfPageInfo"></span><button class="tool-button" id="pdfNext">→</button><label>Escala 1:<input id="pdfScale" type="number" min="0.01" max="1000" value="1"></label><select id="pdfMode" aria-label="Tipo de PDF"><option value="art">Arte final a escala</option><option value="mockup">Mockup de vehículo</option></select><button class="text-button" id="wholePdf">Toda la página</button></div><div id="imageWorkspace"><div class="measurement-toolbar"><button id="drawZone" class="tool-button">▱ Marcar zona</button><button id="editZones" class="tool-button">✥ Editar zonas</button><button id="panImage" class="tool-button">✋ Desplazar vista</button><button id="fixReference" class="tool-button">↔ Ajustar extremos del vehículo</button><button id="clearZones" class="text-button">Borrar zonas</button></div><div class="zoom-toolbar" role="group" aria-label="Ampliación de imagen o PDF"><button id="zoomOut" class="tool-button" aria-label="Reducir zoom">−</button><input id="imageZoom" type="range" min="100" max="400" step="25" value="100" aria-label="Zoom de la vista"><output id="zoomLabel" for="imageZoom">100%</output><button id="zoomIn" class="tool-button" aria-label="Aumentar zoom">＋</button><button id="zoomFit" class="text-button">Ajustar</button><button id="expandImage" class="tool-button" aria-pressed="false">Ampliar área</button><button id="finishEditing" class="button button-primary">Material →</button></div><details class="simple-reference-details" id="planeTools"><summary>Corregir perspectiva con un panel plano</summary><p>Introduce las medidas reales del panel en cm. Marca sus esquinas en orden: superior izquierda, superior derecha, inferior derecha e inferior izquierda. El diseño debe estar en el mismo plano; no corrige la curvatura de la carrocería.</p><div class="simple-vehicle-fields"><label>Ancho real (cm)<input id="planeWidth" type="number" min="0.1" step="0.1"></label><label>Alto real (cm)<input id="planeHeight" type="number" min="0.1" step="0.1"></label></div><button id="markPlane" class="tool-button">Marcar las cuatro esquinas</button><button id="clearPlane" class="text-button">Usar referencia del vehículo</button></details><label class="simple-photo-note"><input id="confirmReference" type="checkbox"> He revisado la versión del vehículo y su referencia, o la escala del PDF</label><p id="referenceStatus" class="simple-ref-status" role="status"></p><div class="measurement-stage" id="imageStage"><canvas id="designCanvas" tabindex="0" aria-label="Imagen o PDF. Pulsa Marcar zona para dibujar. Mantén pulsada una zona para editarla con sus asas. Arrastra para desplazar la vista. Flechas para mover; Suprimir para borrar."></canvas></div></div><p class="simple-photo-note">Pellizca con dos dedos para ampliar fotos o PDF. Arrastra con un dedo para mover la vista y mantén pulsada una zona para editarla. La línea naranja representa la referencia. Revisa sus extremos. Las medidas de una foto son aproximadas por la perspectiva y la curvatura.</p><details class="simple-reference-details"><summary>Corregir una referencia conocida</summary><div class="field"><label for="manualCm">Distancia real entre los dos puntos (cm)</label><input id="manualCm" type="number" min="0.1" step="0.1" placeholder="Ej. 52"></div><button id="manualReference" class="button button-secondary">Marcar los dos puntos</button></details></div></section><aside class="panel simple-result-panel"><div class="eyebrow">MEDIDAS DEL DISEÑO</div><div id="designZones" class="simple-zone-list"><p>Sube la foto, elige el vehículo y marca la zona.</p></div><div class="simple-area"><span>Superficie total</span><b id="designArea">—</b><small id="designAreaM2"></small></div><h2>Material y precio</h2><div class="field"><label for="designMaterial">Material</label><select id="designMaterial"><option value="">Añade tu primer material</option></select></div><button id="goMaterials" class="text-button">＋ Añadir o editar materiales</button><div class="material-price-info"><p id="selectedMaterialPrice" class="simple-photo-note"></p><button type="button" id="materialInfo" class="material-info-button" aria-label="Información del material" aria-haspopup="dialog" hidden>?</button></div><details class="simple-reference-details"><summary>Margen de material</summary><div class="field"><label for="materialWaste">Desperdicio (%)</label><input id="materialWaste" type="number" min="0" max="100" value="0"></div></details><div class="price-total"><span>Coste de material</span><strong id="designCost">—</strong></div><p id="costExplanation" class="simple-photo-note">Selecciona un material para calcular su coste sin IVA.</p><button id="copyCalculation" class="button button-primary wide" disabled>Copiar cálculo</button><p id="simpleMessage" class="measurement-hint" role="status"></p></aside></div></section>
<section id="view-presupuestos" class="view"><div class="page-heading"><div><div class="eyebrow">TU BIBLIOTECA</div><h1>Materiales y precios</h1><p>Añade tus materiales y selecciónalos al medir el diseño.</p></div><button class="button button-secondary" id="backToCalculation">Volver al cálculo</button></div><section class="panel material-panel simple-material-form"><form id="simpleMaterialForm" class="form-grid"><input type="hidden" id="editMaterialId"><div class="field span-2"><label for="materialName">Nombre</label><input id="materialName" required maxlength="100" placeholder="Ej. Vinilo blanco"></div><div class="field"><label for="materialPrice">Precio de compra sin IVA (€)</label><input id="materialPrice" type="number" min="0" step="0.01" required placeholder="0,00"></div><div class="field"><label for="materialUnit">Precio por</label><select id="materialUnit"><option value="m²">m²</option><option value="m lineal">Metro lineal</option><option value="unidad">Unidad</option></select></div><div class="field" id="rollWidthField" hidden><label for="materialRollCm">Ancho de bobina (cm)</label><input id="materialRollCm" type="number" min="0.1" step="0.1" placeholder="Ej. 152"></div><div class="field"><label for="materialPricing">Forma de calcular</label><select id="materialPricing"><option value="fixed">Precio fijo por unidad de cobro</option><option value="table">Tabla de precios por superficie</option></select></div><div class="span-2" id="priceTableField" hidden><p>Precio total sin IVA para cada superficie. Mínimo 1 m². Entre puntos se interpola; por encima del último se mantiene su precio por m². Son estimaciones, no una conexión con el proveedor.</p><div id="materialPriceRows"></div><button type="button" id="addPricePoint" class="text-button">＋ Añadir superficie</button></div><div class="field span-2"><label for="materialNotes">Notas y condiciones</label><textarea id="materialNotes" rows="3" maxlength="1500"></textarea></div><p id="materialFormMessage" class="span-2 measurement-hint" role="status"></p><button class="button button-primary" type="submit">Guardar material</button><button class="button button-secondary" id="newMaterial" type="button">Nuevo material</button></form><div id="simpleMaterialsList" class="material-library"></div></section></section>
<section id="view-vehiculos" class="view"><div class="page-heading"><div><div class="eyebrow">CATÁLOGO DE TRABAJO</div><h1>Vehículos y medidas</h1><p>Utilitarios y furgonetas. Sin deportivos ni modelos de lujo.</p></div></div><p id="simpleCoverage" class="simple-photo-note"></p><div class="catalog-toolbar"><div class="search-box"><input id="catalogFind" type="search" placeholder="Buscar modelo o año…"></div><select id="simpleMake" aria-label="Marca"><option value="">Todas las marcas</option></select><select id="simpleCategory" aria-label="Categoría"><option value="">Todos</option><option value="Coche">Coches</option><option value="Furgoneta">Furgonetas</option><option value="Furgoneta con caja">Con caja</option></select></div><div id="simpleVehicleGrid" class="vehicle-grid"></div><div id="simplePagination" class="catalog-pagination"></div></section>`;
  const workflowLabels=['Vehículo y archivo','Editar','Material'];
  document.querySelector('.main-nav').innerHTML=workflowLabels.map((label,i)=>`<button class="nav-item ${i===0?'active':''}" data-view="medir" data-step="${i}" title="${i+1}. ${label}"><span class="nav-icon">${i+1}</span><span>${label}</span></button>`).join('');
  document.querySelector('.theme-select-wrap').hidden=true;
  const workflow=$('view-medir'),heading=workflow.querySelector('.page-heading'),photoPanel=workflow.querySelector('.simple-photo-panel'),resultPanel=workflow.querySelector('.simple-result-panel'),vehicleFields=workflow.querySelector('.simple-vehicle-fields');
  heading.querySelector('.eyebrow')?.remove();heading.querySelector('h1').textContent='Elige tu vehículo y abre el archivo.';heading.querySelector('p').textContent='Elige la versión para usar su plantilla o sube tu propio archivo.';
  workflow.querySelector('.simple-steps').remove();
  const tabs=document.createElement('div');tabs.className='workflow-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Pasos del cálculo');tabs.innerHTML=workflowLabels.map((label,i)=>`<button id="workflowTab${i}" type="button" role="tab" aria-controls="workflowStep${i}" data-workflow="${i}"><b>${i+1}</b> ${label}</button>`).join('');workflow.prepend(tabs);
  const steps=workflowLabels.map((label,i)=>{const step=document.createElement('section');step.id='workflowStep'+i;step.className='workflow-step';step.setAttribute('role','tabpanel');step.setAttribute('aria-labelledby','workflowTab'+i);workflow.append(step);return step;});
  const templatePicker=document.createElement('div');templatePicker.className='workflow-actions';templatePicker.hidden=true;
  templatePicker.innerHTML='<label class="field">Vista de la plantilla<select id="templateView"><option value="lateral">Lateral</option><option value="frontal">Frontal</option><option value="trasera">Trasera</option><option value="superior">Superior</option></select></label><button id="useVehicleTemplate" type="button" class="button button-primary">Abrir plantilla</button><span id="templateLoadStatus" role="status"></span>';
  steps[0].append(heading,vehicleFields,templatePicker,$('photoEmpty'));const selectedFile=document.createElement('p');selectedFile.id='fileSelected';selectedFile.className='simple-photo-note';selectedFile.textContent='Todavía no has abierto ningún archivo.';steps[0].append(selectedFile);
  const preview=document.createElement('button');preview.id='filePreview';preview.type='button';preview.hidden=true;preview.setAttribute('aria-label','Ver la imagen o el PDF en el editor');preview.innerHTML='<canvas id="filePreviewCanvas"></canvas><span>Vista previa · tocar para editar</span>';steps[0].append(preview);preview.onclick=()=>showStep(1);
  const recognition=document.createElement('section');recognition.id='vehicleRecognition';recognition.hidden=true;recognition.innerHTML='<p id="recognitionStatus" role="status"></p><div id="vehicleCandidates"></div><small>Comparación visual en este dispositivo. Confirma modelo, generación y carrocería; si no coincide, selecciónalo manualmente.</small>';steps[0].append(recognition);
  function refreshPreview(){const d=current();preview.hidden=!d;if(!d)return;const c=$('filePreviewCanvas'),scale=Math.min(620/d.image.width,420/d.image.height,1);c.width=Math.round(d.image.width*scale);c.height=Math.round(d.image.height*scale);c.getContext('2d').drawImage(d.image,0,0,c.width,c.height);}
  const normTxt=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function nameMatches(text){const t=' '+normTxt(text)+' ',found=[];for(const v of state.vehicles){const mk=normTxt(v.make).split(' ');let core=normTxt(v.model).split(' ');while(core.length>1&&mk.includes(core[0]))core.shift();core=core.join(' ');if(core.length<3||!t.includes(' '+core+' '))continue;found.push({v,score:core.length+(mk.some(w=>w.length>2&&t.includes(' '+w+' '))?5:0)});}
    const top=Math.max(0,...found.map(f=>f.score));return found.filter(f=>f.score===top).map(f=>f.v).sort((a,b)=>(b.dimensionsMm?.exteriorLength?1:0)-(a.dimensionsMm?.exteriorLength?1:0)||(b.yearFrom||b.catalogueDetails?.referenceYear||0)-(a.yearFrom||a.catalogueDetails?.referenceYear||0));}
  const pdfTexts=new WeakMap();
  async function cacheTexts(pdf){const out=[];try{for(let i=1;i<=Math.min(pdf.numPages,40);i++){const c=await(await pdf.getPage(i)).getTextContent();out.push(c.items.map(x=>x.str).join(' ').slice(0,3000));}}catch{}pdfTexts.set(pdf,out);return out;}
  const vkey=v=>v.make+'|'+v.model;
  function docMatches(d){const texts=d.kind==='pdf'?pdfTexts.get(d.pdf)||[]:[],own=nameMatches((texts[d.page-1]||'')+(d.kind!=='pdf'||d.page===1?' '+d.name:''));if(own.length||d.kind!=='pdf')return own;
    const all=texts.map(t=>nameMatches(t)).filter(a=>a.length),keys=new Set(all.map(a=>vkey(a[0])));return keys.size===1?all[0]:[];}
  const vlabel=v=>v.make+' '+v.model+' · '+v.generation;
  function docTitle(doc){const v=state.vehicles.find(x=>x.id===doc.vehicle);return (v?v.make+' '+v.model:'Vehículo sin elegir')+(doc.kind==='pdf'&&doc.pdf.numPages>1?' · página '+doc.page:'')+(!v&&state.docs.length>1?' · '+doc.name:'');}

  async function identifyVehicle(d){recognition.hidden=false;$('vehicleCandidates').replaceChildren();
    const named=docMatches(d),pick=v=>{$('vehicleFind').value='';updateVehicleOptions();$('designVehicle').value=v.id;d.vehicle=v.id;d.lengthChoice='';renderLengthChoices();applyAuto();window.rotulomUpdatePager&&window.rotulomUpdatePager();$('recognitionStatus').textContent='Seleccionado: '+v.make+' '+v.model+'. Revisa la generación y versión.';};
    if(named.length){for(const v of named.slice(0,5)){const b=document.createElement('button');b.type='button';b.className='vehicle-candidate';b.textContent=v.make+' '+v.model+' · '+v.generation;b.onclick=()=>pick(v);$('vehicleCandidates').append(b);}
      if(!d.vehicle)pick(named[0]);$('recognitionStatus').textContent='Nombre detectado en el documento: '+named[0].make+' '+named[0].model+(d.vehicle===named[0].id?'. Seleccionado automáticamente; revisa la versión.':'. Elige la versión correcta.');results();return;}
const status=$('recognitionStatus'),onDl=e=>{const p=e.detail;if(p.total&&p.done<p.total)status.textContent='Descargando el motor de reconocimiento (solo la primera vez): '+Math.min(99,Math.round(p.done*100/p.total))+' %';};status.textContent='Buscando modelos parecidos en este dispositivo…';window.addEventListener('rotulom-vision-progress',onDl);try{const boxes=d.viewBoxes||[],bounds=boxes.filter(b=>b.kind==='lateral').sort((a,b)=>(b.right-b.left)*(b.bottom-b.top)-(a.right-a.left)*(a.bottom-a.top))[0]||d.extent;const candidates=await window.RotulomVision.suggest(d.image,bounds,state.vehicles);if(current()!==d)return;d.recognitionCandidates=candidates.map(c=>c.vehicle.id);$('recognitionStatus').textContent=candidates.length?'No hay un reconocimiento seguro. Estos modelos se parecen visualmente; confirma el correcto.':'No hay una coincidencia visual clara. Selecciona el vehículo manualmente.';for(const {vehicle:v} of candidates){const b=document.createElement('button');b.type='button';b.className='vehicle-candidate';b.textContent=v.make+' '+v.model+' · '+v.generation;b.onclick=()=>{$('vehicleFind').value='';updateVehicleOptions();$('designVehicle').value=v.id;d.vehicle=v.id;d.lengthChoice='';renderLengthChoices();applyAuto();$('recognitionStatus').textContent='Seleccionado: '+v.make+' '+v.model+'. Revisa la generación y versión.';};$('vehicleCandidates').append(b);}results();}catch{if(current()===d)$('recognitionStatus').textContent=navigator.onLine===false?'No se pudo abrir el reconocimiento local. Selecciona el vehículo manualmente.':'No se pudo comparar esta imagen. Puedes seleccionar el vehículo manualmente.';}finally{window.removeEventListener('rotulom-vision-progress',onDl);}}

  const vehicleTools=document.createElement('div');vehicleTools.className='workflow-actions';vehicleTools.innerHTML='<button id="browseVehicleCatalog" class="button button-secondary">Ver catálogo de vehículos</button><button class="button button-primary" data-next-step="1">Continuar → Editar</button>';steps[0].append(vehicleTools);
  steps[1].innerHTML='<div class="page-heading"><div><h1>Edita la foto o el PDF.</h1><p>Arrastra con un dedo para mover la vista. Mantén pulsada una zona para editarla; pellizca con dos dedos para ampliar.</p></div></div><p id="emptyEditor" class="simple-photo-note">Abre una foto o un PDF en la primera pestaña para empezar.</p>';
  steps[1].append($('documentTabs'),photoPanel,$('designZones'));const editActions=document.createElement('div');editActions.className='workflow-actions';editActions.innerHTML='<button class="button button-secondary" data-next-step="0">← Vehículo y archivo</button><button class="button button-primary" data-next-step="2">Material →</button>';steps[1].append(editActions);
  steps[2].innerHTML='<div class="page-heading"><div><h1>Material</h1><p>Elige el material para calcular el coste de las áreas marcadas.</p></div></div>';const unitsBox=document.createElement('section');unitsBox.id='zoneUnits';unitsBox.className='zone-units';steps[2].append(unitsBox,resultPanel);const back=document.createElement('button');back.className='button button-secondary';back.dataset.nextStep='1';back.textContent='← Volver a editar áreas';steps[2].append(back);
  workflow.querySelector('.simple-workspace').remove();
  const state={step:0,vehicles:[],docs:[],active:-1,mode:'pan',drag:null,selected:-1,page:1,pdf:null,busy:false};
  let materials=[];try{materials=JSON.parse(localStorage.getItem('rotulom-materials')||'[]').map(m=>({...m,rollCm:m.rollCm||((Number(m.roll)||0)*100)}));}catch{}
  try{if(localStorage.getItem('rotulom-clickprinting-v2')!=='1'){materials.push(...pricing.defaults().filter(d=>!materials.some(m=>m.id===d.id)));localStorage.setItem('rotulom-materials',JSON.stringify(materials));localStorage.setItem('rotulom-clickprinting-v1','1');localStorage.setItem('rotulom-clickprinting-v2','1');}}catch{}
  const pricing=window.RotulomPricing;
  const canvas=$('designCanvas'),ctx=canvas.getContext('2d'),current=()=>state.docs[state.active];
  const tell=text=>$('simpleMessage').textContent=text;
  const view=name=>{document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));document.querySelectorAll('[data-view]').forEach(v=>v.classList.toggle('active',v.dataset.view===name&&(!v.hasAttribute('data-step')||Number(v.dataset.step)===state.step)));$('currentCrumb').textContent={medir:workflowLabels[state.step],presupuestos:'Materiales',vehiculos:'Vehículos'}[name];};
  function showStep(i){finishDrag(true);state.step=i;steps.forEach((step,n)=>step.hidden=n!==i);document.querySelectorAll('[data-workflow]').forEach(b=>{const active=Number(b.dataset.workflow)===i;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});view('medir');$('emptyEditor').hidden=!!current();if(i===1&&current()){draw();if(!$('imageWorkspace').classList.contains('expanded'))$('expandImage').click();}else if($('imageWorkspace').classList.contains('expanded'))$('expandImage').click();window.scrollTo({top:0,behavior:'smooth'});}
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>b.hasAttribute('data-step')?showStep(Number(b.dataset.step)):view(b.dataset.view));
  workflow.onclick=e=>{const next=e.target.closest('[data-next-step]');if(next)showStep(Number(next.dataset.nextStep));};document.querySelectorAll('[data-workflow]').forEach(b=>b.onclick=e=>{e.stopPropagation();showStep(Number(b.dataset.workflow));});
  tabs.onkeydown=e=>{const b=e.target.closest('[data-workflow]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?2:(state.step+(e.key==='ArrowRight'?1:2))%3;showStep(i);$('workflowTab'+i).focus();};
  $('browseVehicleCatalog').onclick=()=>view('vehiculos');
  $('goMaterials').onclick=()=>{document.querySelector('[data-view="ajustes"]').click();$('view-presupuestos').scrollIntoView({behavior:'smooth'});};$('backToCalculation').onclick=()=>showStep(2);
  const savedTheme=localStorage.getItem('rotulom-theme')||'claro';document.body.dataset.theme=savedTheme;$('themeSelect').value=savedTheme;$('themeSelect').onchange=()=>{document.body.dataset.theme=$('themeSelect').value;localStorage.setItem('rotulom-theme',$('themeSelect').value);};
  function lengthOptions(v){const out=[];for(const table of v?.catalogueDetails?.sizeTables||[]){const headers=table[0]||[];for(const row of table)if(/exterior length.*\(mm\)/i.test(row[0]||''))for(let i=1;i<row.length;i++){const label=headers[i]||'',n=Number(String(row[i]).replace(/[,\s]/g,''));if(/^(L\d|SWB|MWB|LWB|XLWB|short|medium|long|compact|standard)/i.test(label)&&n>1500&&n<10000&&!out.some(x=>x.label===label))out.push({label,cm:n/10});}}return out;}
  function updateVehicleOptions(){const q=$('vehicleFind').value.toLocaleLowerCase('es').split(/\s+/).filter(Boolean),keep=current()?.vehicle||$('designVehicle').value;const list=state.vehicles.filter(v=>v.id===keep||q.every(t=>`${v.make} ${v.model} ${v.generation}`.toLocaleLowerCase('es').includes(t)));$('designVehicle').innerHTML='<option value="">Selecciona el vehículo</option>'+list.map(v=>`<option value="${esc(v.id)}">${esc(v.make+' '+v.model+' · '+v.generation)}</option>`).join('');$('designVehicle').value=keep||'';}
  function closeVehicleSuggestions(){$('vehicleSuggestions').hidden=true;$('vehicleFind').setAttribute('aria-expanded','false');$('vehicleFind').removeAttribute('aria-activedescendant');}
  function showVehicleSuggestions(){const q=$('vehicleFind').value.trim().toLocaleLowerCase('es').split(/\s+/).filter(Boolean);if(!q.length){closeVehicleSuggestions();return;}const matches=state.vehicles.filter(v=>q.every(t=>`${v.make} ${v.model} ${v.generation}`.toLocaleLowerCase('es').includes(t))),list=matches.slice(0,40);$('vehicleSuggestions').innerHTML=list.length?list.map((v,i)=>`<button type="button" role="option" aria-selected="false" id="vehicleSuggestion${i}" data-choose-vehicle="${esc(v.id)}"><b>${esc(v.make+' '+v.model)}</b><small>${esc(v.generation)} · ${esc(v.category)}</small></button>`).join('')+(matches.length>40?'<p>Hay más versiones. Añade el año o la carrocería para afinar.</p>':''):'<p>No hay coincidencias. Prueba otra marca, modelo o año.</p>';$('vehicleSuggestions').hidden=false;$('vehicleFind').setAttribute('aria-expanded','true');}
  function chooseVehicle(id){const v=state.vehicles.find(v=>v.id===id);if(!v)return;$('vehicleFind').value=`${v.make} ${v.model} ${v.generation}`;updateVehicleOptions();$('designVehicle').value=id;$('designVehicle').dispatchEvent(new Event('change'));closeVehicleSuggestions();}
  $('vehicleFind').onfocus=showVehicleSuggestions;
  $('vehicleFind').onkeydown=e=>{if(e.key==='Escape'){closeVehicleSuggestions();return;}if(!['ArrowDown','ArrowUp','Enter'].includes(e.key)||$('vehicleSuggestions').hidden)return;const options=[...$('vehicleSuggestions').querySelectorAll('[data-choose-vehicle]')],active=options.findIndex(o=>o.id===$('vehicleFind').getAttribute('aria-activedescendant'));if(!options.length)return;e.preventDefault();if(e.key==='Enter'){if(active>=0)chooseVehicle(options[active].dataset.chooseVehicle);return;}const next=options[active<0?(e.key==='ArrowDown'?0:options.length-1):(active+(e.key==='ArrowDown'?1:-1)+options.length)%options.length];options.forEach(o=>o.setAttribute('aria-selected',String(o===next)));$('vehicleFind').setAttribute('aria-activedescendant',next.id);next.scrollIntoView({block:'nearest'});};
  $('vehicleSuggestions').onclick=e=>{const b=e.target.closest('[data-choose-vehicle]');if(b)chooseVehicle(b.dataset.chooseVehicle);};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#vehicleSuggestions')&&e.target!==$('vehicleFind'))closeVehicleSuggestions();});
  function sourceVehicle(){return state.vehicles.find(v=>v.id===(current()?.vehicle||$('designVehicle').value));}
  function renderLengthChoices(){const d=current(),v=sourceVehicle(),options=lengthOptions(v);$('lengthChoiceField').hidden=!options.length||!!v?.dimensionsMm?.exteriorLength;$('lengthChoice').innerHTML='<option value="">Selecciona L1, L2… de tu unidad</option>'+options.map(o=>`<option value="${o.cm}">${esc(o.label)} · ${fmt(o.cm)} cm</option>`).join('');$('lengthChoice').value=d?.lengthChoice||'';}
  function isArt(d){return d?.kind==='pdf'&&d.pdfMode!=='mockup';}
  function analyzeViews(d){if(d.analysisVersion===3)return;const pixels=d.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,d.image.width,d.image.height),old=d.sheetRefs||[];d.viewBoxes=window.RotulomSheet.views(pixels);d.outlineCandidates=window.RotulomSheet.outlines(pixels).filter(z=>d.viewBoxes.some(b=>Math.max(0,Math.min(z.x+z.w,b.right)-Math.max(z.x,b.left))*Math.max(0,Math.min(z.y+z.h,b.bottom)-Math.max(z.y,b.top))/(z.w*z.h)>.85));d.analysisVersion=3;if(old.length){d.sheetRefs=window.RotulomSheet.references(d.viewBoxes,state.vehicles.find(v=>v.id===d.vehicle),d.lengthChoice);for(const ref of d.sheetRefs){const previous=old.find(r=>Math.abs(r.left-ref.left)<d.image.width*.07&&Math.abs(r.right-ref.right)<d.image.width*.07&&Math.abs(r.top-ref.top)<d.image.height*.07);if(previous?.knownCm>0){ref.knownCm=previous.knownCm;ref.points=previous.points;ref.manual=previous.manual;}}}}
  function unusedOutlines(d){return(d?.outlineCandidates||[]).filter(a=>!d.zones.some(b=>{const shared=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return shared/Math.min(a.w*a.h,b.w*b.h)>.85;}));}
  function addOutlines(){const d=current();if(!d)return;d.zones.push(...unusedOutlines(d).map(z=>({...z})));d.referenceConfirmed=false;draw();}
  function selectVehicle(id){const d=current();$('vehicleFind').value='';updateVehicleOptions();$('designVehicle').value=id;if(d){d.vehicle=id;d.lengthChoice='';}renderLengthChoices();applyAuto();}
  const scaleAssistant=window.RotulomScaleAssistant(resultPanel,{vehicle:selectVehicle,length:value=>{if(current())current().lengthChoice=value;$('lengthChoice').value=value;applyAuto();},outlines:addOutlines,edit:()=>{showStep(1);if($('editorOptions').hidden)$('editorOptionsToggle').click();},document:index=>{activate(index);showStep(2);}});
  function renderScaleAssistant(){const d=current(),v=sourceVehicle(),lengths=lengthOptions(v),pendingFiles=[];for(const [index,doc] of state.docs.entries()){const pending=doc.zones.filter(z=>!measured(doc,z)).length;if(pending&&doc!==d)pendingFiles.push({index,name:doc.name,pending});}const missing=d?.zones.some(z=>!measured(d,z));let reason='';if(d){if(!d.zones.length)reason='areas';else if(missing&&!v&&!ratio(d))reason='vehicle';else if(missing&&lengths.length&&!d.lengthChoice&&!v?.dimensionsMm?.exteriorLength)reason='length';else if(missing)reason='reference';else if(pendingFiles.length)reason='other';}scaleAssistant.render({document:!!d,vehicle:v,vehicles:state.vehicles,lengths,lengthChoice:d?.lengthChoice||'',candidates:d?.recognitionCandidates||[],outlineCount:unusedOutlines(d).length,reason,pendingFiles,rows:state.docs.flatMap(doc=>doc.zones.map((z,i)=>{const m=measured(doc,z);return{label:doc.name+' · zona '+(i+1),value:m?fmt(m.width)+' × '+fmt(m.height)+' cm':'Pendiente de referencia'};}))});}

  function applyAuto(){updateTemplatePicker();const d=current();
    if(d?.templatePlane&&d.vehicle===d.templateVehicle){
      d.plane=structuredClone(d.templatePlane);d.points=[];d.knownCm=0;d.manual=false;d.referenceConfirmed=false;draw();return;
    }
    if(!d)return;if(isArt(d)){draw();return;}const v=sourceVehicle();d.knownCm=0;d.points=[];d.manual=false;d.refNote='';d.plane=null;d.referenceConfirmed=false;setMode('pan');
    analyzeViews(d);d.sheetRefs=d.viewBoxes.length>1?window.RotulomSheet.references(d.viewBoxes,v,d.lengthChoice):[];
    if(d.sheetRefs.length){if(d.sheetRefs.some(r=>!(r.knownCm>0)))estimateDoc(d);$('manualCm').value='';draw();return;}
    let cm=0;if(d.side==='lateral')cm=(v?.dimensionsMm?.exteriorLength||0)/10||Number(d.lengthChoice)||0;else if(/sin retrovisores/i.test(v?.catalogueDetails?.widthConvention||''))cm=(v.dimensionsMm?.exteriorWidth||0)/10;
    if(cm&&d.extent){d.knownCm=cm;const y=Math.min(d.image.height-12,d.extent.bottom+10);d.points=[{x:d.extent.left,y},{x:d.extent.right,y}];$('manualCm').value=cm;}else if(!cm&&d.extent&&d.side==='lateral')estimateDoc(d);
    draw();
  }
  function estimateDoc(d,force){if(!d||isArt(d))return false;const wc=d.wheelCm||72,px=d.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,d.image.width,d.image.height);
    if(d.sheetRefs?.length){for(const r of d.sheetRefs)if(force||r.estimated){r.knownCm=0;r.estimated=false;r.manual=false;}return window.RotulomSheet.estimate(px,d.sheetRefs,wc);}
    if(!d.extent||d.side!=='lateral'||(d.manual&&!force))return false;const w=window.RotulomSheet.wheels(px,d.extent);if(!w)return false;const cm=(d.extent.right-d.extent.left)*wc/w.diameter,y=Math.min(d.image.height-12,d.extent.bottom+10);d.knownCm=cm;d.points=[{x:d.extent.left,y},{x:d.extent.right,y}];d.wheelCircles=w.circles;d.refNote='ruedas detectadas (≈'+wc+' cm de diámetro)';d.estimatedScale=true;$('manualCm').value=Math.round(cm);return true;}
  function ratio(d){if(isArt(d))return{x:d.widthCm*d.factor/d.image.width,y:d.heightCm*d.factor/d.image.height};const distance=d.points.length===2?Math.hypot(d.points[1].x-d.points[0].x,d.points[1].y-d.points[0].y):0;return distance>2&&d.knownCm>0?{x:d.knownCm/distance,y:d.knownCm/distance}:null;}
  function nominalScale(d) {
    return !!(d.plane && d.templatePlane && d.vehicle===d.templateVehicle && !d.manual
      && JSON.stringify(d.plane)===JSON.stringify(d.templatePlane));
  }
  function planeTransform(plane) {
    if(!plane||plane.pts.length!==4||!(plane.width>0&&plane.height>0))return null;
    const signs=plane.pts.map((a,i)=>{
      const b=plane.pts[(i+1)%4],c=plane.pts[(i+2)%4];
      return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    });
    if(!signs.every(n=>n>1e-6)&&!signs.every(n=>n< -1e-6))return null;
    return window.RotulomPerspective.homography(plane.pts,[{x:0,y:0},{x:plane.width,y:0},{x:plane.width,y:plane.height},{x:0,y:plane.height}]);
  }
  function scaleLabel(d) {
    if(isArt(d))return '';
    if(d.plane) {
      if(!planeTransform(d.plane))return 'Plano sin completar';
      return nominalScale(d)?'Escala nominal':'Escala de perspectiva';
    }
    if(d.sheetRefs?.length)return d.sheetRefs.some(r=>r.scale>0)?'Escala por vista':'Sin escala';
    return ratio(d)?'Escala de referencia':'Sin escala';
  }
  function planeMeasurement(d,z){const g=window.RotulomPerspective,m=planeTransform(d.plane);if(!m)return null;const points=[{x:z.x,y:z.y},{x:z.x+z.w,y:z.y},{x:z.x+z.w,y:z.y+z.h},{x:z.x,y:z.y+z.h}].map(p=>g.hApply(m,p));if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),width=(dist(points[0],points[1])+dist(points[3],points[2]))/2,height=(dist(points[0],points[3])+dist(points[1],points[2]))/2;return{width,height,area:width*height/10000*(z.copies||1)};}
  function measured(d,z){if(!isArt(d)&&d.plane)return planeMeasurement(d,z);const ref=d.sheetRefs?.length?window.RotulomSheet.forZone(d.sheetRefs,z):null;const r=d.sheetRefs?.length?(ref?{x:ref.scale,y:ref.scale}:null):ratio(d);return r?{width:z.w*r.x,height:z.h*r.y,area:z.w*r.x*z.h*r.y/10000*(z.copies||1)}:null;}
  function total(){let area=0,pending=0,pieces=0;for(const d of state.docs)for(const z of d.zones){const m=measured(d,z);if(m){area+=m.area;pieces+=z.copies||1;}else pending++;}return{area,pending,pieces};}
  const dims=(m,n)=>fmt(m.width)+' × '+fmt(m.height)+' cm'+(n>1?' × '+n:'');
  const vehMat={};
  function vehicleCosts(){const base=materials.find(m=>m.id===$('designMaterial').value),waste=Math.max(0,Math.min(100,Number($('materialWaste').value)||0)),groups=new Map();if(!base)return[];
    for(const d of state.docs){if(!d.zones.length)continue;const v=state.vehicles.find(x=>x.id===d.vehicle),key=v?v.id:'doc:'+d.name,g=groups.get(key)||{key,title:v?v.make+' '+v.model:d.name,area:0,pieces:0,pending:0};
      for(const z of d.zones){const m=measured(d,z);if(m){g.area+=m.area;g.pieces+=z.copies||1;}else g.pending++;}groups.set(key,g);}
    return[...groups.values()].map(g=>{const material=materials.find(m=>m.id===vehMat[g.key])||base,q=g.area?pricing.quote(material,g.area*(1+waste/100),g.pieces):null;return{...g,material,custom:material!==base,value:q?q.value:null};});}
  function cost(){const t=total(),material=materials.find(m=>m.id===$('designMaterial').value),waste=Math.max(0,Math.min(100,Number($('materialWaste').value)||0));if(!material||!t.area)return{...t,material,ready:false};const withWaste=t.area*(1+waste/100),q=pricing.quote(material,withWaste,t.pieces);if(!q)return{...t,material,ready:false};const vc=vehicleCosts();if(vc.some(g=>g.custom)){if(vc.some(g=>g.area&&g.value==null))return{...t,material,ready:false};return{...t,material,waste,mixed:true,value:vc.reduce((a,g)=>a+(g.value||0),0),partial:t.pending>0,ready:true};}return{...t,...q,material,waste,partial:t.pending>0,minimumApplied:material.unit!=='unidad'&&withWaste<1,ready:true};}
  function priceLabel(m){return m.pricing==='table'?'Tabla desde '+euro(m.points?.[0]?.total||0)+' / 1 m²':euro(m.price)+' / '+m.unit;}
  function priceExplanation(c){if(!c.ready)return 'Selecciona una zona con referencia y un material válido.';if(c.mixed)return 'Materiales distintos por vehículo: el total es la suma del precio de cada uno · sin IVA'+(c.waste?' · incluye '+c.waste+'% de margen':'')+(c.partial?' · PRECIO PARCIAL: faltan '+c.pending+' zona(s) sin referencia':'');const method={point:'Precio de la tabla',interpolated:'Estimación entre puntos de la tabla',extended:'Estimación: precio por m² del último punto',fixed:'Precio fijo'}[c.method];return `${method}: ${c.qty.toLocaleString('es-ES',{maximumFractionDigits:3})} ${c.material.unit} · sin IVA${c.minimumApplied?' · mínimo facturable aplicado: 1 m²':''}${c.waste?' · incluye '+c.waste+'% de margen':''}${c.material.unit==='m lineal'?'. Conversión por ancho; revisa la distribución de piezas.':''}${c.partial?' · PRECIO PARCIAL: faltan '+c.pending+' zona(s) sin referencia':''}`;}
  function renderUnits(){const rows=state.docs.map((doc,di)=>{if(!doc.zones.length)return '';return '<h3 class="zone-group">'+esc(docTitle(doc))+'</h3>'+doc.zones.map((z,i)=>{const m=measured(doc,z),n=z.copies||1;return`<div class="zone-unit"><div><b>Zona ${i+1}</b><span>${m?dims(m,n)+(n>1?' · '+n+' unidades · '+m.area.toLocaleString('es-ES',{maximumFractionDigits:3})+' m² en total':''):'Falta referencia'}</span></div><div class="zone-stepper"><button type="button" class="button button-secondary" data-unit="${di}:${i}:-1" aria-label="Quitar una unidad de la zona ${i+1}"${n<=1?' disabled':''}>−</button><input type="number" inputmode="numeric" min="1" max="1000" value="${n}" data-unit-input="${di}:${i}" aria-label="Unidades de la zona ${i+1}"><button type="button" class="button button-secondary" data-unit="${di}:${i}:1" aria-label="Añadir una unidad de la zona ${i+1}">+</button></div></div>`;}).join('');}).join('');unitsBox.hidden=!rows;unitsBox.innerHTML=rows?'<h2>Unidades de cada zona</h2><p>Indica cuántas veces se repite cada zona.</p>'+rows:'';}
  function setUnits(di,zi,n){const z=state.docs[di]?.zones[zi];if(!z)return;z.copies=Math.max(1,Math.min(1000,Math.floor(Number(n)||1)));results();}
  unitsBox.addEventListener('click',e=>{const b=e.target.closest('[data-unit]');if(!b)return;const[di,zi,step]=b.dataset.unit.split(':').map(Number);setUnits(di,zi,(state.docs[di]?.zones[zi]?.copies||1)+step);});
  unitsBox.addEventListener('change',e=>{const i=e.target.dataset.unitInput;if(i===undefined)return;const[di,zi]=i.split(':').map(Number);setUnits(di,zi,e.target.value);});
  function results(){window.dispatchEvent(new Event('rotulom-change'));const d=current();$('designZones').innerHTML=d?.zones.length?'<h3 class="zone-group">'+esc(docTitle(d))+'</h3>'+d.zones.map((z,i)=>{const m=measured(d,z);return`<div class="simple-zone ${i===state.selected?'selected':''}"><div><span data-zone-number="${i}">Zona ${i+1}</span><b>${m?dims(m,z.copies||1):'Falta referencia'}</b></div><label>Copias<input type="number" min="1" max="1000" value="${z.copies||1}" data-copies="${i}"></label><button class="text-button" data-remove-zone="${i}" aria-label="Quitar zona ${i+1}">×</button></div>`;}).join(''):'<p>Arrastra sobre el diseño para ver el ancho y el alto en cm.</p>';
    renderUnits();
    const t=total(),c=cost();$('designArea').textContent=t.area?fmt(t.area*10000)+' cm²'+(t.pending?' · faltan '+t.pending+' sin referencia':''):t.pending?'Pendiente: '+t.pending+' área(s)':'—';$('designAreaM2').textContent=t.area?t.area.toLocaleString('es-ES',{maximumFractionDigits:3})+' m² de material rectangular':'';$('designCost').textContent=c.ready?euro(c.value)+(c.partial?' (parcial)':''):'—';{let vb=$('vehicleCosts');if(!vb){vb=document.createElement('div');vb.id='vehicleCosts';$('designCost').parentElement.before(vb);vb.addEventListener('change',e=>{const k=e.target.dataset?.vehMat;if(k==null)return;if(e.target.value)vehMat[k]=e.target.value;else delete vehMat[k];results();});}const vc=c.ready?vehicleCosts():[];vb.hidden=vc.length<2;const opts=g=>'<option value="">Igual que el material general</option>'+materials.map(m=>'<option value="'+esc(m.id)+'"'+(vehMat[g.key]===m.id?' selected':'')+'>'+esc(m.name)+'</option>').join('');vb.innerHTML=vc.length<2?'':'<h3>Precio de cada vehículo</h3>'+vc.map(g=>'<div class="vehicle-cost"><div><span>'+esc(g.title)+(g.pending?' <small>(faltan '+g.pending+' zonas sin referencia)</small>':'')+'</span><label>Material<select data-veh-mat="'+esc(g.key)+'">'+opts(g)+'</select></label></div><b>'+(g.value==null?'—':euro(g.value))+'</b></div>').join('')+'<p class="vehicle-cost-note">El total se calcula con toda la superficie junta si todos usan el mismo material; con materiales distintos es la suma de cada vehículo.</p>';}renderScaleAssistant();$('copyCalculation').disabled=!c.ready||state.docs.some(doc=>doc.zones.length&&!doc.referenceConfirmed);if(d){$('confirmReference').checked=!!d.referenceConfirmed;$('planeTools').hidden=isArt(d);if(d.plane){$('planeWidth').value=d.plane.width||'';$('planeHeight').value=d.plane.height||'';}}
    $('selectedMaterialPrice').textContent=c.material?priceLabel(c.material):'';$('materialInfo').hidden=!c.material;$('costExplanation').textContent=priceExplanation(c);
    $('documentTabs').innerHTML=state.docs.map((doc,i)=>`<button class="filter-chip ${i===state.active?'active':''}" data-doc="${i}">${esc(doc.name.length>28?doc.name.slice(0,25)+'…':doc.name)}${doc.kind==='pdf'?' · p. '+doc.page:''}</button>`).join('');
    if(d){const v=sourceVehicle(),r=ratio(d);$('referenceStatus').textContent=d.sheetRefs?.length?d.sheetRefs.length+' vistas detectadas. '+(d.sheetRefs.some(r=>!r.knownCm)?'Hay vistas sin escala: elige L1/L2 en la primera pestaña o indica su referencia en cm. ':(d.sheetRefs.some(r=>r.estimated)?'Escala ESTIMADA con las ruedas y la altura del vehículo (±10-15 %): si conoces una medida real, ajústala en «Vehículo y escala». ':'Escalas aproximadas del modelo seleccionado. '))+'Revisa las líneas naranjas de cada vista.':isArt(d)?`PDF: ${fmt(d.widthCm*d.factor)} × ${fmt(d.heightCm*d.factor)} cm · escala 1:${d.factor}. Marca solo el arte final.`:r?`${d.manual?'Referencia corregida':'Referencia automática aproximada'}: ${fmt(d.knownCm)} cm. ${v?.verificationStatus==='fuente_secundaria'?'Medida de fuente secundaria: confirma la versión. ':''}${d.manual&&d.refNote?'Pieza usada: '+d.refNote+'. Medidas orientativas (±10 %). ':''}Revisa los extremos naranjas.`:!v?'Elige el vehículo para aplicar su medida.':!d.extent?'No se detectan bien los extremos. Pulsa Ajustar extremos e indica una referencia en cm.':d.side!=='lateral'?'Falta un ancho de carrocería confirmado para esta vista. Usa la vista lateral o una referencia conocida.':'Elige la longitud L1/L2 de la furgoneta o indica una referencia conocida.';}
  }
  function updatePlaneStatus(){const d=current();if(d&&nominalScale(d)&&planeTransform(d.plane)){$('referenceStatus').textContent='Plantilla · escala exterior nominal. Revisa la referencia antes de presupuestar.';return;}if(d?.plane&&!isArt(d))$('referenceStatus').textContent=d.plane.pts.length<4?'Panel: marca las cuatro esquinas ('+d.plane.pts.length+'/4).':'Panel de perspectiva: '+fmt(d.plane.width)+' × '+fmt(d.plane.height)+' cm. Revisa las esquinas. Medidas aproximadas solo para ese plano.';}
  function draw(){const d=current();if(!d){results();return;}canvas.width=d.image.width;canvas.height=d.image.height;layoutCanvas();ctx.drawImage(d.image,0,0);const displayScale=canvas.width/(canvas.getBoundingClientRect().width||canvas.width);ctx.font=`bold ${14*displayScale}px sans-serif`;d.zones.forEach((z,i)=>{ctx.fillStyle='rgba(35,139,80,.15)';ctx.strokeStyle='#238b50';ctx.lineWidth=(i===state.selected?3:2)*displayScale;ctx.fillRect(z.x,z.y,z.w,z.h);ctx.strokeRect(z.x,z.y,z.w,z.h);{const fs=15*displayScale,r=Math.min(fs*.95,Math.max(7*displayScale,Math.min(z.w,z.h)/2)),cx=z.x+r+3*displayScale,cy=z.y+r+3*displayScale;ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#0f4b2d';ctx.fill();ctx.lineWidth=2*displayScale;ctx.strokeStyle='#fff';ctx.stroke();ctx.fillStyle='#fff';ctx.font='700 '+(r*1.1)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),cx,cy+displayScale);if((z.copies||1)>1){ctx.textAlign='left';const t='× '+z.copies,w=ctx.measureText(t).width+8*displayScale;ctx.fillStyle='#0f4b2d';ctx.fillRect(cx+r+3*displayScale,cy-r*.8,w,r*1.6);ctx.fillStyle='#fff';ctx.fillText(t,cx+r+7*displayScale,cy+displayScale);}ctx.restore();}if(i===state.selected){const size=10*displayScale;for(const p of Object.values(window.RotulomZones.handles(z))){ctx.fillStyle='#fff';ctx.fillRect(p.x-size/2,p.y-size/2,size,size);ctx.strokeRect(p.x-size/2,p.y-size/2,size,size);}}});if(!isArt(d)&&d.plane?.pts.length){ctx.strokeStyle='#208cba';ctx.fillStyle='#208cba';ctx.lineWidth=2*displayScale;ctx.beginPath();d.plane.pts.forEach((p,i)=>{if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);ctx.fillText(String(i+1),p.x+8*displayScale,p.y-8*displayScale);});if(d.plane.pts.length===4)ctx.closePath();ctx.stroke();for(const p of d.plane.pts){ctx.beginPath();ctx.arc(p.x,p.y,5*displayScale,0,Math.PI*2);ctx.fill();}}if(!isArt(d)&&d.points.length){ctx.strokeStyle='#e88920';ctx.fillStyle='#e88920';ctx.lineWidth=3;if(d.points.length===2){ctx.setLineDash([9,5]);ctx.beginPath();ctx.moveTo(d.points[0].x,d.points[0].y);ctx.lineTo(d.points[1].x,d.points[1].y);ctx.stroke();ctx.setLineDash([]);}for(const p of d.points){ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();}}if(!isArt(d)&&d.sheetRefs?.length){ctx.lineWidth=2*displayScale;for(const [i,ref] of d.sheetRefs.entries()){ctx.strokeStyle='#e88920';ctx.fillStyle='#e88920';ctx.setLineDash([7*displayScale,5*displayScale]);ctx.strokeRect(ref.left,ref.top,ref.right-ref.left,ref.bottom-ref.top);ctx.setLineDash([]);if(ref.points.length===2){ctx.beginPath();ctx.moveTo(ref.points[0].x,ref.points[0].y);ctx.lineTo(ref.points[1].x,ref.points[1].y);ctx.stroke();}ctx.fillText('Vista '+(i+1)+' · '+(ref.knownCm?(ref.estimated?'≈ ':'')+fmt(ref.knownCm)+' cm':'sin escala'),ref.left+4*displayScale,ref.top+18*displayScale);}}{const cs=d.sheetRefs?.length?d.sheetRefs.flatMap(r=>r.estimated&&r.wheels||[]):d.estimatedScale&&d.wheelCircles||[];if(cs.length){ctx.save();ctx.strokeStyle='#e0245e';ctx.lineWidth=2*displayScale;ctx.setLineDash([]);for(const c of cs){ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.stroke();}ctx.restore();}}results();updatePlaneStatus();renderSheetControls();if($('editorScaleStatus'))$('editorScaleStatus').textContent=d.sheetRefs?.length?d.sheetRefs.length+' vistas · '+(d.sheetRefs.some(r=>!r.knownCm)?'Falta escala: revisa vehículo o ⚙':(d.sheetRefs.some(r=>r.estimated)?'Escala ESTIMADA (ruedas/altura) · revisar en ⚙':'Escalas aproximadas · revisar en ⚙')):isArt(d)?'PDF a escala 1:'+d.factor:d.plane&&d.templatePlane?'Plantilla · revisa la escala en ⚙':ratio(d)?'Referencia aproximada · revisar en ⚙':'Selecciona vehículo o referencia en ⚙';}
  function activate(i){recognition.hidden=true;state.drag=null;state.selected=-1;state.active=i;const d=current();if(d){analyzeViews(d);if(d.viewBoxes.length>1&&!isArt(d)&&!d.sheetRefs?.length)d.sheetRefs=window.RotulomSheet.references(d.viewBoxes,sourceVehicle(),d.lengthChoice);}refreshPreview();$('fileSelected').textContent=d?'Archivo abierto: '+d.name+(d.kind==='pdf'?' · PDF':' · Imagen'):'Todavía no has abierto ningún archivo.';$('emptyEditor').hidden=!!d;$('photoEmpty').hidden=!!d;$('photoEditor').hidden=!d;if(d){$('documentName').textContent=d.name;$('photoSide').value=d.side||'lateral';$('pdfOptions').hidden=d.kind!=='pdf';$('photoSide').disabled=isArt(d);$('pdfPageInfo').textContent=d.kind==='pdf'?d.page+' / '+d.pdf.numPages:'';window.rotulomUpdatePager&&window.rotulomUpdatePager();$('pdfScale').value=d.factor||1;$('pdfMode').value=d.pdfMode||'art';$('manualCm').value=d.knownCm||'';updateVehicleOptions();renderLengthChoices();setMode('pan');applyZoom(d.zoom||100);draw();}else results();updateTemplatePicker();}
  async function pdfPage(pdf,page,name){const p=await pdf.getPage(page),unit=p.getViewport({scale:1}),vp=p.getViewport({scale:Math.min(1800/unit.width,2400/unit.height,2.5)}),image=document.createElement('canvas');image.width=Math.ceil(vp.width);image.height=Math.ceil(vp.height);await p.render({canvasContext:image.getContext('2d'),viewport:vp}).promise;return{kind:'pdf',pdf,page,name,image,widthCm:unit.width*2.54/72,heightCm:unit.height*2.54/72,factor:1,pdfMode:'art',vehicle:$('designVehicle').value,side:'lateral',zones:[],points:[],knownCm:0,extent:window.rotulomFindVehicleExtent(image.getContext('2d').getImageData(0,0,image.width,image.height))};}
  function updateTemplatePicker(){
    const v=state.vehicles.find(v=>v.id===$('designVehicle').value);
    templatePicker.hidden=!v?.catalogueDetails?.templateArtwork;
  }
  async function openTemplate(vehicle,viewKey){
    if(state.busy)return;
    const art=vehicle?.catalogueDetails?.templateArtwork;
    const view=art?.views?.[viewKey],dimensions=vehicle?.dimensionsMm;
    if(!view||!dimensions||!/^[a-z0-9-]+\.webp$/.test(art.atlas))return;
    state.busy=true;
    const status=$('templateLoadStatus'),button=$('useVehicleTemplate');
    button.disabled=true;status.textContent='Cargando plantilla…';
    try{
      const response=await fetch('./rotulom/artwork/templates/'+art.atlas);
      if(!response.ok)throw Error('Imagen no disponible');
      const atlas=await createImageBitmap(await response.blob());
      const image=document.createElement('canvas');
      const [x,y,width,height]=view.clip;
      image.width=width;image.height=height;
      try{
        const ctx=image.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
        ctx.drawImage(atlas,x,y,width,height,0,0,width,height);
      }finally{atlas.close();}
      const [left,top,right,bottom]=view.bounds;
      const horizontal=viewKey==='lateral'||viewKey==='superior'?dimensions.exteriorLength:dimensions.exteriorWidth;
      const vertical=viewKey==='superior'?dimensions.exteriorWidth:dimensions.exteriorHeight;
      const plane={width:horizontal/10,height:vertical/10,pts:[
        {x:left-x,y:top-y},{x:right-x,y:top-y},{x:right-x,y:bottom-y},{x:left-x,y:bottom-y}
      ]};
      const side=viewKey==='frontal'?'delantera':viewKey;
      state.docs.push({kind:'photo',name:vlabel(vehicle)+' · '+view.label,image,vehicle:vehicle.id,side,
        zones:[],points:[],knownCm:0,plane,templatePlane:structuredClone(plane),templateVehicle:vehicle.id,
        analysisVersion:3,viewBoxes:[],outlineCandidates:[]});
      $('vehicleFind').value='';
      activate(state.docs.length-1);
      updateTemplatePicker();
      status.textContent='';
      showStep(1);
    }catch(err){
      console.error('No se pudo abrir la plantilla',err);
      status.textContent='No se pudo abrir la plantilla. Vuelve a intentarlo.';
    }finally{state.busy=false;button.disabled=false;}
  }
  $('useVehicleTemplate').onclick=()=>openTemplate(state.vehicles.find(v=>v.id===$('designVehicle').value),$('templateView').value);
  $('photoEmpty').onclick=()=>{if(!state.busy)$('designFiles').click();};
  async function openFiles(files){if(state.busy)return;state.busy=true;try{for(const f of files){if(f.size>50*1024*1024){tell('El límite es 50 MB por archivo.');continue;}let d;if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){await loadPdfEngine();const pdf=await state.pdf.getDocument({data:new Uint8Array(await f.arrayBuffer()),cMapUrl:'./rotulom/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./rotulom/vendor/pdfjs/standard_fonts/',wasmUrl:'./rotulom/vendor/pdfjs/wasm/',isEvalSupported:false}).promise;await cacheTexts(pdf);d=await pdfPage(pdf,1,f.name);}else{const im=await createImageBitmap(f),s=Math.min(2600/im.width,2600/im.height,Math.sqrt(5000000/(im.width*im.height)),1),image=document.createElement('canvas');image.width=Math.round(im.width*s);image.height=Math.round(im.height*s);const b=image.getContext('2d',{willReadFrequently:true});b.drawImage(im,0,0,image.width,image.height);im.close();d={kind:'photo',name:f.name,image,vehicle:$('designVehicle').value,side:$('photoSide').value||'lateral',zones:[],points:[],knownCm:0,extent:window.rotulomFindVehicleExtent(b.getImageData(0,0,image.width,image.height))};}state.docs.push(d);activate(state.docs.length-1);analyzeViews(d);if(!d.zones.length)d.zones.push(...unusedOutlines(d).map(z=>({...z})));if(d.kind==='pdf'&&d.viewBoxes.length>1&&d.viewBoxes.some(b=>b.kind==='lateral')){d.pdfMode='mockup';$('pdfMode').value='mockup';$('photoSide').disabled=false;}if(!isArt(d))applyAuto();identifyVehicle(d);}tell('Archivo abierto en este dispositivo.'+(current()?.kind==='pdf'&&current().pdf.numPages>1?' El PDF tiene '+current().pdf.numPages+' páginas: pasa de una a otra con los botones ‹ › sobre la imagen.':''));}catch(err){tell('No se pudo abrir: '+(err.name==='PasswordException'?'El PDF necesita una copia sin contraseña.':err.message));}finally{state.busy=false;}}
  $('designFiles').onchange=async e=>{const fs=[...e.target.files];e.target.value='';await openFiles(fs);};
  {let depth=0;const has=e=>[...(e.dataTransfer?.types||[])].includes('Files');addEventListener('dragenter',e=>{if(has(e)){depth++;document.body.classList.add('drop-over');}});addEventListener('dragleave',e=>{if(has(e)&&--depth<=0){depth=0;document.body.classList.remove('drop-over');}});addEventListener('dragover',e=>{if(has(e)){e.preventDefault();e.dataTransfer.dropEffect='copy';}});addEventListener('drop',e=>{if(!has(e))return;e.preventDefault();depth=0;document.body.classList.remove('drop-over');const fs=[...e.dataTransfer.files].filter(f=>/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)||/\.(pdf|jpe?g|png|webp)$/i.test(f.name));if(!fs.length){tell('Suelta una foto (JPG, PNG, WebP) o un PDF.');return;}showStep(0);openFiles(fs);});}
  $('vehicleFind').oninput=()=>{updateVehicleOptions();showVehicleSuggestions();};$('designVehicle').onchange=()=>{closeVehicleSuggestions();const d=current();if(d){d.vehicle=$('designVehicle').value;d.lengthChoice='';}renderLengthChoices();applyAuto();};$('lengthChoice').onchange=()=>{if(current())current().lengthChoice=$('lengthChoice').value;applyAuto();};$('photoSide').onchange=()=>{if(current())current().side=$('photoSide').value;applyAuto();};
  $('documentTabs').onclick=e=>{const b=e.target.closest('[data-doc]');if(b)activate(Number(b.dataset.doc));};$('removeDocument').onclick=()=>{if(current()){state.docs.splice(state.active,1);activate(Math.min(state.active,state.docs.length-1));}};$('drawZone').onclick=()=>{setMode('zone');tell('Arrastra para crear una zona. Para otra zona, pulsa Marcar zona.');};
  function referenceMode(){if(!current()||isArt(current()))return;current().plane=null;current().referenceConfirmed=false;setMode('reference');current().points=[];tell('Pulsa los dos extremos del vehículo o de la referencia conocida.');draw();}$('fixReference').onclick=referenceMode;$('manualReference').onclick=()=>{if(current()){current().knownCm=Number($('manualCm').value)||0;current().manual=true;}referenceMode();};$('manualCm').oninput=()=>{if(current()){current().referenceConfirmed=false;current().plane=null;current().knownCm=Number($('manualCm').value)||0;current().manual=true;results();}};$('clearZones').onclick=()=>{if(current()){current().zones=[];state.selected=-1;draw();}};
  $('confirmReference').onchange=()=>{if(current()){current().referenceConfirmed=$('confirmReference').checked;results();}};
  $('markPlane').onclick=()=>{const d=current(),width=Number($('planeWidth').value),height=Number($('planeHeight').value);if(!d||isArt(d))return;if(!(width>0&&height>0)){tell('Indica el ancho y el alto reales del panel en cm.');return;}d.plane={width,height,pts:[]};d.points=[];d.referenceConfirmed=false;setMode('plane');tell('Marca las esquinas: superior izquierda, superior derecha, inferior derecha e inferior izquierda.');draw();};
  $('clearPlane').onclick=applyAuto;
  for(const id of ['planeWidth','planeHeight'])$(id).onchange=()=>{if(current()?.plane){current().plane.width=Number($('planeWidth').value);current().plane.height=Number($('planeHeight').value);current().referenceConfirmed=false;draw();}};
  const geometry=window.RotulomZones,stage=$('imageStage');
  function setMode(mode){state.mode=mode;if(mode==='pan')state.selected=-1;for(const [id,m] of [['drawZone','zone'],['editZones','edit'],['panImage','pan']])$(id).setAttribute('aria-pressed',String(m===mode));canvas.style.cursor=mode==='pan'?'grab':mode==='edit'?'default':'crosshair';}
  function layoutCanvas(){const d=current();if(!d)return;const full=$('imageWorkspace').classList.contains('expanded'),width=stage.clientWidth,height=stage.clientHeight,fit=full?Math.min(width,height*d.image.width/d.image.height):width,rendered=fit*(d.zoom||100)/100;canvas.style.width=rendered+'px';canvas.style.maxWidth='none';canvas.style.marginLeft=(full?Math.max(0,(width-rendered)/2):0)+'px';canvas.style.marginTop=(full?Math.max(0,(height-rendered*d.image.height/d.image.width)/2):0)+'px';}
  function applyZoom(value,anchor){const d=current();if(!d)return;const r=canvas.getBoundingClientRect(),bounds=stage.getBoundingClientRect();if(!anchor)anchor={x:bounds.left+stage.clientLeft+stage.clientWidth/2,y:bounds.top+stage.clientTop+stage.clientHeight/2,imageX:r.width?(bounds.left+stage.clientLeft+stage.clientWidth/2-r.left)/r.width:.5,imageY:r.height?(bounds.top+stage.clientTop+stage.clientHeight/2-r.top)/r.height:.5};d.zoom=Math.max(100,Math.min(400,Number(value)||100));layoutCanvas();$('imageZoom').value=d.zoom;$('zoomLabel').textContent=Math.round(d.zoom)+'%';const next=canvas.getBoundingClientRect();stage.scrollLeft=canvas.offsetLeft+anchor.imageX*next.width-(anchor.x-bounds.left-stage.clientLeft);stage.scrollTop=canvas.offsetTop+anchor.imageY*next.height-(anchor.y-bounds.top-stage.clientTop);draw();}
  function updateEditorLayout(){document.documentElement.style.setProperty('--r-workflow-nav-height',tabs.offsetHeight+'px');if(current())draw();}
  function setExpanded(expanded){$('imageWorkspace').classList.toggle('expanded',expanded);document.body.classList.toggle('editor-expanded',expanded);$('expandImage').textContent=expanded?'↙':'Ampliar área';$('expandImage').setAttribute('aria-label',expanded?'Salir de pantalla completa':'Ampliar área');$('expandImage').setAttribute('aria-pressed',String(expanded));parent.postMessage({type:'medlom-editor-fullscreen',active:expanded},location.origin);updateEditorLayout();}
  window.addEventListener('resize',updateEditorLayout);
  window.rotulomNavigation={showStep,fullscreen:()=>$('imageWorkspace').classList.contains('expanded')};
  $('imageZoom').oninput=e=>applyZoom(e.target.value);$('zoomIn').onclick=()=>applyZoom((current()?.zoom||100)+25);$('zoomOut').onclick=()=>applyZoom((current()?.zoom||100)-25);$('zoomFit').onclick=()=>{applyZoom(100);stage.scrollTo(0,0);};
  $('expandImage').onclick=()=>setExpanded(!$('imageWorkspace').classList.contains('expanded'));
  const options=document.createElement('section');options.id='editorOptions';options.hidden=true;options.setAttribute('aria-label','Referencia y opciones del documento');
  $('editZones').hidden=true;$('panImage').hidden=true;options.append($('fixReference'),$('clearZones'),$('documentTabs'),$('photoEditor').querySelector('.simple-photo-toolbar'),$('pdfOptions'),$('referenceStatus'),$('confirmReference').closest('label'),$('planeTools'),$('manualCm').closest('details'));$('imageWorkspace').append(options);$('copyCalculation').before($('confirmReference').closest('label'));
  const sheetControls=document.createElement('section');sheetControls.id='sheetControls';options.prepend(sheetControls);
  function renderSheetControls(){const d=current(),refs=d?.sheetRefs||[];window.rotulomUpdatePart&&window.rotulomUpdatePart();sheetControls.hidden=!refs.length;$('fixReference').hidden=!!refs.length||isArt(d);$('manualCm').closest('details').hidden=!!refs.length||isArt(d);if(sheetControls.contains(document.activeElement))return;sheetControls.innerHTML=refs.length?'<h3>Referencias de cada vista</h3><p>Las líneas naranjas deben coincidir con los extremos del vehículo. Las fotos dan medidas aproximadas.</p>'+refs.map((r,i)=>'<div class="sheet-reference-row"><b>Vista '+(i+1)+' · '+esc(r.label)+'</b><label>Distancia real (cm)<input type="number" min=".1" step=".1" data-view-cm="'+i+'" value="'+(r.knownCm||'')+'"></label><button class="tool-button" data-refine-view="'+i+'">Ajustar extremos de esta vista</button></div>').join(''):'';}
  sheetControls.onchange=e=>{if(e.target.dataset.viewCm!==undefined){const d=current();d.sheetRefs[Number(e.target.dataset.viewCm)].knownCm=Number(e.target.value)||0;d.sheetRefs[Number(e.target.dataset.viewCm)].manual=true;d.referenceConfirmed=false;draw();}};
  sheetControls.onclick=e=>{const b=e.target.closest('[data-refine-view]');if(!b)return;const d=current();state.refiningView=Number(b.dataset.refineView);state.refiningPoints=[];setMode('sheetReference');options.hidden=true;$('editorOptionsToggle').setAttribute('aria-expanded','false');tell('Marca dos puntos de esta vista que correspondan a su distancia en cm.');};
  const optionsButton=document.createElement('button');optionsButton.id='editorOptionsToggle';optionsButton.type='button';optionsButton.className='tool-button';optionsButton.textContent='⚙';optionsButton.setAttribute('aria-label','Referencia y escala');optionsButton.setAttribute('aria-expanded','false');optionsButton.setAttribute('aria-controls','editorOptions');$('imageWorkspace').querySelector('.zoom-toolbar').append(optionsButton);optionsButton.onclick=()=>{options.hidden=!options.hidden;optionsButton.setAttribute('aria-expanded',String(!options.hidden));};
  const editorTop=document.createElement('div');editorTop.className='editor-top-controls';editorTop.append($('imageWorkspace').querySelector(':scope>.measurement-toolbar'),$('imageWorkspace').querySelector(':scope>.zoom-toolbar'));$('imageWorkspace').prepend(editorTop);const scaleStatus=document.createElement('output');scaleStatus.id='editorScaleStatus';scaleStatus.setAttribute('role','status');$('imageWorkspace').append(scaleStatus);
  const controlSizeObserver=new ResizeObserver(()=>{
    if(!$('imageWorkspace').classList.contains('expanded'))return;
    const bottom=editorTop.offsetTop+editorTop.offsetHeight+4;
    $('imageWorkspace').style.setProperty('--editor-controls-bottom',bottom+'px');
    if(current())layoutCanvas();
  });
  controlSizeObserver.observe(editorTop);
  const materialDialog=document.createElement('dialog');materialDialog.id='materialInfoDialog';materialDialog.setAttribute('aria-labelledby','materialInfoTitle');materialDialog.innerHTML='<h2 id="materialInfoTitle"></h2><p id="materialInfoDescription"></p><p id="materialInfoMethod"></p><a id="materialInfoSource" target="_blank" rel="noopener">Consultar fuente</a><button type="button" id="closeMaterialInfo" class="button button-primary">Cerrar</button>';document.body.append(materialDialog);
  $('materialInfo').onclick=()=>{const m=materials.find(m=>m.id===$('designMaterial').value);if(!m)return;$('materialInfoTitle').textContent=m.name;$('materialInfoDescription').textContent=m.notes||'Sin descripción añadida.';$('materialInfoMethod').textContent=m.pricing==='table'?'Tabla de precios editable. Los tamaños intermedios son estimaciones.':'Precio fijo editable por '+m.unit+'.';$('materialInfoSource').hidden=!/^https?:\/\//.test(m.source||'');if(!$('materialInfoSource').hidden)$('materialInfoSource').href=m.source;materialDialog.showModal();};$('closeMaterialInfo').onclick=()=>materialDialog.close();
  $('finishEditing').onclick=()=>showStep(2);
  $('editZones').onclick=()=>{setMode('edit');tell('Pulsa un recuadro para seleccionarlo. Arrastra su interior para moverlo o sus asas para cambiar el tamaño.');};$('panImage').onclick=()=>setMode('pan');
  function point(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};}
  function hit(p){return geometry.hit(current().zones,p,state.selected,12*canvas.width/canvas.getBoundingClientRect().width);}
  let holdTimer=null;
  function clearHold(){clearTimeout(holdTimer);holdTimer=null;}
  function startPan(e,p){const d=current(),candidate=geometry.hit(d.zones,p,-1,0);setMode('pan');state.drag={type:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};const drag=state.drag;if(candidate&&e.pointerType==='mouse'){state.selected=candidate.index;setMode('edit');state.drag={type:'move',id:e.pointerId,start:p,index:candidate.index,original:{...d.zones[candidate.index]}};return;}if(candidate)holdTimer=setTimeout(()=>{holdTimer=null;if(state.drag!==drag)return;state.selected=candidate.index;setMode('edit');state.drag={type:'move',id:e.pointerId,start:p,index:candidate.index,original:{...d.zones[candidate.index]}};draw();if(navigator.vibrate)navigator.vibrate(15);},450);}
  canvas.onpointerdown=e=>{const d=current();if(!d||state.drag||e.button>0)return;clearHold();const p=point(e);canvas.focus({preventScroll:true});if(state.mode==='sheetReference'){state.refiningPoints.push(p);if(state.refiningPoints.length===2){d.sheetRefs[state.refiningView].points=state.refiningPoints;d.sheetRefs[state.refiningView].manual=true;d.referenceConfirmed=false;setMode('pan');}draw();return;}if(state.mode==='plane'){d.plane.pts.push(p);if(d.plane.pts.length===4){setMode('pan');tell('Panel marcado. Comprueba las cuatro esquinas y confirma la referencia.');}draw();return;}if(state.mode==='reference'){if(d.points.length===2)d.points=[];d.points.push(p);d.manual=true;d.referenceConfirmed=false;if(d.points.length===2)setMode('pan');draw();return;}
    if(state.mode==='zone'){d.zones.push({x:p.x,y:p.y,w:0,h:0,copies:1});state.selected=d.zones.length-1;state.drag={type:'new',id:e.pointerId,start:p,index:state.selected};}
    else if(state.mode==='edit'){const target=hit(p);if(target&&target.index===state.selected)state.drag={type:target.handle?'resize':'move',id:e.pointerId,start:p,index:target.index,handle:target.handle,original:{...d.zones[target.index]}};else startPan(e,p);}
    else startPan(e,p);
    if(state.drag&&e.isTrusted)canvas.setPointerCapture(e.pointerId);draw();};
  canvas.onpointermove=e=>{const d=current(),drag=state.drag;if(!d)return;if(!drag){if(state.mode==='edit'){const target=hit(point(e));canvas.style.cursor=target?.handle?({n:'ns',s:'ns',w:'ew',e:'ew',nw:'nwse',se:'nwse',ne:'nesw',sw:'nesw'}[target.handle]+'-resize'):target?'move':'default';}return;}if(e.pointerId!==drag.id)return;
    if(drag.type==='pan'){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>8)clearHold();stage.scrollLeft=drag.left-(e.clientX-drag.x);stage.scrollTop=drag.top-(e.clientY-drag.y);return;}
    const p=point(e),z=d.zones[drag.index];if(drag.type==='new')Object.assign(z,{x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),w:Math.abs(p.x-drag.start.x),h:Math.abs(p.y-drag.start.y)});else Object.assign(z,drag.type==='move'?geometry.move(drag.original,p.x-drag.start.x,p.y-drag.start.y,canvas.width,canvas.height):geometry.resize(drag.original,drag.handle,p,canvas.width,canvas.height));draw();};
  function finishDrag(cancel=false){clearHold();const d=current(),drag=state.drag;if(!d||!drag)return;if(drag.type==='new'){const z=d.zones[drag.index];if(cancel||z.w<3||z.h<3){d.zones.splice(drag.index,1);state.selected=-1;}else setMode('pan');}else if(drag.original&&(cancel||d.zones[drag.index].w<3||d.zones[drag.index].h<3))Object.assign(d.zones[drag.index],drag.original);state.drag=null;draw();}
  canvas.onpointerup=e=>{if(state.drag?.id===e.pointerId)finishDrag();};canvas.onpointercancel=()=>finishDrag(true);canvas.onlostpointercapture=()=>finishDrag(true);
  const touches=new Map();let pinchGesture=null,touchSnapshot=null,pinchConsumed=false;
  function pair(){const [a,b]=[...touches.values()];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(b.x-a.x,b.y-a.y)};}
  function consume(e){e.preventDefault();e.stopImmediatePropagation();}
  stage.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||!current())return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===1&&!pinchConsumed){const d=current();touchSnapshot={doc:d,zones:d.zones.map(z=>({...z})),points:d.points.map(p=>({...p})),manual:d.manual,plane:d.plane?structuredClone(d.plane):null,confirmed:d.referenceConfirmed,selected:state.selected,mode:state.mode};}
    if(touches.size>=2){if(!pinchConsumed){finishDrag(true);const snap=touchSnapshot;if(snap?.doc===current()){current().zones=snap.zones;current().points=snap.points;current().manual=snap.manual;current().plane=snap.plane;current().referenceConfirmed=snap.confirmed;state.selected=snap.selected;setMode(snap.mode);}pinchConsumed=true;const p=pair(),r=canvas.getBoundingClientRect();pinchGesture={zoom:current().zoom||100,distance:p.distance,width:r.width,height:r.height,anchorX:(p.x-r.left)/r.width,anchorY:(p.y-r.top)/r.height,doc:current()};}if(e.isTrusted)canvas.setPointerCapture(e.pointerId);consume(e);draw();}
  },{capture:true,passive:false});
  stage.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!pinchConsumed)return;consume(e);if(touches.size>=2&&pinchGesture?.doc===current()){const p=pair(),q=geometry.pinch(pinchGesture,{distance:p.distance,x:p.x,y:p.y});applyZoom(q.zoom,{x:p.x,y:p.y,imageX:pinchGesture.anchorX,imageY:pinchGesture.anchorY});}},{capture:true,passive:false});
  function endTouch(e){if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;touches.delete(e.pointerId);if(pinchConsumed)consume(e);if(!touches.size){pinchGesture=null;touchSnapshot=null;pinchConsumed=false;}}
  stage.addEventListener('pointerup',endTouch,{capture:true,passive:false});stage.addEventListener('pointercancel',endTouch,{capture:true,passive:false});
  window.addEventListener('blur',()=>{touches.clear();pinchGesture=null;touchSnapshot=null;pinchConsumed=false;finishDrag(true);});
  $('designZones').onclick=e=>{const edit=e.target.closest('[data-edit-zone]'),b=e.target.closest('[data-remove-zone]');if(edit){state.selected=Number(edit.dataset.editZone);setMode('edit');draw();}if(b){finishDrag(true);current().zones.splice(Number(b.dataset.removeZone),1);state.selected=-1;draw();}};$('designZones').onchange=e=>{if(e.target.dataset.copies!==undefined){current().zones[Number(e.target.dataset.copies)].copies=Math.max(1,Math.min(1000,Math.floor(Number(e.target.value)||1)));results();}};
  canvas.onkeydown=e=>{const d=current(),z=d?.zones[state.selected];if(!z)return;if(['Delete','Backspace'].includes(e.key)){e.preventDefault();d.zones.splice(state.selected,1);state.selected=-1;draw();return;}const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(direction){e.preventDefault();const step=e.shiftKey?10:1;Object.assign(z,geometry.move(z,direction[0]*step,direction[1]*step,canvas.width,canvas.height));draw();}};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){finishDrag(true);if($('imageWorkspace').classList.contains('expanded'))$('expandImage').click();}});
  $('pdfScale').oninput=()=>{if(current()){const n=Number($('pdfScale').value);current().factor=n>0&&n<=1000?n:1;current().referenceConfirmed=false;results();}};$('pdfMode').onchange=()=>{if(current()){current().pdfMode=$('pdfMode').value;$('photoSide').disabled=isArt(current());applyAuto();}};$('wholePdf').onclick=()=>{const d=current();if(d?.kind==='pdf'){d.zones=[{x:0,y:0,w:d.image.width,h:d.image.height,copies:1}];state.selected=0;setMode('edit');draw();}};
  async function turn(delta){const d=current();if(d?.kind!=='pdf'||state.busy)return;const p=d.page+delta;if(p<1||p>d.pdf.numPages)return;const found=state.docs.findIndex(x=>x.pdf===d.pdf&&x.page===p);if(found>=0)return activate(found);state.busy=true;try{const n=await pdfPage(d.pdf,p,d.name);n.vehicle='';n.lengthChoice='';n.pdfMode=d.pdfMode;n.factor=d.factor;state.docs.push(n);activate(state.docs.length-1);analyzeViews(n);if(!n.zones.length)n.zones.push(...unusedOutlines(n).map(z=>({...z})));if(n.viewBoxes.length>1&&n.viewBoxes.some(b=>b.kind==='lateral')){n.pdfMode='mockup';$('pdfMode').value='mockup';$('photoSide').disabled=false;}if(!isArt(n))applyAuto();else draw();identifyVehicle(n);}catch(e){tell(e.message);}finally{state.busy=false;}}$('pdfPrevious').onclick=()=>turn(-1);$('pdfNext').onclick=()=>turn(1);
  const pager=document.createElement('div');pager.id='pdfPager';pager.hidden=true;pager.innerHTML='<button type="button" class="tool-button" id="pagerPrev" aria-label="Página anterior">‹</button><label>Página <select id="pagerSel"></select></label><button type="button" class="tool-button" id="pagerNext" aria-label="Página siguiente">›</button>';const docBar=document.createElement('div');docBar.id='docBar';docBar.append(pager);$('imageWorkspace').querySelector('.editor-top-controls').append(docBar);
  $('pagerPrev').onclick=()=>turn(-1);$('pagerNext').onclick=()=>turn(1);$('pagerSel').onchange=()=>{const d=current();if(d?.kind==='pdf')turn(Number($('pagerSel').value)-d.page);};
  const vbar=document.createElement('div');vbar.id='pageVehicle';vbar.hidden=true;vbar.innerHTML='<label>Vehículo de esta página<input id="pageVehicleInput" list="pageVehicleList" autocomplete="off" placeholder="Escribe marca y modelo y elige de la lista"></label><datalist id="pageVehicleList"></datalist><small id="pageVehicleStatus" role="status"></small><div id="pageCandidates"></div>';const setup=document.createElement('div');setup.id='docSetup';setup.innerHTML='<button type="button" id="docSetupBtn" aria-expanded="false" aria-controls="docSetupBody"></button><div id="docSetupBody" hidden><button type="button" class="button button-primary" id="docSetupDone">Hecho</button></div>';docBar.append(setup);const setSetup=on=>{$('docSetupBody').hidden=!on;$('docSetupBtn').setAttribute('aria-expanded',String(on));};$('docSetupBtn').onclick=()=>setSetup($('docSetupBody').hidden);$('docSetupDone').onclick=()=>setSetup(false);$('docSetupBody').prepend(vbar);
  $('pageVehicleInput').onchange=()=>{const d=current();if(!d)return;const val=$('pageVehicleInput').value.trim().toLowerCase();if(!val){d.vehicle='';$('designVehicle').value='';applyAuto();return;}const v=state.vehicles.find(x=>vlabel(x).toLowerCase()===val);if(!v){tell('Elige un vehículo de la lista que aparece al escribir.');return;}$('vehicleFind').value='';d.vehicle=v.id;d.lengthChoice='';updateVehicleOptions();$('designVehicle').value=v.id;renderLengthChoices();applyAuto();window.rotulomUpdatePager();};
  const PARTS=[['Matrícula española: ancho',52],['Matrícula española: alto',11],['Rueda de turismo: diámetro total',65],['Rueda de furgoneta: diámetro total',72],['Rueda de camión o furgón grande: diámetro total',100],['Retrovisor o ventanilla: la mido yo',0]];
  const part=document.createElement('div');part.id='partRef';part.hidden=true;part.innerHTML='<h3 id="partRefTitle">Medir con una pieza del vehículo</h3><p id="partRefHint"></p><div class="wheel-auto"><label>Estimación automática: tamaño de rueda<select id="wheelType"><option value="65">Turismo (65 cm)</option><option value="72" selected>Furgoneta / furgón con caja (72 cm)</option><option value="100">Camión grande (100 cm)</option></select></label><button type="button" class="button button-secondary" id="wheelAuto">Estimar con las ruedas de la foto</button></div><label>Pieza conocida<select id="partRefSel"><option value="">Elige una pieza…</option>'+PARTS.map((q,i)=>'<option value="'+i+'">'+q[0]+(q[1]?' · '+q[1]+' cm':'')+'</option>').join('')+'</select></label><label id="partRefViewBox" hidden>En qué vista<select id="partRefView"></select></label><label>Medida real (cm)<input id="partRefCm" type="number" min="0.1" step="0.1" placeholder="Ej. 72"></label><button type="button" class="button button-secondary" id="partRefGo">Marcar los dos extremos en la foto</button><small>Sirve cuando el vehículo no está en el catálogo (furgón con caja, camión…). Las ruedas varían de un modelo a otro: la medida será orientativa. Si conoces la medida real de una pieza (una puerta, la ventanilla), escríbela.</small>';
  $('docSetupDone').before(part);
  $('wheelAuto').onclick=()=>{const d=current();if(!d||isArt(d))return;d.wheelCm=Number($('wheelType').value)||72;d.manual=false;if(!d.sheetRefs?.length){d.knownCm=0;d.points=[];}const ok=estimateDoc(d,true);draw();tell(ok?'Escala estimada con las ruedas (círculos rosas). Si no coinciden con los neumáticos o el tamaño de rueda no es el de este vehículo, el resultado no vale: cambia el tipo de rueda o usa una pieza conocida.':'No he encontrado las dos ruedas. Usa una pieza conocida (matrícula, rueda…) y márcala a mano.');};
  $('wheelType').onchange=()=>{const d=current();if(d)d.wheelCm=Number($('wheelType').value)||72;};
  $('partRefSel').onchange=()=>{const q=PARTS[Number($('partRefSel').value)];if(q)$('partRefCm').value=q[1]||'';};
  $('partRefGo').onclick=()=>{const d=current();if(!d||isArt(d))return;const cm=Number($('partRefCm').value),sel=PARTS[Number($('partRefSel').value)];if(!(cm>0)){tell('Elige una pieza o escribe su medida real en cm.');return;}const note=(sel?sel[0].replace(/: /,' (')+')':'medida indicada')+' · '+cm+' cm';
    if(d.sheetRefs?.length){const i=Number($('partRefView').value)||0,r=d.sheetRefs[i];r.knownCm=cm;r.manual=true;r.source='pieza: '+note;d.referenceConfirmed=false;state.refiningView=i;state.refiningPoints=[];setMode('sheetReference');tell('Marca los dos extremos de la pieza ('+note+') en la vista '+(i+1)+'.');draw();return;}
    d.refNote=note;$('manualCm').value=cm;d.knownCm=cm;d.manual=true;referenceMode();tell('Pulsa los dos extremos de la pieza: '+note+'. Por ejemplo, de un lado a otro de la rueda pasando por su centro.');};
  window.rotulomUpdatePart=()=>{const d=current(),show=!!d&&!isArt(d);part.hidden=!show;setup.hidden=!d;if(!d)return;const rv=state.vehicles.find(x=>x.id===d.vehicle),rrefs=d.sheetRefs||[],status=scaleLabel(d),rsc=status!=='Sin escala'&&status!=='Plano sin completar';$('docSetupBtn').textContent='Vehículo: '+(rv?rv.make+' '+rv.model:'sin elegir')+(status?' · '+status:'')+' ▾';$('docSetupBtn').classList.toggle('needs',!rsc);if(!show)return;const refs=rrefs,sc=rsc;$('partRefHint').textContent=sc?'Ya hay una escala aplicada. Si no te fías de ella, puedes usar otra pieza.':'Esta imagen aún no tiene escala. Elige una pieza que conozcas, escribe su medida y márcala en la foto.';part.classList.toggle('needs',!sc);$('partRefViewBox').hidden=refs.length<2;$('wheelType').value=String(d.wheelCm||72);const sel=$('partRefView');if(sel.options.length!==refs.length)sel.innerHTML=refs.map((r,i)=>'<option value="'+i+'">Vista '+(i+1)+' · '+esc(r.label)+'</option>').join('');};
  const syncRec=()=>{$('pageVehicleStatus').textContent=recognition.hidden?'':$('recognitionStatus').textContent;$('pageCandidates').replaceChildren(...(recognition.hidden?[]:[...$('vehicleCandidates').children].map(b=>{const c=document.createElement('button');c.type='button';c.className='vehicle-candidate';c.textContent=b.textContent;c.onclick=()=>b.click();return c;})));};
  new MutationObserver(syncRec).observe(recognition,{subtree:true,childList:true,attributes:true,characterData:true});
  window.rotulomUpdatePager=()=>{const d=current(),on=d?.kind==='pdf'&&d.pdf.numPages>1;pager.hidden=!on;vbar.hidden=!d;if(d){const dl=$('pageVehicleList');if(dl.childElementCount!==state.vehicles.length)dl.innerHTML=state.vehicles.map(v=>`<option value="${esc(vlabel(v))}">`).join('');const v=state.vehicles.find(x=>x.id===d.vehicle);$('pageVehicleInput').value=v?vlabel(v):'';}if(!on)return;const n=d.pdf.numPages,sel=$('pagerSel');if(sel.options.length!==n)sel.innerHTML=Array.from({length:n},(_,i)=>`<option value="${i+1}">${i+1} de ${n}</option>`).join('');sel.value=d.page;$('pagerPrev').disabled=d.page<=1;$('pagerNext').disabled=d.page>=n;};
  function materialLibrary(){const keep=$('designMaterial').value;$('designMaterial').innerHTML='<option value="">Selecciona un material</option>'+materials.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} · ${esc(priceLabel(m))}</option>`).join('');$('designMaterial').value=keep;$('simpleMaterialsList').innerHTML=materials.map(m=>`<div class="material-row"><div><b>${esc(m.name)}</b><small>${esc(priceLabel(m))}${m.rollCm?' · ancho '+fmt(m.rollCm)+' cm':''}</small>${m.notes?`<small>${esc(m.notes)}</small>`:''}${/^https:\/\//.test(m.source||'')?`<a href="${esc(m.source)}" target="_blank" rel="noopener">Consultar fuente</a>`:''}</div><button class="text-button" data-edit-material="${esc(m.id)}">Editar</button><button class="text-button" data-delete-material="${esc(m.id)}">Quitar</button></div>`).join('')||'<p>Añade el primer material y su precio.</p>';results();}
  function addPoint(area='',price=''){const row=document.createElement('div');row.className='material-price-point';row.innerHTML=`<label>Superficie (m²)<input type="number" min="1" step="0.001" data-point-area value="${esc(area)}"></label><label>Precio total (€)<input type="number" min="0" step="0.01" data-point-total value="${esc(price)}"></label><button type="button" class="text-button" aria-label="Quitar superficie">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('materialPriceRows').append(row);}
  function pricingFields(){$('rollWidthField').hidden=$('materialUnit').value!=='m lineal';const table=$('materialPricing').value==='table';$('priceTableField').hidden=!table;$('materialPrice').required=!table;$('materialPrice').disabled=table;if(table)$('materialUnit').value='m²';$('materialUnit').disabled=table;if(table&&!$('materialPriceRows').children.length)addPoint(1,$('materialPrice').value||'');}
  function resetMaterial(){$('simpleMaterialForm').reset();$('editMaterialId').value='';$('materialPriceRows').replaceChildren();$('materialFormMessage').textContent='';pricingFields();}
  $('newMaterial').onclick=resetMaterial;$('addPricePoint').onclick=()=>addPoint();$('materialPricing').onchange=pricingFields;$('materialUnit').onchange=pricingFields;
  $('simpleMaterialForm').onsubmit=e=>{e.preventDefault();const name=$('materialName').value.trim(),price=Number($('materialPrice').value),unit=$('materialUnit').value,rollCm=Number($('materialRollCm').value)||0,mode=$('materialPricing').value;let points=[];if(mode==='table'){points=[...$('materialPriceRows').children].map(row=>{const a=row.querySelector('[data-point-area]'),p=row.querySelector('[data-point-total]');return{area:a.value.trim()?Number(a.value):NaN,total:p.value.trim()?Number(p.value):NaN};}).sort((a,b)=>a.area-b.area);if(!pricing.validatePoints(points)){$('materialFormMessage').textContent='La tabla debe empezar en 1 m², sin superficies repetidas, con precios válidos que no disminuyan.';return;}}if(!name||!Number.isFinite(price)||price<0)return;if(unit==='m lineal'&&!rollCm){$('materialRollCm').focus();return;}const id=$('editMaterialId').value||crypto.randomUUID(),old=materials.find(m=>m.id===id),m={...old,id,name,price:mode==='table'?points[0].total:price,unit,rollCm,roll:rollCm/100,pricing:mode,points,notes:$('materialNotes').value.trim()},i=materials.findIndex(x=>x.id===id),next=materials.slice();if(i<0)next.push(m);else next[i]=m;try{localStorage.setItem('rotulom-materials',JSON.stringify(next));materials=next;materialLibrary();$('designMaterial').value=id;results();resetMaterial();$('materialFormMessage').textContent='Material guardado.';}catch{$('materialFormMessage').textContent='No se pudo guardar el material en este dispositivo.';}};
  $('simpleMaterialsList').onclick=e=>{const edit=e.target.closest('[data-edit-material]'),del=e.target.closest('[data-delete-material]');if(edit){const m=materials.find(m=>m.id===edit.dataset.editMaterial);resetMaterial();$('editMaterialId').value=m.id;$('materialName').value=m.name;$('materialPrice').value=m.price;$('materialUnit').value=m.unit;$('materialRollCm').value=m.rollCm||'';$('materialPricing').value=m.pricing||'fixed';$('materialNotes').value=m.notes||'';(m.points||[]).forEach(p=>addPoint(p.area,p.total));pricingFields();$('materialName').focus();}if(del){const next=materials.filter(m=>m.id!==del.dataset.deleteMaterial);try{localStorage.setItem('rotulom-materials',JSON.stringify(next));materials=next;materialLibrary();if($('editMaterialId').value===del.dataset.deleteMaterial)resetMaterial();}catch{$('materialFormMessage').textContent='No se pudo quitar el material.';}}};$('designMaterial').onchange=results;$('materialWaste').oninput=results;
  $('copyCalculation').onclick=async()=>{const c=cost();if(!c.ready)return;const lines=state.docs.flatMap(d=>d.zones.map((z,i)=>{const m=measured(d,z);return docTitle(d)+' · zona '+(i+1)+': '+(m?dims(m,z.copies||1):'sin referencia')+' · '+(z.copies||1)+' unidad(es)';}));const vc=vehicleCosts(),vcText=vc.length>1?'\nPrecio por vehículo:\n'+vc.map(g=>'- '+g.title+' ('+g.material.name+'): '+(g.value==null?'—':euro(g.value))).join('\n'):'';const text='RotuLoM · Cálculo de material\n'+lines.join('\n')+vcText+(state.docs.some(x=>x.estimatedScale||x.sheetRefs?.some(r=>r.estimated))?'\nAviso: escala estimada con las ruedas del vehículo; medidas orientativas.':'')+'\nSuperficie: '+fmt(c.area*10000)+' cm² ('+c.area.toFixed(3)+' m²)\nMaterial: '+c.material.name+' · '+priceLabel(c.material)+'\nMargen: '+c.waste+'%'+(!c.mixed&&c.material.unit!=='unidad'?'\nSuperficie facturable: '+c.billableArea.toLocaleString('es-ES',{maximumFractionDigits:3})+' m²'+(c.minimumApplied?' (mínimo 1 m²)':''):'')+'\nMétodo: '+priceExplanation(c)+(c.material.notes?'\nCondiciones: '+c.material.notes:'')+'\n'+(vc.length>1?'TOTAL ':'')+'Coste sin IVA: '+euro(c.value);try{if(window.RotulomNative)window.RotulomNative.copyText(text);else await navigator.clipboard.writeText(text);tell('Cálculo copiado para tu aplicación de presupuestos.');}catch{tell(text);}};
  function catalog(){const q=$('catalogFind').value.toLocaleLowerCase('es').split(/\s+/).filter(Boolean),make=$('simpleMake').value,category=$('simpleCategory').value,list=state.vehicles.filter(v=>(!make||v.make===make)&&(!category||v.category===category)&&q.every(t=>`${v.make} ${v.model} ${v.generation}`.toLocaleLowerCase('es').includes(t))),pages=Math.max(1,Math.ceil(list.length/24));state.page=Math.max(1,Math.min(pages,state.page));$('simpleVehicleGrid').innerHTML=list.slice((state.page-1)*24,state.page*24).map(v=>`<article class="vehicle-card">${window.vehicleCatalogPhoto(v,true)}<div class="vehicle-card-body"><small>${esc(v.make)} · ${esc(v.generation)}</small><h3>${esc(v.model)}</h3><p>${v.dimensionsMm?.exteriorLength?'Largo '+fmt(v.dimensionsMm.exteriorLength/10)+' cm':'Longitud según L1/L2 · elegir versión'}${v.dimensionsMm?.exteriorHeight?' · alto '+fmt(v.dimensionsMm.exteriorHeight/10)+' cm':''}</p><small>${v.verificationStatus==='fabricante'?'Ficha de fabricante':'Referencia secundaria · confirmar unidad'}</small><div class="simple-card-actions"><button class="text-button" data-use-vehicle="${esc(v.id)}">${v.catalogueDetails?.templateArtwork?'Abrir plantilla ↗':'Usar en cálculo ↗'}</button><a class="text-button" href="${esc(v.sourceUrl)}" target="_blank" rel="noopener">Fuente</a></div></div></article>`).join('');$('simplePagination').innerHTML=`<button class="button button-secondary" data-simple-page="${state.page-1}" ${state.page===1?'disabled':''}>←</button><span>${list.length} referencias · ${state.page} / ${pages}</span><button class="button button-secondary" data-simple-page="${state.page+1}" ${state.page===pages?'disabled':''}>→</button>`;}
  for(const id of ['catalogFind','simpleMake','simpleCategory'])$(id).addEventListener(id==='catalogFind'?'input':'change',()=>{state.page=1;catalog();});$('simplePagination').onclick=e=>{const b=e.target.closest('[data-simple-page]');if(b){state.page=Number(b.dataset.simplePage);catalog();}};$('simpleVehicleGrid').onclick=e=>{const b=e.target.closest('[data-use-vehicle]');if(!b)return;const vehicle=state.vehicles.find(v=>v.id===b.dataset.useVehicle);showStep(0);if(vehicle?.catalogueDetails?.templateArtwork){$('vehicleFind').value='';updateVehicleOptions();$('designVehicle').value=vehicle.id;updateTemplatePicker();$('templateView').value='lateral';openTemplate(vehicle,'lateral');}else selectVehicle(b.dataset.useVehicle);};
  function allowed(v,p){if(['Furgoneta','Furgoneta con caja'].includes(v.category))return true;if((p.excludedPassengerMakes||[]).some(m=>m.toLowerCase()===v.make.toLowerCase()))return false;if(p.excludedPassengerModelPattern&&new RegExp(p.excludedPassengerModelPattern,'i').test(v.model))return false;const rule=p.excludedModelsByMake?.[v.make];return !rule||!new RegExp(rule,'i').test(v.model);}
  function reloadCatalogue(){return Promise.all([fetch('/api/vehicles').then(r=>{if(!r.ok)throw Error();return r.json();}),fetch('./rotulom/data/catalog-policy.json').then(r=>{if(!r.ok)throw Error();return r.json();})]).then(([vehicles,policy])=>{state.vehicles=vehicles.filter(v=>allowed(v,policy));updateVehicleOptions();$('simpleMake').innerHTML='<option value="">Todas las marcas</option>'+[...new Set(state.vehicles.map(v=>v.make))].sort((a,b)=>a.localeCompare(b,'es')).map(m=>`<option>${esc(m)}</option>`).join('');$('simpleCoverage').textContent=state.vehicles.length+' versiones disponibles de '+new Set(state.vehicles.map(v=>v.make)).size+' marcas. Elige la carrocería y la versión exactas de tu vehículo.';catalog();const d=current();if(d?.vehicle&&!ratio(d)&&!d.plane&&!d.sheetRefs?.some(r=>r.knownCm>0))applyAuto();else draw();}).catch(()=>tell('No se pudo cargar el catálogo filtrado. Abre la app desde su acceso de inicio.'));}
  window.rotulomCatalogue={reload:reloadCatalogue};reloadCatalogue();
  materialLibrary();showStep(0);
  async function loadPdfEngine(){if(!Promise.withResolvers)throw Error('Actualiza Chrome o Android System WebView para abrir PDF en este dispositivo');state.pdf=state.pdf||await import('./rotulom/vendor/pdfjs/pdf.mjs');state.pdf.GlobalWorkerOptions.workerSrc='./rotulom/vendor/pdfjs/pdf.worker.mjs';return state.pdf;}
  const pdfFiles=new WeakMap();
  async function exportSession(){const docs=[];for(const d of state.docs){let blob;if(d.kind==='pdf'){blob=pdfFiles.get(d.pdf);if(!blob){blob=new Blob([await d.pdf.getData()],{type:'application/pdf'});pdfFiles.set(d.pdf,blob);}}else{blob=d.storedImage;if(!blob){blob=await new Promise((resolve,reject)=>d.image.toBlob(b=>b?resolve(b):reject(Error('No se pudo guardar la imagen')),'image/png'));d.storedImage=blob;}}const keys=['kind','name','page','widthCm','heightCm','factor','pdfMode','vehicle','side','lengthChoice','knownCm','manual','points','zones','extent','zoom','referenceConfirmed','plane','templatePlane','templateVehicle','viewBoxes','sheetRefs','analysisVersion','outlineCandidates','recognitionCandidates','refNote','wheelCm','estimatedScale'];const out={blob};for(const k of keys)if(d[k]!==undefined)out[k]=structuredClone(d[k]);docs.push(out);}return{version:1,docs,active:state.active,materialId:$('designMaterial').value,waste:Number($('materialWaste').value)||0,vehicle:$('designVehicle').value};}
  async function importSession(saved){if(!saved||saved.version!==1||!Array.isArray(saved.docs))throw Error('Trabajo no compatible');const docs=[],pdfs=new Map();for(const item of saved.docs){if(!(item.blob instanceof Blob)||!Array.isArray(item.zones)||!Array.isArray(item.points))throw Error('Trabajo incompleto');let d;if(item.kind==='pdf'){let pdf=pdfs.get(item.blob);if(!pdf){const engine=await loadPdfEngine();pdf=await engine.getDocument({data:new Uint8Array(await item.blob.arrayBuffer()),cMapUrl:'./rotulom/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./rotulom/vendor/pdfjs/standard_fonts/',wasmUrl:'./rotulom/vendor/pdfjs/wasm/',isEvalSupported:false}).promise;pdfs.set(item.blob,pdf);pdfFiles.set(pdf,item.blob);}d=await pdfPage(pdf,item.page||1,item.name);}else{const im=await createImageBitmap(item.blob),image=document.createElement('canvas');image.width=im.width;image.height=im.height;image.getContext('2d').drawImage(im,0,0);im.close();d={image,storedImage:item.blob};}const meta={...item};delete meta.blob;Object.assign(d,meta);if(d.zones.some(z=>![z.x,z.y,z.w,z.h].every(Number.isFinite)||z.x<0||z.y<0||z.w<=0||z.h<=0||z.x+z.w>d.image.width+.01||z.y+z.h>d.image.height+.01))throw Error('Área fuera de la imagen');docs.push(d);}state.docs=docs;state.selected=-1;$('designMaterial').value=saved.materialId||'';$('materialWaste').value=saved.waste||0;$('designVehicle').value=saved.vehicle||'';activate(docs.length?Math.max(0,Math.min(docs.length-1,saved.active||0)):-1);}
  function refreshMaterials(){materials=JSON.parse(localStorage.getItem('rotulom-materials')||'[]');materialLibrary();}
  async function jobThumbnail(){const d=current();if(!d)return null;const image=document.createElement('canvas'),scale=Math.min(360/d.image.width,280/d.image.height,1);image.width=Math.max(1,Math.round(d.image.width*scale));image.height=Math.max(1,Math.round(d.image.height*scale));const g=image.getContext('2d');g.drawImage(d.image,0,0,image.width,image.height);g.strokeStyle='#27b778';g.lineWidth=2;for(const z of d.zones)g.strokeRect(z.x*scale,z.y*scale,z.w*scale,z.h*scale);return new Promise(resolve=>image.toBlob(resolve,'image/jpeg',.85));}
  function jobSummary(){const c=cost(),v=sourceVehicle();return{documents:state.docs.length,vehicle:v?v.make+' '+v.model:'',area:c.area||0,material:c.material?.name||'',price:c.ready?c.value:null};}
  window.rotulomSession={export:exportSession,import:importSession,refreshMaterials,thumbnail:jobThumbnail,summary:jobSummary,pdfEngine:loadPdfEngine,currentBase:()=>{const d=current();return d?{image:d.image,name:d.name,template:!!d.templatePlane&&!d.pdf}:null;}};
  window.rotulomSimpleCalculation={getTotals:total,getCost:cost};
})();

;
/* ===== mockup.js ===== */
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
  const doc=await engine.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'./rotulom/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./rotulom/vendor/pdfjs/standard_fonts/',wasmUrl:'./rotulom/vendor/pdfjs/wasm/',isEvalSupported:false}).promise;
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

;
/* ===== medlom-module.js ===== */
(() => {
 const $=id=>document.getElementById(id);
 document.title='MedLoM · Rotulación';document.body.classList.add('medlom-embedded');
 document.querySelector('.brand').textContent='Rotulación';
 const materials=$('view-presupuestos');
 const nav=document.createElement('button');nav.className='nav-item';nav.innerHTML='<span class="nav-icon">⚙</span><span>Ajustes</span>';document.querySelector('.main-nav').append(nav);
 function openMaterials(){if($('imageWorkspace').classList.contains('expanded'))$('expandImage').click();document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v===materials));$('currentCrumb').textContent='Ajustes';window.scrollTo(0,0);}
 nav.onclick=openMaterials;
 materials.querySelector('.page-heading h1').textContent='Ajustes';materials.querySelector('.page-heading p').textContent='Materiales, precios y fichas propias de vehículos.';
 materials.querySelector('.page-heading').append($('goMaterials'));$('goMaterials').onclick=()=>{$('simpleMaterialForm').scrollIntoView({behavior:'smooth',block:'start'});$('materialName').focus({preventScroll:true});};

 $('backToCalculation').onclick=()=>document.querySelector('[data-step="2"]').click();
 const root=document.documentElement;
 const tokens={
  '--bg':'--bg','--surface':'--panel','--surface-soft':'--raise','--line':'--line',
  '--line-strong':'--line','--ink':'--fg','--ink-soft':'--muted','--muted':'--muted',
  '--accent':'--accent','--accent-ink':'--accent-ink','--accent-text':'--accent-text',
  '--accent-soft':'--raise','--accent-strong':'--accent','--warning-bg':'--raise',
  '--warning':'--accent-text','--danger':'--danger','--medlom-field':'--field',
  '--medlom-header':'--bar','--f-body':'--f-body','--f-display':'--f-display'
 };
 function theme(){
  try{
   if(window.__ROT_EMBED||parent===window)return;
   const source=parent.document,parentRoot=source.documentElement;
   const ref=parent.getComputedStyle(parentRoot),body=parent.getComputedStyle(source.body);
   for(const [to,from] of Object.entries(tokens)){
    const value=ref.getPropertyValue(from).trim();
    if(value)root.style.setProperty(to,value);else root.style.removeProperty(to);
   }
   for(const key of ['btn','btnfill','upper','piece']){
    if(parentRoot.dataset[key])root.dataset[key]=parentRoot.dataset[key];else delete root.dataset[key];
   }
   root.style.colorScheme=ref.colorScheme;
   for(const key of ['Image','Size','Position','Attachment']) root.style.setProperty('--medlom-bg-'+key.toLowerCase(),body['background'+key]);
   if(!document.getElementById('medlom-theme-fonts')){
    const fonts=document.createElement('style');fonts.id='medlom-theme-fonts';
    fonts.textContent=[...source.styleSheets].flatMap(sheet=>{
     try{return [...sheet.cssRules].filter(rule=>rule.type===CSSRule.FONT_FACE_RULE).map(rule=>rule.cssText.replace(/url\(["']?([^"')]+)["']?\)/g,(_,url)=>'url("'+new URL(url,sheet.href||source.baseURI).href+'")'));}
     catch{return [];}
    }).join('\n');
    document.head.append(fonts);
   }
   if(!root.dataset.medlomTheme){
    root.dataset.medlomTheme='1';
    new MutationObserver(theme).observe(parentRoot,{attributes:true});
   }
  }catch{}
 }
 window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='medlom-materials')openMaterials();if(e.data?.type==='medlom-theme')theme();});theme();
 const transfer=document.createElement('div');transfer.className='workflow-actions';transfer.innerHTML='<button id="exportMaterials" class="button button-secondary">Exportar materiales</button><label class="button button-secondary" for="importMaterials">Importar materiales (JSON)<input id="importMaterials" type="file" accept="application/json,.json" hidden></label><p id="materialTransferStatus" role="status"></p>';materials.querySelector('.simple-material-form').prepend(transfer);
 $('exportMaterials').onclick=()=>{const payload={app:'MedLoM',version:1,materials:JSON.parse(localStorage.getItem('rotulom-materials')||'[]')};parent.postMessage({type:'medlom-export-materials',text:JSON.stringify(payload,null,2)},location.origin);};
 $('importMaterials').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>2*1024*1024)throw Error('El archivo supera 2 MB');const parsed=JSON.parse(await f.text()),items=Array.isArray(parsed)?parsed:parsed.materials;if(!Array.isArray(items)||!items.every(m=>m&&typeof m.id==='string'&&typeof m.name==='string'&&Number.isFinite(m.price)&&m.price>=0&&['m²','m lineal','unidad'].includes(m.unit)&&(m.unit!=='m lineal'||m.rollCm>0)&&(m.pricing!=='table'||(m.unit==='m²'&&window.RotulomPricing.validatePoints(m.points)))))throw Error('La biblioteca de materiales no es válida');if(!confirm('¿Importar '+items.length+' materiales? Se actualizarán los que tengan el mismo identificador.'))return;const map=new Map(JSON.parse(localStorage.getItem('rotulom-materials')||'[]').map(m=>[m.id,m]));items.forEach(m=>map.set(m.id,m));localStorage.setItem('rotulom-materials',JSON.stringify([...map.values()]));localStorage.setItem('rotulom-clickprinting-v1','1');window.rotulomSession.refreshMaterials();$('materialTransferStatus').textContent='Materiales importados';}catch(err){$('materialTransferStatus').textContent=err.message;}};
 const custom=document.createElement('section');custom.className='panel material-panel';custom.innerHTML='<h2>Añadir una ficha de vehículo</h2><p>Para una variante que no esté en el catálogo. Todas las medidas se introducen en cm. Guarda el enlace de la fuente y comprueba la unidad real antes de usarla.</p><form id="customVehicle" class="form-grid"><label>Marca<input name="make" required maxlength="60"></label><label>Modelo y versión<input name="model" required maxlength="150"></label><label>Año o generación<input name="generation" required maxlength="80"></label><label>Categoría<select name="category"><option>Coche</option><option>Furgoneta</option><option>Furgoneta con caja</option></select></label><label>Longitud (cm)<input name="length" type="number" min="1" max="3000" step="0.1" required></label><label>Ancho de carrocería (cm)<input name="width" type="number" min="1" max="500" step="0.1" required></label><label>Altura (cm)<input name="height" type="number" min="1" max="600" step="0.1" required></label><label>Modelo de caja, si corresponde<input name="box" maxlength="100"></label><label class="span-2">Enlace a la ficha de la fuente<input name="source" type="url" required placeholder="https://…"></label><button type="submit" class="button button-primary">Guardar ficha</button><p id="customVehicleStatus" role="status"></p></form>';materials.append(custom);
 $('customVehicle').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),headers=['id','make','model','generation','category','source_url','exterior_length_mm','exterior_width_mm','exterior_height_mm','box_model','verification_status'],values=['custom-'+crypto.randomUUID(),f.get('make'),f.get('model'),f.get('generation'),f.get('category'),f.get('source'),Number(f.get('length'))*10,Number(f.get('width'))*10,Number(f.get('height'))*10,f.get('box'),'pendiente'],quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';try{const response=await fetch('/api/vehicles/import',{method:'POST',body:JSON.stringify({csv:headers.join(',')+'\n'+values.map(quote).join(',')})}),data=await response.json();if(!response.ok||data.ignored)throw Error(data.error||data.errors?.[0]?.error||'No se pudo añadir la ficha');await window.rotulomCatalogue.reload();e.target.reset();$('customVehicleStatus').textContent='Ficha guardada. Su fuente queda pendiente de contraste.';}catch(err){$('customVehicleStatus').textContent=err.message;}};
 parent.postMessage({type:'medlom-rotulacion-ready'},location.origin);
})();

;
/* ===== saved-jobs.js ===== */
(() => {
  if(new URLSearchParams(location.search).get('mode')==='materials')return;
  const $=id=>document.getElementById(id),prefix='rot:job:',key='rotulom-current-job';
  let db,currentId=localStorage.getItem(key)||prefix+crypto.randomUUID(),ready=false,loading=false,timer,revision=0,saving=false,again=false;
  const bar=document.createElement('section');bar.className='job-bar panel';
  bar.innerHTML='<div class="field"><label for="jobName">Nombre de la foto o proyecto</label><input id="jobName" maxlength="120" value="Trabajo de rotulación"></div><div class="field"><label for="jobProject">Proyecto de MedLoM</label><select id="jobProject"><option value="">Sin proyecto</option></select></div><div class="field"><label for="savedJob">Trabajos guardados</label><select id="savedJob"><option value="">Elige un trabajo</option></select></div><div class="workflow-actions"><button id="saveJob" class="button button-primary">Guardar ahora</button><button id="newJob" class="button button-secondary">Nuevo trabajo</button><button id="deleteJob" class="text-button">Eliminar trabajo</button></div><p id="jobStatus" role="status">Abriendo trabajos guardados…</p>';
  $('workflowStep0').prepend(bar);
  const management=document.createElement('details');management.className='panel simple-reference-details job-management';management.innerHTML='<summary>Gestionar trabajos guardados</summary>';
  management.append($('jobProject').closest('.field'),$('savedJob').closest('.field'));
  const actions=document.createElement('div');actions.className='workflow-actions';actions.append($('newJob'),$('deleteJob'));management.append(actions);$('view-presupuestos').append(management);
  const saveArea=document.createElement('div');saveArea.className='material-save-area';saveArea.append($('saveJob'),$('jobStatus'));$('workflowStep2').querySelector('.simple-result-panel').append(saveArea);
  bar.querySelector('.workflow-actions').remove();

  const status=t=>$('jobStatus').textContent=t;
  const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('cotafoto',2);r.onupgradeneeded=()=>{for(const n of ['photos','projects','meta','scans'])if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cierra las otras ventanas de MedLoM para abrir el almacenamiento'));});
  const request=(mode,fn)=>new Promise((resolve,reject)=>{const t=db.transaction('meta',mode),r=fn(t.objectStore('meta'));t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});
  const get=id=>request('readonly',s=>s.get(id));
  const put=value=>request('readwrite',s=>s.put(value));
  async function list(){const jobs=await request('readonly',s=>s.getAll(IDBKeyRange.bound(prefix,prefix+'\uffff')));$('savedJob').replaceChildren(new Option('Elige un trabajo',''));for(const j of jobs.filter(j=>!j.deleted).sort((a,b)=>b.updated-a.updated))$('savedJob').add(new Option(j.name||'Sin nombre',j.id));$('savedJob').value=currentId;}
  async function save(){if(!ready||loading)return false;if(saving){again=true;return false;}saving=true;clearTimeout(timer);timer=null;const rev=revision,id=currentId;try{status('Guardando…');const session=await window.rotulomSession.export();if(id!==currentId)return;const previous=await get(id);await put({id,name:$('jobName').value.trim()||'Trabajo de rotulación',projectId:$('jobProject').value||null,updated:Math.max(Date.now(),(previous?.updated||0)+1),session,summary:window.rotulomSession.summary(),thumb:await window.rotulomSession.thumbnail()});localStorage.setItem(key,id);await list();status('Guardado en MedLoM');parent.postMessage({type:'medlom-rotulacion-changed'},location.origin);return true;}catch(e){status('No se pudo guardar: '+e.message);return false;}finally{saving=false;if(again||rev!==revision){again=false;schedule();}}}
  function schedule(){if(!ready||loading)return;revision++;clearTimeout(timer);status('Cambios pendientes de guardar…');timer=setTimeout(save,500);}
  async function load(id){clearTimeout(timer);if(saving){again=true;status('Espera a que termine el guardado');return;}loading=true;try{const job=await get(id);if(!job||job.deleted)throw Error('Este trabajo ya no está disponible');await window.rotulomSession.import(job.session);currentId=id;$('jobName').value=job.name;$('jobProject').value=job.projectId||'';bar.dataset.project=job.projectId||'';localStorage.setItem(key,id);await list();status('Trabajo recuperado');return true;}catch(e){status('No se pudo abrir: '+e.message);return false;}finally{loading=false;}}
  $('saveJob').onclick=async()=>{if(!window.rotulomSession.summary().documents){status('Abre una foto o un PDF antes de guardar.');return;}if(await window.rotulomJobs.flush())parent.postMessage({type:'medlom-job-saved',id:currentId},location.origin);};$('jobName').oninput=schedule;$('jobProject').onchange=()=>{bar.dataset.project=$('jobProject').value;schedule();};
  $('savedJob').onchange=async e=>{const id=e.target.value;if(!id||id===currentId)return;if(await save())await load(id);};
  $('newJob').onclick=async()=>{if(!await save())return;loading=true;try{currentId=prefix+crypto.randomUUID();$('jobName').value='Trabajo de rotulación';$('jobProject').value='';bar.dataset.project='';await window.rotulomSession.import({version:1,docs:[],active:-1});localStorage.setItem(key,currentId);await list();status('Trabajo nuevo. Se guardará automáticamente.');}finally{loading=false;}};
  $('deleteJob').onclick=async()=>{if(!confirm('¿Eliminar este trabajo guardado?'))return;clearTimeout(timer);if(saving){status('Espera a que termine el guardado');return;}try{const old=await get(currentId);if(old)await put({id:old.id,name:old.name,deleted:true,updated:Date.now()});loading=true;currentId=prefix+crypto.randomUUID();$('jobName').value='Trabajo de rotulación';await window.rotulomSession.import({version:1,docs:[],active:-1});localStorage.setItem(key,currentId);await list();status('Trabajo eliminado');parent.postMessage({type:'medlom-rotulacion-changed'},location.origin);}catch(e){status(e.message);}finally{loading=false;}};
  window.rotulomJobs={flush:async()=>{while(saving)await new Promise(r=>setTimeout(r,20));return save();},pause:async()=>{clearTimeout(timer);while(saving)await new Promise(r=>setTimeout(r,20));await save();loading=true;},resume:()=>{loading=false;}};
  window.addEventListener('rotulom-change',schedule);
  window.addEventListener('pagehide',()=>{if(ready&&!loading)save();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
  window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='medlom-projects'){const selected=bar.dataset.project||$('jobProject').value;$('jobProject').replaceChildren(new Option('Sin proyecto',''));for(const p of e.data.projects||[])$('jobProject').add(new Option(p.name,p.id));$('jobProject').value=selected;}if(['medlom-refresh-materials','medlom-refresh-data'].includes(e.data?.type)){window.rotulomSession.refreshMaterials();window.rotulomCatalogue.reload();list().then(async()=>{if(!saving&&!timer){const current=await get(currentId);if(current&&!current.deleted)await load(currentId);}}).catch(e=>status(e.message));}});
  window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='medlom-job-action'||!ready)return;const action=e.data.action;if(action==='forget'){if(e.data.id===currentId){clearTimeout(timer);loading=true;try{currentId=prefix+crypto.randomUUID();localStorage.setItem(key,currentId);$('jobName').value='Trabajo de rotulación';$('jobProject').value='';bar.dataset.project='';await window.rotulomSession.import({version:1,docs:[],active:-1});await list();}finally{loading=false;}}return;}if(action==='new'){await window.rotulomJobs.flush();await $('newJob').onclick();window.rotulomNavigation.showStep(0);}else if(action==='open'&&typeof e.data.id==='string'&&e.data.id.startsWith(prefix)){if(!await window.rotulomJobs.flush())return;if(await load(e.data.id))window.rotulomNavigation.showStep(window.rotulomSession.summary().documents?1:0);}});
  parent.postMessage({type:'medlom-request-projects'},location.origin);
  (async()=>{try{db=await open();ready=true;const job=await get(currentId);if(job&&!job.deleted)await load(currentId);else{await list();status('Los cambios se guardan automáticamente en MedLoM');}parent.postMessage({type:'medlom-jobs-ready'},location.origin);}catch(e){ready=false;status('El almacenamiento no está disponible: '+e.message);}})();
})();
