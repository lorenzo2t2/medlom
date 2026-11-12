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
