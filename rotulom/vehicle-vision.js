/* Similitud visual local con el catálogo; nunca confirma por sí sola una versión. */
(() => {
  /* El motor (≈23 MB) no va dentro de la app de Android: se descarga la primera vez que se usa y queda guardado
     en el dispositivo (Cache API). En la versión web se lee de la propia carpeta. */
  const REMOTE='https://lorenzo2t2.github.io/medlom/rotulom/vendor/vision/',LOCAL=new URL('./vendor/vision/',document.currentScript.src),CACHE='rotulom-vision-v1';
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
  async function index(){if(!indexPromise)indexPromise=(async()=>{await base();const [meta,buffer]=await Promise.all([load(new URL('index.json',baseUrl)).then(r=>r.json()),load(new URL('vectors.bin',baseUrl)).then(r=>r.arrayBuffer())]);const vectors=new Float32Array(buffer);if(vectors.length!==meta.entries.length*meta.dimension)throw Error('Índice visual incompleto');return{...meta,vectors};})().catch(e=>{indexPromise=null;throw e;});return indexPromise;}
  async function suggest(image,bounds,vehicles){
    const bank=await index(),valid=new Map(vehicles.map(v=>[v.id,v])),features=[await embedding(image,bounds),await embedding(image,bounds,true)],families=new Map();
    const model=await engine(),classification=tf.tidy(()=>model.classifier.predict(tf.browser.fromPixels(crop(image,bounds)).toFloat().div(127.5).sub(1).expandDims())),prob=await classification.data();classification.dispose();const van=prob[654]+prob[656]+prob[675]+prob[757],car=prob[407]+prob[436]+prob[468]+prob[511]+prob[609]+prob[661]+prob[817];
    for(let n=0;n<bank.entries.length;n++){const v=valid.get(bank.entries[n]);if(!v)continue;let score=-1;for(const f of features){let sum=0;for(let j=0;j<bank.dimension;j++)sum+=f[j]*bank.vectors[n*bank.dimension+j];score=Math.max(score,sum);}const key=(v.make+' '+v.model).toLowerCase(),old=families.get(key);if(!old||score>old.score)families.set(key,{vehicle:v,score});}
    return [...families.values()].filter(r=>!(van>.12&&van>car*1.8)||['Furgoneta','Furgoneta con caja'].includes(r.vehicle.category)||/multivan|caravelle|tourneo|traveller|evalia|proace|spacetourer|transit|nv200|staria/i.test(r.vehicle.model)).sort((a,b)=>b.score-a.score).filter(r=>r.score>=.65).slice(0,4);
  }
  window.RotulomVision={embedding,suggest,crop};
})();
