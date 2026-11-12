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
