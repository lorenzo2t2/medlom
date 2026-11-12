(() => {
  window.ROTU_ANDROID=false;
  const nativeFetch=window.fetch.bind(window),KEY='rotulom-mobile-vehicles-v1';
  let seedPromise;
  const stored=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}};
  async function vehicles(){seedPromise=seedPromise||nativeFetch('./data/vehicles.json').then(r=>r.json());const seed=await seedPromise;const base=new URL('./',location.href).pathname;for(const v of seed){if(v.imageUrl?.startsWith('/data/'))v.imageUrl=base+v.imageUrl.slice(1);const d=v.catalogueDetails;if(d?.profileImageUrl?.startsWith('/data/'))d.profileImageUrl=base+d.profileImageUrl.slice(1);}const overrides=stored(),map=new Map(seed.map(v=>[v.id,v]));Object.values(overrides).forEach(v=>map.set(v.id,v));return [...map.values()].sort((a,b)=>(a.make+' '+a.model).localeCompare(b.make+' '+b.model,'es'));}
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
