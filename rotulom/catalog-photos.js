/* Plantillas exactas por versión; nunca se sustituye un vehículo por un icono. */
window.vehicleCatalogPhoto = (vehicle, compact=false) => {
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const meta=vehicle.catalogueDetails||{},personal=meta.profileImageSource==='Aportada por el usuario'&&meta.profileImageUrl;
 const cls='catalog-photo '+(compact?'compact-photo':'');
 if(personal)return `<figure class="${cls}"><img loading="lazy" src="${esc(meta.profileImageUrl)}" alt="Fotografía aportada por el usuario"><figcaption><b>Fotografía aportada por el usuario</b></figcaption></figure>`;
 const art=meta.templateArtwork,clip=art?.views?.lateral?.clip,size=art?.atlasSize;
 const valid=art&&/^[a-z0-9-]+\.webp$/.test(art.atlas)&&Array.isArray(size)&&size.length===2&&size.every(n=>Number.isFinite(n)&&n>0)&&Array.isArray(clip)&&clip.length===4&&clip.every(Number.isFinite)&&clip[0]>=0&&clip[1]>=0&&clip[2]>0&&clip[3]>0&&clip[0]+clip[2]<=size[0]&&clip[1]+clip[3]<=size[1];
 if(!valid)return `<figure class="${cls}"><div class="photo-unavailable">Plantilla no disponible</div></figure>`;
 const src=new URL('./artwork/templates/'+art.atlas,document.baseURI).href,title='Plantilla · '+vehicle.make+' '+vehicle.model+' · '+(vehicle.variant||'');
 return `<figure class="${cls}" data-catalog-template="${esc(meta.templateId)}"><svg viewBox="${clip.join(' ')}" role="img" aria-label="${esc(title)}"><image href="${esc(src)}" width="${size[0]}" height="${size[1]}"/></svg><figcaption><b>Plantilla de esta versión</b>${compact?'':'<span>Referencia exterior nominal</span>'}</figcaption></figure>`;
};
