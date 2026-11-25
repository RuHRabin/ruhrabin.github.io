import { $, $$, h, reduce, state, REPOS, ago } from './lib.js';
import { Sfx, setSound } from './sfx.js';
import { skin } from './ui.js';
import { reopenAll, listWindows } from './windows.js';

/* ---------- copy ---------- */
$$('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var m=$('#copied'),v=b.dataset.copy;
  function ok(){m.textContent='Copied '+v;setTimeout(function(){m.textContent=''},2400)}
  navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(v).then(ok,function(){m.textContent='Press and hold the address to copy it'}):m.textContent='Press and hold the address to copy it'})});

/* ---------- terminal ---------- */
(function(){
  var log=$('#log'),inp=$('#ti'),hist=[],hi=0;
  function out(t,c){log.appendChild(h('div',c||'',t));log.scrollTop=log.scrollHeight}
  var C={
   help:function(){return'help  whoami  skills  github  projects  neofetch  contact  theme mac|linux  sound on|off  music on|off  volume 0-100  windows  reopen  warp  clear'},
   whoami:function(){return'rakib-ul-hasan-rabin\nPython developer, AI enthusiast, Linux & OS tinkerer\nBangladesh'},
   skills:function(){return'python  bash  c  typescript\npytorch  tensorflow  scikit-learn  huggingface\nfastapi  supabase  firebase  docker\nnextjs  git  github  arch-linux'},
   github:function(){var s=state.gh||{};return'github.com/RuHRabin\n'+s.total+' contributions in the last year\n'+s.days+' active days, longest streak '+s.long+' days · busiest day '+s.best+'\n'+s.repos+' repositories · '+s.followers+' followers'},
   projects:function(){return REPOS.map(function(r){return r.n+'  ('+r.l+', '+ago(r.u)+')'}).join('\n')},
   neofetch:function(){return'rabin@ruhrbin\n-------------\nOS      Arch Linux\nShell   Bash\nLangs   Python, C, TypeScript\nFocus   AI / ML, systems, automation\nBase    Bangladesh\nStatus  Available for work'},
   contact:function(){return'rabin@ruhrbin.site\ncontact@ruhrbin.site\ngithub.com/RuHRabin\nx.com/RuHRabin'},
   warp:function(){state.warp=1;Sfx.whoosh();return'Engaging warp drive...'},
   clear:function(){log.textContent='';return null},
   sound:function(a){if(a==='on'||a==='off'){setSound(a==='on');return'Sound '+a}return'usage: sound on|off'},
   theme:function(a){if(a==='mac'||a==='linux'){skin(a);return'Switched to '+a}return'usage: theme mac|linux'}
  };
  C.skin=C.theme;C.music=function(a){if(a==='on'||a==='off'){window.dispatchEvent(new CustomEvent('music:set',{detail:{on:a==='on'}}));return'Music '+a+(a==='on'&&!Sfx.on?' (turn sound on first: sound on)':'')}return'usage: music on|off'};C.volume=function(a){var n=parseInt(a,10);if(isNaN(n)||n<0||n>100)return'usage: volume 0-100';window.dispatchEvent(new CustomEvent('music:set',{detail:{volume:n/100}}));return'Music volume '+n};C.reopen=function(){return reopenAll()+' window(s) reopened'};C.windows=function(){return listWindows()};
  function run(v){var p=v.trim().split(/\s+/),k=p[0].toLowerCase();if(!k)return;out('rabin@ruhrbin:~$ '+v,'c');hist.push(v);hi=hist.length;
    if(k==='sudo'){out('rabin is not in the sudoers file. This incident will be reported.','e');return}
    if(C[k]){var r=C[k](p[1]);if(r)out(r)}else out('command not found: '+k+'. Try help.','e')}
  $('#tf').addEventListener('submit',function(e){e.preventDefault();Sfx.enter();run(inp.value);inp.value=''});
  inp.addEventListener('keyup',function(e){Sfx.keyUp(e.key)});inp.addEventListener('keydown',function(e){Sfx.keyDown(e.key);
    if(e.key==='ArrowUp'&&hi>0){inp.value=hist[--hi];e.preventDefault()}else if(e.key==='ArrowDown'){inp.value=hist[++hi]||'';if(hi>hist.length)hi=hist.length;e.preventDefault()}});
  $$('.qs button').forEach(function(b){b.addEventListener('click',function(){run(b.textContent)})});
  $('#warp').addEventListener('click',function(){state.warp=1;Sfx.whoosh()});
  out('Type help to see commands. Click here to focus.');
})();

