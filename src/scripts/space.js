import { $, reduce, SC, state } from './lib.js';
import { Sfx } from './sfx.js';

/* ---------- space background: Milky Way, real star colors, lit planets ---------- */
(function(){
  var cv=$('#space'),g=cv.getContext('2d',{alpha:false}),W,H,dpr,S,sky,twk=[],earth,moon,giant,mars,ready=false,raf=0,last=0,slow=0,lite=false,
      px=0,py=0,tx=0,ty=0,ang=0,met=null,tM=6,sat=null,tS=25,wp=[],BL={},ER=0,ECX=0,ECY=0;
  var R=function(a,b){return a+Math.random()*(b-a)},G=function(){return(Math.random()+Math.random()+Math.random()+Math.random()-2)/2};
  function H2(x,y,s){var n=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453;return n-Math.floor(n)}
  function vn(x,y,s){var xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    return(H2(xi,yi,s)*(1-u)+H2(xi+1,yi,s)*u)*(1-v)+(H2(xi,yi+1,s)*(1-u)+H2(xi+1,yi+1,s)*u)*v}
  function fbm(x,y,s,o){var a=.5,t=0;for(var i=0;i<o;i++){t+=a*vn(x,y,s+i);x=x*2.03+17;y=y*2.03+9;a*=.5}return t}
  function mk(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c}
  function blob(rgb){if(BL[rgb])return BL[rgb];var c=mk(64,64),x=c.getContext('2d'),a=x.createRadialGradient(32,32,0,32,32,32);
    a.addColorStop(0,'rgba('+rgb+',1)');a.addColorStop(1,'rgba('+rgb+',0)');x.fillStyle=a;x.fillRect(0,0,64,64);return BL[rgb]=c}

  function buildSky(){
    sky=mk(S,S);var x=sky.getContext('2d'),m=S/2,a=-.62,ca=Math.cos(a),sa=Math.sin(a),sc=S/2400,sg=S*.055,i,t,o,p,b,r;
    function pos(t,o){return[m+ca*t-sa*o,m+sa*t+ca*o]}
    function core(t){return .2+.8*Math.exp(-Math.pow(t/(S*.22),2))}
    x.fillStyle='#01020a';x.fillRect(0,0,S,S);
    var B=[blob('255,226,190'),blob('200,216,255'),blob('255,170,140')];
    for(i=0;i<(lite?1300:2600);i++){t=(Math.random()-.5)*S*1.35;o=G()*sg*(1+.6*Math.random());p=pos(t,o);b=core(t);r=(26+Math.random()*110)*sc*(.6+b*.8);
      x.globalAlpha=(.018+Math.random()*.03)*b*1.3;x.drawImage(B[Math.random()<.5?0:Math.random()<.8?1:2],p[0]-r,p[1]-r,r*2,r*2)}
    var D=blob('1,2,8');
    for(i=0;i<(lite?300:700);i++){t=(Math.random()-.5)*S*1.2;o=G()*sg*.45+(Math.random()<.5?-1:1)*sg*.08;p=pos(t,o);b=core(t);r=(14+Math.random()*60)*sc;
      x.globalAlpha=(.06+Math.random()*.09)*b;x.save();x.translate(p[0],p[1]);x.rotate(a+R(-.3,.3));x.scale(2.4,1);x.drawImage(D,-r,-r,r*2,r*2);x.restore()}
    function neb(rgb,cx,cy,rx,ry,al,rot){x.save();x.globalAlpha=al;x.translate(cx,cy);x.rotate(rot);x.drawImage(blob(rgb),-rx,-ry,rx*2,ry*2);x.restore()}
    neb('255,80,130',S*.28,S*.62,170*sc,120*sc,.09,.4);neb('90,200,210',S*.7,S*.3,220*sc,140*sc,.06,-.5);neb('180,120,255',S*.45,S*.2,150*sc,90*sc,.05,.2);
    neb('255,236,210',S*.78,S*.7,70*sc,22*sc,.5,-.6);neb('255,255,255',S*.78,S*.7,12*sc,6*sc,.7,-.6);
    for(i=0;i<(lite?2500:6000);i++){t=(Math.random()-.5)*S*1.3;o=G()*sg*1.3;p=pos(t,o);b=core(t);if(Math.random()>b+.1)continue;
      x.globalAlpha=.12+Math.random()*.5;x.fillStyle=Math.random()<.5?'#fff':'#ffe9cf';x.fillRect(p[0],p[1],1,1)}
    var T=['170,200,255','210,225,255','255,255,255','255,244,214','255,214,170','255,180,150'],tw=[];
    for(i=0;i<(lite?900:1900);i++){var u=Math.pow(Math.random(),5),s=.5+u*2.1,al=.28+.72*Math.pow(Math.random(),1.6),X=Math.random()*S,Y=Math.random()*S,c=T[Math.random()*6|0];
      if(s>1.25){var q=s*7;x.globalAlpha=al*.35;x.drawImage(blob(c),X-q,Y-q,q*2,q*2)}
      x.globalAlpha=al;x.fillStyle='rgb('+c+')';x.beginPath();x.arc(X,Y,s*.7,0,7);x.fill();
      if(s>1.5)tw.push({x:X-m,y:Y-m,s:s,f:'rgb('+c+')',ph:Math.random()*6.28,sp:R(.6,2)})}
    x.globalAlpha=1;twk=tw}

  function sphere(sz,shade){var c=mk(sz,sz),x=c.getContext('2d'),im=x.createImageData(sz,sz),d=im.data,h=sz/2;
    for(var j=0;j<sz;j++)for(var i=0;i<sz;i++){var nx=(i+.5-h)/h,ny=(j+.5-h)/h,r2=nx*nx+ny*ny;if(r2>1.02)continue;
      var nz=Math.sqrt(Math.max(0,1-r2)),k=(j*sz+i)*4,col=shade(nx,ny,nz,Math.atan2(nx,nz),Math.asin(Math.max(-1,Math.min(1,ny)))),a=Math.max(0,Math.min(1,(1-Math.sqrt(r2))*h));
      d[k]=col[0];d[k+1]=col[1];d[k+2]=col[2];d[k+3]=a*255}
    x.putImageData(im,0,0);return c}
  function lamb(nx,ny,nz,p){return Math.pow(Math.max(0,nx*.62-ny*.34+nz*.71),p)}
  function buildBodies(){
    moon=sphere(180,function(nx,ny,nz,u,v){var m=fbm(u*1.4+2,v*1.4,3,4),cr=vn(u*16,v*16,5),b=150+m*70;if(m<.46)b*=.62;if(cr>.78)b*=.82;b*=.03+.97*Math.min(1,lamb(nx,ny,nz,.8)*1.3);return[b,b*.98,b*.94]});
    giant=sphere(240,function(nx,ny,nz,u,v){var b=fbm(u*.5,v*7+vn(u*3,v*3,2)*.8,6,4),c=b<.42?[150,100,70]:[200+b*50,160+b*50,110+b*40];
      if(Math.hypot((u-.5)*2.2,(v+.35)*3.6)<.28)c=[190,90,60];var f=.04+.96*Math.min(1,lamb(nx,ny,nz,.7)*1.25);return[c[0]*f,c[1]*f,c[2]*f]});
    mars=sphere(60,function(nx,ny,nz,u,v){var m=fbm(u*2,v*2,8,3),f=.04+.96*Math.min(1,lamb(nx,ny,nz,.8)*1.3);return[(160+m*50)*f,(88+m*30)*f,(60+m*20)*f]})}
  function buildEarth(){
    var w=Math.ceil(W/2),h=Math.ceil(Math.max(H*.45,260)/2),Rr=w*1.35,cx=w*.4,cy=h*.3+Rr;earth=mk(w,h);
    var x=earth.getContext('2d'),im=x.createImageData(w,h),d=im.data;ER=Rr;ECX=cx;ECY=cy;
    for(var j=0;j<h;j++)for(var i=0;i<w;i++){var dx=(i-cx)/Rr,dy=(j-cy)/Rr,r2=dx*dx+dy*dy,r=Math.sqrt(r2),k=(j*w+i)*4;
      if(r>1.08)continue;
      if(r>1){var lx=dx*.62-dy*.34,lt=Math.max(0,Math.min(1,.5+lx*2.2)),tt=(r-1)/.08,bl=Math.pow(1-Math.min(1,tt*2.2),2.2)*.75,gn=Math.exp(-Math.pow((tt-.5)/.16,2))*.1,sm=bl+gn,al=Math.min(1,sm*lt);if(al<=.002)continue;d[k]=(110*bl+120*gn)/sm;d[k+1]=(170*bl+255*gn)/sm;d[k+2]=(255*bl+170*gn)/sm;d[k+3]=al*255;continue}
      var nz=Math.sqrt(1-r2),df=Math.max(0,dx*.62-dy*.34+nz*.71),u=Math.atan2(dx,nz)*2.6,v=Math.asin(dy)*2.6+4,
          ht=fbm(u*1.3+3,v*1.3,1,5),cl=Math.max(0,Math.min(1,(fbm(u*2.4+7,v*2.4,9,5)-.5)*3.6)),land=ht>.53,col;
      if(land){var t=Math.min(1,(ht-.53)*5),dz=vn(u*3,v*3,4);col=[58+t*70+dz*40,92+t*22-dz*22,48+t*20]}
      else{var dp=Math.min(1,(.53-ht)*4);col=[16-dp*8,66-dp*28,128-dp*40]}
      var lit=Math.min(1,Math.max(0,(df-.02)*3)),sp=land?0:Math.pow(df,28)*140,
          rr=col[0]*(.03+.97*lit)+sp,gg=col[1]*(.03+.97*lit)+sp,bb=col[2]*(.04+.96*lit)+sp;
      rr=rr*(1-cl)+(240*lit+10)*cl;gg=gg*(1-cl)+(244*lit+12)*cl;bb=bb*(1-cl)+(250*lit+16)*cl;
      if(lit<.25&&land&&H2(i,j,3)>.985){var ci=1-lit/.25;rr+=255*ci;gg+=190*ci;bb+=110*ci}
      var at=Math.pow(1-nz,3)*(.25+.75*lit)*1.4;rr+=90*at;gg+=160*at;bb+=255*at;
      d[k]=Math.min(255,rr);d[k+1]=Math.min(255,gg);d[k+2]=Math.min(255,bb);d[k+3]=255}
    x.putImageData(im,0,0)}

  function frame(dt){
    var s=dt/1000,t=performance.now()/1000,i,sy=SC.y,p=SC.p;px+=(tx-px)*.05;py+=(ty-py)*.05;
    g.fillStyle='#01020a';g.fillRect(0,0,W,H);
    if(!reduce&&!lite)ang+=s*.0009;
    g.save();g.translate(W*.55-px*10,H*.35-py*8-sy*.02);g.rotate(ang+p*.45);g.drawImage(sky,-S/2,-S/2);
    if(!lite&&!reduce)for(i=0;i<twk.length;i++){var q=twk[i];g.globalAlpha=(.35+.35*Math.sin(t*q.sp+q.ph))*(q.s>2?1:.7);g.fillStyle=q.f;g.beginPath();g.arc(q.x,q.y,q.s*.8,0,7);g.fill()}
    g.restore();g.globalAlpha=1;
    if(ready){
      var zs=1+p*.55,mr=(W<700?22:34)*zs,gr=(W<700?42:70)*zs;
      g.drawImage(giant,W*.09-px*22-gr,H*.2-py*14-sy*.05-gr,gr*2,gr*2);
      g.drawImage(mars,W*.36-px*12-9,H*.11-py*8-sy*.03-9,18,18);
      g.drawImage(moon,W*.84-px*18-mr,H*.17-py*12-sy*.04-mr,mr*2,mr*2);
      var eh=earth.height*2,ey=Math.min(1,p*2.2)*eh*1.1;g.drawImage(earth,-20-px*10,H-eh+ey,W+40,eh);
      var gl=1-Math.min(1,p*3);if(gl>.02&&ER){var gx=W*.9,u=(gx+20+px*10)/(W+40)*earth.width,dd=ER*ER-(u-ECX)*(u-ECX);if(dd>0){var gy=H-eh+ey+(ECY-Math.sqrt(dd))*2,gr2=W*.3,gg=g.createRadialGradient(gx,gy,0,gx,gy,gr2);gg.addColorStop(0,'rgba(255,244,222,'+(.55*gl)+')');gg.addColorStop(.25,'rgba(255,214,170,'+(.18*gl)+')');gg.addColorStop(1,'rgba(255,200,150,0)');g.globalCompositeOperation='lighter';g.fillStyle=gg;g.fillRect(gx-gr2,gy-gr2,gr2*2,gr2*2);g.globalCompositeOperation='source-over'}}}
    if(!reduce&&!lite){
      tM-=s*(1+SC.vel);if(tM<0&&!met){var a=R(.35,.7);Sfx.meteor();met={x:R(W*.3,W),y:R(0,H*.35),vx:-Math.cos(a)*1100,vy:Math.sin(a)*1100,l:R(.5,.9),t:0};tM=R(7,16)}
      if(met){met.t+=s;met.x+=met.vx*s;met.y+=met.vy*s;var f=1-met.t/met.l;if(f<=0)met=null;else{var mg=g.createLinearGradient(met.x,met.y,met.x-met.vx*.12,met.y-met.vy*.12);
        mg.addColorStop(0,'rgba(255,255,255,'+f+')');mg.addColorStop(1,'rgba(255,255,255,0)');g.strokeStyle=mg;g.lineWidth=1.6;g.beginPath();g.moveTo(met.x,met.y);g.lineTo(met.x-met.vx*.12,met.y-met.vy*.12);g.stroke()}}
      tS-=s;if(tS<0&&!sat){sat={x:-10,y:R(H*.1,H*.5),vx:R(35,55),vy:R(8,20)};tS=R(40,70)}
      if(sat){sat.x+=sat.vx*s;sat.y+=sat.vy*s;g.fillStyle='rgba(255,250,230,'+(.65+.3*Math.sin(t*3))+')';g.beginPath();g.arc(sat.x,sat.y,1.3,0,7);g.fill();if(sat.x>W+10||sat.y>H)sat=null}}
    if(SC.vel>1.8)state.warp=Math.max(state.warp,Math.min(.55,(SC.vel-1.8)*.25));if(state.warp>0){state.warp=Math.max(0,state.warp-s*.5);var cx=W/2,cy=H/2,md=Math.hypot(W,H)/2;g.strokeStyle='rgba(200,225,255,'+Math.min(1,state.warp*.9)+')';g.lineWidth=1.2;g.beginPath();
      for(i=0;i<wp.length;i++){var w=wp[i],dd=(t*700*(.4+w.z)+w.d)%md,L=state.warp*140*w.z+2,ca=Math.cos(w.a),sa=Math.sin(w.a);g.moveTo(cx+ca*dd,cy+sa*dd);g.lineTo(cx+ca*(dd+L),cy+sa*(dd+L))}g.stroke()}
  }
  function loop(n){var dt=Math.min(50,n-(last||n));last=n;frame(dt);
    if(!lite&&!reduce){slow=dt>30?slow+1:Math.max(0,slow-1);if(slow>120){lite=true;buildSky()}}
    raf=(!reduce&&!document.hidden)?requestAnimationFrame(loop):0;if(!raf)last=0}
  function kick(){if(!raf){last=0;raf=requestAnimationFrame(loop)}}
  function size(){
    dpr=Math.min(devicePixelRatio||1,1.5);W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;g.setTransform(dpr,0,0,dpr,0,0);
    S=Math.min(2800,Math.ceil(Math.hypot(W,H)*1.25));buildSky();ready=false;wp=[];for(var i=0;i<160;i++)wp.push({a:R(0,6.283),d:R(0,1500),z:R(.3,1)});
    kick();clearTimeout(size.t);size.t=setTimeout(function(){if(!moon)buildBodies();buildEarth();ready=true;kick()},40)}
  size();
  addEventListener('resize',function(){clearTimeout(size.r);size.r=setTimeout(size,200)});
  if(!reduce){addEventListener('pointermove',function(e){tx=e.clientX/W*2-1;ty=e.clientY/H*2-1},{passive:true})}
  document.addEventListener('visibilitychange',function(){if(!document.hidden)kick()});
})();

