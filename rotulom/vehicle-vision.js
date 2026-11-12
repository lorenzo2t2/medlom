/* Similitud visual local con el catálogo; nunca confirma por sí sola una versión. */
(() => {
  const base=new URL('./vendor/vision/',document.currentScript.src),json=url=>fetch(url).then(r=>{if(!r.ok)throw Error('Motor visual no disponible');return r.json();});
  let enginePromise,indexPromise;
  function script(name){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL(name,base);s.onload=resolve;s.onerror=()=>reject(Error('No se pudo abrir el motor visual local'));document.head.append(s);});}
  async function engine(){
    if(!enginePromise)enginePromise=(async()=>{
      await script('tf.min.js');await script('tf-backend-wasm.min.js');
      tf.wasm.setWasmPaths(base.href);tf.wasm.setThreadsCount(1);await tf.setBackend('wasm');await tf.ready();
      const net=await tf.loadLayersModel(new URL('model.json',base).href);
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
  async function index(){if(!indexPromise)indexPromise=Promise.all([json(new URL('index.json',base)),fetch(new URL('vectors.bin',base)).then(r=>{if(!r.ok)throw Error('Índice visual no disponible');return r.arrayBuffer();})]).then(([meta,buffer])=>{const vectors=new Float32Array(buffer);if(vectors.length!==meta.entries.length*meta.dimension)throw Error('Índice visual incompleto');return{...meta,vectors};}).catch(e=>{indexPromise=null;throw e;});return indexPromise;}
  async function suggest(image,bounds,vehicles){
    const bank=await index(),valid=new Map(vehicles.map(v=>[v.id,v])),features=[await embedding(image,bounds),await embedding(image,bounds,true)],families=new Map();
    const model=await engine(),classification=tf.tidy(()=>model.classifier.predict(tf.browser.fromPixels(crop(image,bounds)).toFloat().div(127.5).sub(1).expandDims())),prob=await classification.data();classification.dispose();const van=prob[654]+prob[656]+prob[675]+prob[757],car=prob[407]+prob[436]+prob[468]+prob[511]+prob[609]+prob[661]+prob[817];
    for(let n=0;n<bank.entries.length;n++){const v=valid.get(bank.entries[n]);if(!v)continue;let score=-1;for(const f of features){let sum=0;for(let j=0;j<bank.dimension;j++)sum+=f[j]*bank.vectors[n*bank.dimension+j];score=Math.max(score,sum);}const key=(v.make+' '+v.model).toLowerCase(),old=families.get(key);if(!old||score>old.score)families.set(key,{vehicle:v,score});}
    return [...families.values()].filter(r=>!(van>.12&&van>car*1.8)||['Furgoneta','Furgoneta con caja'].includes(r.vehicle.category)||/multivan|caravelle|tourneo|traveller|evalia|proace|spacetourer|transit|nv200|staria/i.test(r.vehicle.model)).sort((a,b)=>b.score-a.score).filter(r=>r.score>=.65).slice(0,4);
  }
  window.RotulomVision={embedding,suggest,crop};
})();
