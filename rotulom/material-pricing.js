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
