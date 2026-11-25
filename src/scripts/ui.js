import { $, $$, h, reduce, root, coarse, SC, state, lockScroll } from './lib.js';
import { Sfx } from './sfx.js';

/* ---------- skin ---------- */
export function skin(s){var ap=function(){root.dataset.skin=s};if(document.startViewTransition&&!reduce&&root.dataset.skin!==s)document.startViewTransition(ap);else ap();
  $$('.skin button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.skin===s))});try{localStorage.setItem('skin',s)}catch(e){}setTimeout(function(){if(window.__nav)window.__nav()},650)}
$$('.skin button').forEach(function(b){b.addEventListener('click',function(){skin(b.dataset.skin)})});skin(root.dataset.skin);

/* ---------- clocks ---------- */
var CLK=$$('.clk,#clock'),lastS='';
function tick(){if(document.hidden)return;var t=new Date(),s=('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2)+':'+('0'+t.getSeconds()).slice(-2);if(s===lastS)return;lastS=s;CLK.forEach(function(e){e.textContent=s})}
tick();setInterval(tick,1000);document.addEventListener('visibilitychange',tick);

/* ---------- hero: letters + typed terminal ---------- */
(function(){
  var g=$('#giant'),t=g.textContent.trim().split(''),K=[70,120,90,140,80,130,100,150],RT=[-5,4,-3,6,-4,3,-6,5];g.textContent='';
  t.forEach(function(ch,i){var w=h('span','gw'),l=h('span','gl',ch);w.style.setProperty('--k',K[i%8]);w.style.setProperty('--rt',RT[i%8]);l.style.setProperty('--i',i);w.appendChild(l);g.appendChild(w)});
  var el=$('#hterm'),L=[['whoami','rakib-ul-hasan-rabin'],['cat role.txt','Python developer, AI enthusiast, Linux & OS tinkerer'],['echo $LOCATION','Bangladesh']];
  function line(p,c){var d=h('div'),x=h('span',c||'');if(p){d.appendChild(h('span','p','$ '))}d.appendChild(x);el.appendChild(d);return x}
  if(reduce){L.forEach(function(r){line(1).textContent=r[0];line(0,'o').textContent=r[1]});line(1).className='cr';return}
  var i=0;
  function next(){if(i>=L.length){line(1).className='cr';return}var r=L[i++],x=line(1),j=0;
    (function ty(){x.textContent=r[0].slice(0,++j);Sfx.key();if(j<r[0].length)setTimeout(ty,50);else setTimeout(function(){line(0,'o').textContent=r[1];Sfx.enter();setTimeout(next,420)},280)})()}
  if(root.classList.contains('boot'))addEventListener('boot:done',function(){setTimeout(next,500)},{once:true});else setTimeout(next,600);
})();

/* ---------- reveals, spotlight, tilt, magnetic buttons, count-up ---------- */
(function(){
  var rv=$$('.rv');
  if(reduce||!('IntersectionObserver' in window)){rv.forEach(function(e){e.classList.add('in')})}
  else{var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{rootMargin:'0px 0px -8% 0px'});rv.forEach(function(e){io.observe(e)})}
  document.addEventListener('pointermove',function(e){var g=e.target.closest&&e.target.closest('.glow');if(!g)return;var r=g.getBoundingClientRect();g.style.setProperty('--mx',(e.clientX-r.left)+'px');g.style.setProperty('--my',(e.clientY-r.top)+'px')},{passive:true});
  if(!reduce&&!coarse){
    $$('.tilt').forEach(function(el){var f;
      el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;cancelAnimationFrame(f);f=requestAnimationFrame(function(){el.style.transform='perspective(1000px) rotateY('+(x*4)+'deg) rotateX('+(-y*4)+'deg)'})});
      el.addEventListener('pointerleave',function(){cancelAnimationFrame(f);el.style.transform=''})});
    $$('.mag').forEach(function(b){b.addEventListener('pointermove',function(e){var r=b.getBoundingClientRect();b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.22)+'px,'+((e.clientY-r.top-r.height/2)*.32)+'px)'});b.addEventListener('pointerleave',function(){b.style.transform=''})});
  }
  window.__count=function(box){$$('[data-n]',box).forEach(function(el){var n=+el.dataset.n;if(reduce){el.textContent=n;return}var t0=performance.now();(function f(t){var k=Math.min(1,(t-t0)/1400);el.textContent=Math.round(n*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)})};
})();

/* ---------- manifesto words ---------- */
(function(){
  var m=$('#mf'),w=m.textContent.trim().split(/\s+/);m.textContent='';
  w.forEach(function(t){m.appendChild(h('span','',t+' '))});var sp=[].slice.call(m.children);
  if(reduce||!('IntersectionObserver' in window)){sp.forEach(function(s){s.classList.add('on')});return}
  var io=new IntersectionObserver(function(en){en.forEach(function(x){x.target.classList.toggle('on',x.isIntersecting||x.boundingClientRect.top<innerHeight*.7)})},{rootMargin:'-30% 0px -30% 0px'});
  sp.forEach(function(s){io.observe(s)});
})();

/* ---------- navigation: sliding highlight, section tracking, mobile menu ---------- */
(function(){
  var nls=$$('.nl'),hl=$('#navhl'),menu=$('#menu'),mb=$('#mbtn'),cur=null;
  function place(a){if(!a){hl.style.opacity=0;return}hl.style.transform='translateX('+a.offsetLeft+'px) scaleX('+(a.offsetWidth/100)+')';hl.style.opacity=1}
  function active(id){cur=null;nls.forEach(function(a){var on=a.getAttribute('href')==='#'+id;a.setAttribute('aria-current',on?'true':'false');if(on)cur=a});place(cur)}
  window.__nav=function(){place(cur)};addEventListener('resize',window.__nav);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(window.__nav);
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting)active(x.target.id)})},{rootMargin:'-45% 0px -50% 0px'});
    ['hero','manifesto','focus','stack','archive','terminal','about','contact'].forEach(function(id){var e=document.getElementById(id);if(e)io.observe(e)})}
  function openMenu(v){menu.classList.toggle('open',v);mb.setAttribute('aria-expanded',String(v));mb.setAttribute('aria-label',v?'Close menu':'Open menu');lockScroll(v)}
  mb.addEventListener('click',function(){openMenu(!menu.classList.contains('open'))});
  $$('#menu a').forEach(function(a){a.addEventListener('click',function(){openMenu(false)})});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&menu.classList.contains('open'))openMenu(false)});
  addEventListener('resize',function(){if(innerWidth>980&&menu.classList.contains('open'))openMenu(false)});
})();

