(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const UI = {
  menu: document.getElementById('menu'), how: document.getElementById('how'), brief: document.getElementById('brief'), result: document.getElementById('result'),
  startBtn: document.getElementById('startBtn'), howBtn: document.getElementById('howBtn'), closeHow: document.getElementById('closeHow'), briefGo: document.getElementById('briefGo'),
  briefImg: document.getElementById('briefImg'), briefTitle: document.getElementById('briefTitle'), briefText: document.getElementById('briefText'),
  restartBtn: document.getElementById('restartBtn'), menuBtn: document.getElementById('menuBtn'), hud: document.getElementById('hud'), touch: document.getElementById('touch'),
  hpBar: document.getElementById('hpBar'), hpText: document.getElementById('hpText'), scoreText: document.getElementById('scoreText'), stageLabel: document.getElementById('stageLabel'), objective: document.getElementById('objective'), toast: document.getElementById('toast'),
  resultTitle: document.getElementById('resultTitle'), resultScore: document.getElementById('resultScore'), resultStats: document.getElementById('resultStats'), muteBtn: document.getElementById('muteBtn')
};

const DPR = () => Math.min(devicePixelRatio || 1, 2);
let W=1280,H=720, scale=1;
function resize(){
  const r=canvas.getBoundingClientRect(); const d=DPR();
  canvas.width=Math.floor(r.width*d); canvas.height=Math.floor(r.height*d);
  W=canvas.width; H=canvas.height; scale=H/720;
}
addEventListener('resize',resize,{passive:true}); resize();

const imgs={};
for (const [k,src] of Object.entries({hero:'assets/hero_close.webp',studio:'assets/studio.webp',hummer:'assets/hummer_ext.webp',inside:'assets/hummer_interior.webp',detail:'assets/hummer_detail.webp'})) { const im=new Image(); im.src=src; imgs[k]=im; }

const input={left:false,right:false,jump:false,fire:false,dash:false};
const one={jump:false,dash:false};
function setKey(code,on){
  if(['ArrowLeft','KeyA'].includes(code)) input.left=on;
  if(['ArrowRight','KeyD'].includes(code)) input.right=on;
  if(['Space','ArrowUp','KeyW'].includes(code)){input.jump=on;if(on)one.jump=true;}
  if(['KeyJ','KeyK','KeyF'].includes(code)) input.fire=on;
  if(['ShiftLeft','ShiftRight'].includes(code)){input.dash=on;if(on)one.dash=true;}
}
addEventListener('keydown',e=>{ if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault(); if(e.code==='KeyP') togglePause(); else setKey(e.code,true); });
addEventListener('keyup',e=>setKey(e.code,false));

document.querySelectorAll('#touch button').forEach(b=>{
  const k=b.dataset.key;
  const down=e=>{e.preventDefault();b.classList.add('on');input[k]=true;if(k==='jump')one.jump=true;if(k==='dash')one.dash=true;};
  const up=e=>{e.preventDefault();b.classList.remove('on');input[k]=false;};
  b.addEventListener('pointerdown',down); b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('pointerleave',up);
});

// ---------- AUDIO ----------
let ac=null, master=null, muted=false, bassTimer=null;
function audioInit(){
  if(ac) return; ac=new (window.AudioContext||window.webkitAudioContext)(); master=ac.createGain(); master.gain.value=.22; master.connect(ac.destination);
}
function tone(freq=220,dur=.08,type='square',vol=.08,slide=0){
  if(!ac||muted)return; const o=ac.createOscillator(),g=ac.createGain(); o.type=type;o.frequency.setValueAtTime(freq,ac.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),ac.currentTime+dur);g.gain.setValueAtTime(vol,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);o.connect(g);g.connect(master);o.start();o.stop(ac.currentTime+dur);
}
function noise(dur=.08,vol=.06){ if(!ac||muted)return; const n=ac.createBufferSource(),buf=ac.createBuffer(1,ac.sampleRate*dur,ac.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;n.buffer=buf;const g=ac.createGain();g.gain.setValueAtTime(vol,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);n.connect(g);g.connect(master);n.start(); }
function startBass(){stopBass(); if(!ac)return; let step=0; bassTimer=setInterval(()=>{ if(state.playing&&!state.paused){const seq=[55,55,73.4,49,55,82.4,73.4,49];tone(seq[step++%seq.length],.18,'sawtooth',.025,-8)}},240);}
function stopBass(){if(bassTimer){clearInterval(bassTimer);bassTimer=null}}
UI.muteBtn.onclick=()=>{muted=!muted;UI.muteBtn.textContent=muted?'×':'◉';};

// ---------- CORE ----------
const state={mode:'menu',playing:false,paused:false,stage:0,score:0,hp:100,start:0,kills:0,hits:0,shots:0,shards:0};
let world=null, last=performance.now(), shake=0, flash=0;

const R=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
function show(el){[UI.menu,UI.how,UI.brief,UI.result].forEach(x=>x.classList.remove('active')); if(el)el.classList.add('active');}
function toast(t){UI.toast.textContent=t;UI.toast.classList.add('show');setTimeout(()=>UI.toast.classList.remove('show'),950)}
function resetStats(){Object.assign(state,{score:0,hp:100,kills:0,hits:0,shots:0,shards:0,start:performance.now(),paused:false});}
function updateHud(){UI.hpBar.style.width=clamp(state.hp,0,100)+'%';UI.hpText.textContent=Math.max(0,Math.round(state.hp));UI.scoreText.textContent=String(Math.max(0,Math.floor(state.score))).padStart(6,'0');}
function damage(n){if(world?.player?.inv>0)return;state.hp-=n;shake=14;flash=.22;tone(80,.22,'sawtooth',.12,-30);if(world?.player)world.player.inv=.75;updateHud();if(state.hp<=0)endGame(false);}
function score(n){state.score+=n;updateHud();}

function showBrief(stage){
  state.stage=stage; state.mode='brief'; state.playing=false; UI.hud.classList.add('hidden');UI.touch.classList.add('hidden');
  const data=[
    {img:'assets/studio.webp',t:'THE SIGNAL BREACH',p:'استرجع 6 شظايا إشارة من الاستوديو، حيّد الدرونز، ثم افتح بوابة الخروج.'},
    {img:'assets/hummer_ext.webp',t:'HUMMER // HARD ESCAPE',p:'اخرج بالنواة عبر القطاع الصناعي. تفادى الحواجز، أسقط الطائرات المطاردة، وحافظ على الدرع.'},
    {img:'assets/hummer_interior.webp',t:'BLACK NODE',p:'وصلت إلى المصدر. كسّر الدروع الثلاثة ثم اضرب النواة قبل أن يكتمل الإغلاق.'}
  ][stage];
  UI.briefImg.src=data.img;UI.briefTitle.textContent=data.t;UI.briefText.textContent=data.p;show(UI.brief);
}
function startGame(){audioInit();if(ac.state==='suspended')ac.resume();resetStats();showBrief(0);startBass();}
function beginStage(){show(null);state.mode=['foot','drive','boss'][state.stage];state.playing=true;state.paused=false;UI.hud.classList.remove('hidden');UI.touch.classList.remove('hidden');initStage(state.mode);toast(['BREACH ACTIVE','ENGINE ONLINE','NODE EXPOSED'][state.stage]);}
function nextStage(){state.playing=false; if(state.stage<2){showBrief(state.stage+1)}else endGame(true);}
function togglePause(){if(!state.playing)return;state.paused=!state.paused;toast(state.paused?'PAUSED':'RESUME');}
function endGame(win){state.playing=false;state.mode='result';stopBass();UI.hud.classList.add('hidden');UI.touch.classList.add('hidden');show(UI.result);UI.resultTitle.textContent=win?'SIGNAL RESTORED':'MISSION FAILED';UI.resultScore.textContent=String(Math.floor(state.score)).padStart(6,'0');const secs=Math.max(1,Math.round((performance.now()-state.start)/1000));const acc=state.shots?Math.round(state.hits/state.shots*100):0;UI.resultStats.innerHTML=`<div><b>${state.kills}</b><small>TAKEDOWNS</small></div><div><b>${acc}%</b><small>ACCURACY</small></div><div><b>${secs}s</b><small>TIME</small></div>`;tone(win?180:60,.6,'sawtooth',.08,win?220:-20)}
function toMenu(){stopBass();state.playing=false;state.mode='menu';UI.hud.classList.add('hidden');UI.touch.classList.add('hidden');show(UI.menu)}

UI.startBtn.onclick=startGame; UI.restartBtn.onclick=startGame; UI.menuBtn.onclick=toMenu; UI.howBtn.onclick=()=>show(UI.how); UI.closeHow.onclick=()=>show(UI.menu); UI.briefGo.onclick=beginStage;

// ---------- WORLD ----------
function initStage(mode){
  state.hp=Math.min(100,Math.max(35,state.hp+18));updateHud();
  if(mode==='foot') initFoot(); if(mode==='drive') initDrive(); if(mode==='boss') initBoss();
}

function initFoot(){
  UI.stageLabel.textContent='STUDIO BREACH';UI.objective.textContent='SIGNAL 0/6';
  const base=720;
  world={t:0,scroll:0,length:4700,player:{x:170,y:base-166,w:40,h:82,vx:0,vy:0,on:false,face:1,inv:0,dash:0,fireCd:0},bullets:[],enemyBullets:[],particles:[],
    platforms:[{x:0,y:base-70,w:4700,h:70},{x:700,y:base-170,w:260,h:22},{x:1210,y:base-245,w:320,h:22},{x:1840,y:base-185,w:300,h:22},{x:2450,y:base-280,w:340,h:22},{x:3170,y:base-190,w:280,h:22},{x:3740,y:base-250,w:300,h:22}],
    shards:[540,910,1370,2070,2770,4010].map((x,i)=>({x,y:base-(i%2?220:125)-R(0,35),r:12,t:0,taken:false})),
    enemies:[820,1100,1580,2260,2640,3040,3480,3900,4310].map((x,i)=>({x,y:base-150-R(0,90),w:44,h:30,hp:i%3===0?3:2,t:R(0,4),fire:R(.3,1.7),dead:false})),gate:{x:4480,y:base-190,w:90,h:120,open:false}}
}
function initDrive(){
  UI.stageLabel.textContent='HUMMER ESCAPE';UI.objective.textContent='DISTANCE 0%';
  world={t:0,dist:0,target:5200,speed:330,roadY:520,player:{x:210,y:466,w:150,h:62,vy:0,inv:0,fireCd:0},bullets:[],enemyBullets:[],particles:[],obstacles:[],drones:[],spawn:0,droneSpawn:1.2}
}
function initBoss(){
  UI.stageLabel.textContent='BLACK NODE';UI.objective.textContent='SHIELD x3';
  world={t:0,player:{x:170,y:720-166,w:40,h:82,vx:0,vy:0,on:false,face:1,inv:0,dash:0,fireCd:0},bullets:[],enemyBullets:[],particles:[],platforms:[{x:0,y:650,w:1280,h:70},{x:210,y:500,w:240,h:18},{x:830,y:500,w:240,h:18}],boss:{x:970,y:245,w:150,h:230,hp:45,shield:3,phase:0,fire:1.2,beam:4,dead:false},orbs:[]}
}

function shootFromPlayer(p,drive=false){
  if(p.fireCd>0)return;p.fireCd=drive?.14:.19;state.shots++;tone(drive?170:240,.045,'square',.045,90);
  if(drive)world.bullets.push({x:p.x+p.w-6,y:p.y+19,w:18,h:5,vx:920,life:1.2});
  else world.bullets.push({x:p.x+(p.face>0?p.w:0),y:p.y+26,w:16,h:4,vx:760*p.face,life:1.3});
}
function particles(x,y,n=10){for(let i=0;i<n;i++)world.particles.push({x,y,vx:R(-180,180),vy:R(-220,80),life:R(.25,.7),s:R(2,6)})}
function updateParticles(dt){for(const p of world.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=360*dt;p.life-=dt}world.particles=world.particles.filter(p=>p.life>0)}

function updateFoot(dt,bossMode=false){
  const p=world.player;world.t+=dt;p.inv=Math.max(0,p.inv-dt);p.fireCd-=dt;p.dash=Math.max(0,p.dash-dt);
  const accel=p.on?2400:1350,max=330,fric=p.on?2200:800;
  if(input.left){p.vx=Math.max(-max,p.vx-accel*dt);p.face=-1}else if(input.right){p.vx=Math.min(max,p.vx+accel*dt);p.face=1}else{const s=Math.sign(p.vx);p.vx=Math.abs(p.vx)<=fric*dt?0:p.vx-s*fric*dt}
  if(one.jump&&p.on){p.vy=-635;p.on=false;tone(140,.07,'square',.05,50)} one.jump=false;
  if(one.dash&&p.dash<=0){p.vx=p.face*720;p.dash=.75;p.inv=.15;tone(90,.1,'sawtooth',.06,210)} one.dash=false;
  if(input.fire)shootFromPlayer(p,false);
  p.vy+=1750*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
  p.on=false;
  for(const q of world.platforms){
    if(p.x+p.w>q.x&&p.x<q.x+q.w){const prev=p.y-p.vy*dt; if(prev+p.h<=q.y+5&&p.y+p.h>=q.y&&p.vy>=0){p.y=q.y-p.h;p.vy=0;p.on=true}}
  }
  if(!bossMode){p.x=clamp(p.x,0,world.length-p.w); if(p.y>840)damage(25),Object.assign(p,{x:Math.max(40,p.x-180),y:350,vy:0});world.scroll=clamp(p.x-W/scale*.35,0,world.length-W/scale);
    for(const s of world.shards){s.t+=dt;if(!s.taken&&Math.hypot((p.x+p.w/2)-s.x,(p.y+p.h/2)-s.y)<45){s.taken=true;state.shards++;score(600);tone(420,.16,'sine',.07,350);particles(s.x,s.y,16);UI.objective.textContent=`SIGNAL ${state.shards}/6`;if(state.shards===6){world.gate.open=true;toast('EXIT GATE UNLOCKED')}}}
    for(const e of world.enemies){if(e.dead)continue;e.t+=dt;e.x+=Math.sin(e.t*1.7)*22*dt;e.fire-=dt;if(e.fire<0&&Math.abs(e.x-p.x)<660){e.fire=R(.9,1.7);world.enemyBullets.push({x:e.x,y:e.y+12,w:9,h:9,vx:(p.x>e.x?1:-1)*R(260,390),vy:R(-30,30),life:2.8});tone(105,.05,'square',.02)} if(hit(p,e))damage(12)}
    if(world.gate.open && p.x>world.gate.x-40){score(1800);nextStage();return}
  } else { p.x=clamp(p.x,0,1240); if(p.y>760){damage(20);p.x=120;p.y=320;p.vy=0} updateBossLogic(dt,p); }
  updateBullets(dt,bossMode); updateParticles(dt);
}

function updateBullets(dt,bossMode){
  for(const b of world.bullets){b.x+=b.vx*dt;b.life-=dt;
    if(bossMode){const z=world.boss;if(!z.dead&&hit(b,z)){b.life=0;state.hits++;if(z.shield>0){z.shield--;score(350);toast(`SHIELD BREAK ${3-z.shield}/3`);particles(b.x,b.y,18);tone(320,.18,'square',.07,-120);UI.objective.textContent=z.shield?`SHIELD x${z.shield}`:'CORE EXPOSED'}else{z.hp--;score(60);particles(b.x,b.y,3);if(z.hp<=0){z.dead=true;state.kills++;score(4200);particles(z.x+75,z.y+100,80);setTimeout(()=>nextStage(),900)}}}}
    else for(const e of world.enemies){if(!e.dead&&hit(b,e)){b.life=0;e.hp--;state.hits++;particles(b.x,b.y,5);if(e.hp<=0){e.dead=true;state.kills++;score(320);tone(70,.12,'square',.05,-25);particles(e.x,e.y,14)}break}}
  }
  for(const b of world.enemyBullets){b.x+=b.vx*dt;b.y+=(b.vy||0)*dt;b.life-=dt;if(hit(world.player,b)){b.life=0;damage(8)}}
  world.bullets=world.bullets.filter(b=>b.life>0);world.enemyBullets=world.enemyBullets.filter(b=>b.life>0);
}
function updateBossLogic(dt,p){
  const z=world.boss;if(z.dead)return;z.phase+=dt;z.y=235+Math.sin(z.phase*1.2)*45;z.fire-=dt;z.beam-=dt;
  if(z.fire<0){z.fire=z.shield?1.2:.65;for(let a=-.5;a<=.5;a+=.25){const sp=330,dx=(p.x-z.x),dy=(p.y-z.y),len=Math.hypot(dx,dy)||1;let vx=dx/len*sp,vy=dy/len*sp;const ca=Math.cos(a),sa=Math.sin(a);world.enemyBullets.push({x:z.x+20,y:z.y+110,w:10,h:10,vx:vx*ca-vy*sa,vy:vx*sa+vy*ca,life:4})}tone(65,.14,'sawtooth',.04,20)}
  if(z.beam<0){z.beam=4.2;toast('NODE BEAM — MOVE');for(let i=0;i<6;i++)setTimeout(()=>{if(state.mode==='boss'&&state.playing){world.enemyBullets.push({x:0,y:610-i*15,w:1280,h:8,vx:0,vy:0,life:.12,beam:true})}},i*90)}
  if(hit(p,z))damage(18);
}

function updateDrive(dt){
  const w=world,p=w.player;w.t+=dt;p.inv=Math.max(0,p.inv-dt);p.fireCd-=dt;w.dist+=w.speed*dt;w.speed=Math.min(520,w.speed+8*dt);
  const top=260,bottom=540; if(input.left)p.y-=330*dt;if(input.right)p.y+=330*dt;p.y=clamp(p.y,top,bottom-p.h); if(one.dash){w.speed=Math.min(650,w.speed+80);tone(55,.15,'sawtooth',.07,80)}one.dash=false;if(input.fire)shootFromPlayer(p,true);
  w.spawn-=dt;if(w.spawn<0){w.spawn=R(.58,1.05);const h=R(36,76);w.obstacles.push({x:W/scale+80,y:R(top+20,bottom-h),w:R(28,52),h,vx:-w.speed*R(.9,1.1),dead:false})}
  w.droneSpawn-=dt;if(w.droneSpawn<0){w.droneSpawn=R(1.05,1.8);w.drones.push({x:W/scale+80,y:R(245,460),w:52,h:32,hp:2,vx:-w.speed*.56,fire:R(.5,1.4),dead:false})}
  for(const o of w.obstacles){o.x+=o.vx*dt;if(!o.dead&&hit(p,o)){o.dead=true;damage(15);particles(o.x,o.y,18)}}
  for(const d of w.drones){d.x+=d.vx*dt;d.fire-=dt;if(!d.dead&&d.fire<0&&d.x<W/scale*.9){d.fire=R(1,1.8);w.enemyBullets.push({x:d.x,y:d.y+15,w:10,h:10,vx:-380,vy:R(-40,40),life:3})}if(!d.dead&&hit(p,d)){d.dead=true;damage(12)}}
  for(const b of w.bullets){b.x+=b.vx*dt;b.life-=dt;for(const d of w.drones){if(!d.dead&&hit(b,d)){b.life=0;d.hp--;state.hits++;if(d.hp<=0){d.dead=true;state.kills++;score(420);particles(d.x,d.y,15)}break}}}
  for(const b of w.enemyBullets){b.x+=b.vx*dt;b.y+=(b.vy||0)*dt;b.life-=dt;if(hit(p,b)){b.life=0;damage(7)}}
  w.bullets=w.bullets.filter(b=>b.life>0);w.enemyBullets=w.enemyBullets.filter(b=>b.life>0);w.obstacles=w.obstacles.filter(o=>o.x>-120&&!o.dead);w.drones=w.drones.filter(d=>d.x>-120&&!d.dead);updateParticles(dt);
  const pc=clamp(w.dist/w.target,0,1);UI.objective.textContent=`DISTANCE ${Math.floor(pc*100)}%`;score(dt*25);if(w.dist>=w.target){score(2200);nextStage()}
}

function update(dt){if(!state.playing||state.paused)return;dt=Math.min(.034,dt); if(state.mode==='foot')updateFoot(dt,false); else if(state.mode==='drive')updateDrive(dt); else if(state.mode==='boss')updateFoot(dt,true); updateHud();}

// ---------- DRAW ----------
function clear(){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#070909';ctx.fillRect(0,0,W,H);const sx=shake?R(-shake,shake):0,sy=shake?R(-shake*.6,shake*.6):0;ctx.setTransform(scale,0,0,scale,sx,sy);shake*=.84;if(shake<.2)shake=0;}
function coverImage(im,alpha=.18){if(!im.complete)return;const vw=W/scale,vh=H/scale,ir=im.width/im.height,vr=vw/vh;let sw,sh,sx,sy;if(ir>vr){sh=im.height;sw=sh*vr;sx=(im.width-sw)/2;sy=0}else{sw=im.width;sh=sw/vr;sx=0;sy=(im.height-sh)/2}ctx.save();ctx.globalAlpha=alpha;ctx.filter='saturate(.55) contrast(1.15) brightness(.55)';ctx.drawImage(im,sx,sy,sw,sh,0,0,vw,vh);ctx.restore()}
function gridFloor(y){ctx.save();ctx.strokeStyle='rgba(116,244,203,.08)';ctx.lineWidth=1;for(let x=-200;x<1600;x+=64){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo((x-640)*1.8,720);ctx.stroke()}for(let yy=y;yy<720;yy+=34){ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(1400,yy);ctx.stroke()}ctx.restore()}
function drawHero(p){
  ctx.save(); if(p.inv>0&&Math.floor(p.inv*18)%2===0)ctx.globalAlpha=.35;
  // body: bone vest + cream pants, face portrait clipped into stylized helmet-frame
  ctx.translate(p.x,p.y); if(p.face<0){ctx.translate(p.w,0);ctx.scale(-1,1)}
  ctx.fillStyle='#e9e0cf';ctx.fillRect(5,34,30,33);ctx.fillStyle='#f5f0e6';ctx.fillRect(9,28,22,40);ctx.fillStyle='#d9d0be';ctx.fillRect(7,66,12,16);ctx.fillRect(22,66,12,16);
  ctx.fillStyle='#956349';ctx.fillRect(0,36,8,29);ctx.fillRect(34,36,8,29);
  ctx.save();ctx.beginPath();ctx.roundRect(6,0,31,31,8);ctx.clip();if(imgs.hero.complete)ctx.drawImage(imgs.hero,265,160,330,330,2,-3,39,39);else{ctx.fillStyle='#8b5a43';ctx.fillRect(5,0,32,32)}ctx.restore();
  ctx.strokeStyle='rgba(116,244,203,.8)';ctx.strokeRect(5,-1,33,33);ctx.fillStyle='#111';ctx.fillRect(13,12,22,6);
  ctx.restore();
}
function drawBullet(b,friendly=true){ctx.fillStyle=friendly?'#74f4cb':'#ff655e';if(b.beam){ctx.globalAlpha=.5;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.globalAlpha=1}else ctx.fillRect(b.x,b.y,b.w,b.h)}
function drawParticles(){for(const p of world.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle='#74f4cb';ctx.fillRect(p.x,p.y,p.s,p.s)}ctx.globalAlpha=1}
function drawFoot(bossMode=false){
  clear();coverImage(bossMode?imgs.inside:imgs.studio,bossMode?.13:.10);ctx.fillStyle='rgba(5,10,9,.72)';ctx.fillRect(0,0,W/scale,H/scale);gridFloor(470);
  const cam=bossMode?0:world.scroll;ctx.save();ctx.translate(-cam,0);
  // synth architecture
  ctx.fillStyle='#0d1312';for(let x=120;x<(bossMode?1280:4700);x+=420){ctx.fillRect(x,290,250,250);ctx.strokeStyle='rgba(255,255,255,.09)';ctx.strokeRect(x,290,250,250);for(let r=0;r<6;r++){ctx.fillStyle=r%2?'#17201e':'#111817';ctx.fillRect(x+18,315+r*34,214,22);for(let q=0;q<8;q++){ctx.fillStyle=q%3===0?'#25d89d':'#56605c';ctx.fillRect(x+28+q*24,321+r*34,4,4)}}}
  for(const q of world.platforms){ctx.fillStyle='#1a211f';ctx.fillRect(q.x,q.y,q.w,q.h);ctx.fillStyle='rgba(116,244,203,.15)';ctx.fillRect(q.x,q.y,q.w,2)}
  if(!bossMode){for(const s of world.shards){if(s.taken)continue;const rr=s.r+Math.sin(s.t*5)*3;ctx.strokeStyle='#74f4cb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,rr,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(37,216,157,.22)';ctx.fillRect(s.x-4,s.y-16,8,32)}for(const e of world.enemies){if(e.dead)continue;ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle='#161d1b';ctx.fillRect(0,5,e.w,e.h-5);ctx.fillStyle='#ff5f56';ctx.fillRect(8,0,8,6);ctx.fillRect(28,0,8,6);ctx.strokeStyle='rgba(255,255,255,.18)';ctx.strokeRect(0,5,e.w,e.h-5);ctx.restore()}const g=world.gate;ctx.fillStyle=g.open?'rgba(37,216,157,.22)':'rgba(255,95,86,.12)';ctx.fillRect(g.x,g.y,g.w,g.h);ctx.strokeStyle=g.open?'#25d89d':'#6e2f2f';ctx.lineWidth=3;ctx.strokeRect(g.x,g.y,g.w,g.h)}
  else drawBoss();
  for(const b of world.bullets)drawBullet(b,true);for(const b of world.enemyBullets)drawBullet(b,false);drawParticles();drawHero(world.player);ctx.restore();
  if(!bossMode){const p=clamp(world.player.x/world.length,0,1);ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(120,684,1040,3);ctx.fillStyle='#25d89d';ctx.fillRect(120,684,1040*p,3)}
}
function drawBoss(){const z=world.boss;if(z.dead)return;ctx.save();ctx.translate(z.x,z.y);ctx.fillStyle='#111716';ctx.fillRect(0,0,z.w,z.h);ctx.strokeStyle=z.shield?'#74f4cb':'#ff655e';ctx.lineWidth=3;ctx.strokeRect(0,0,z.w,z.h);for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#202826':'#0a0e0d';ctx.fillRect(18,18+i*25,114,15)}ctx.fillStyle=z.shield?'#74f4cb':'#ff5f56';ctx.beginPath();ctx.arc(75,112,38,0,Math.PI*2);ctx.fill();ctx.fillStyle='#070909';ctx.beginPath();ctx.arc(75,112,20,0,Math.PI*2);ctx.fill();if(z.shield){ctx.strokeStyle='rgba(116,244,203,.22)';ctx.beginPath();ctx.arc(75,112,86+Math.sin(world.t*5)*8,0,Math.PI*2);ctx.stroke()}ctx.restore();if(!z.shield){ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(440,675,400,5);ctx.fillStyle='#ff5f56';ctx.fillRect(440,675,400*(z.hp/45),5)}}
function drawDrive(){
  clear();coverImage(imgs.hummer,.13);const vw=W/scale;ctx.fillStyle='rgba(7,10,9,.76)';ctx.fillRect(0,0,vw,720);
  // moving industrial horizon
  const t=world.t*world.speed*.18;ctx.fillStyle='#111716';for(let i=-1;i<9;i++){const x=((i*260-t)%(260*9)+260*9)%(260*9)-200;ctx.fillRect(x,120,180,230);ctx.fillStyle='#171d1b';ctx.fillRect(x+20,165,140,110);ctx.fillStyle='#111716'}
  ctx.fillStyle='#171918';ctx.fillRect(0,230,vw,340);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;for(let y=300;y<560;y+=86){ctx.setLineDash([44,38]);ctx.beginPath();ctx.moveTo(-((t*2)%82),y);ctx.lineTo(vw,y);ctx.stroke()}ctx.setLineDash([]);
  // hummer stylized
  const p=world.player;ctx.save();ctx.translate(p.x,p.y);if(p.inv>0&&Math.floor(p.inv*18)%2===0)ctx.globalAlpha=.35;ctx.fillStyle='#111a17';ctx.fillRect(24,10,105,38);ctx.fillRect(0,28,145,26);ctx.fillStyle='#22302b';ctx.fillRect(40,14,38,20);ctx.fillRect(82,14,35,20);ctx.fillStyle='#050706';ctx.beginPath();ctx.arc(32,58,18,0,Math.PI*2);ctx.arc(118,58,18,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#74f4cb';ctx.strokeRect(24,10,105,38);ctx.fillStyle='#e9e0cf';ctx.fillRect(105,14,15,11);ctx.restore();
  for(const o of world.obstacles){ctx.fillStyle='#6b5547';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillStyle='#c7aa72';for(let y=o.y+8;y<o.y+o.h;y+=16)ctx.fillRect(o.x,y,o.w,3)}
  for(const d of world.drones){ctx.fillStyle='#101615';ctx.fillRect(d.x,d.y,d.w,d.h);ctx.fillStyle='#ff5f56';ctx.fillRect(d.x+7,d.y+11,7,7);ctx.fillRect(d.x+38,d.y+11,7,7)}
  for(const b of world.bullets)drawBullet(b,true);for(const b of world.enemyBullets)drawBullet(b,false);drawParticles();
  const pc=clamp(world.dist/world.target,0,1);ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(120,684,1040,3);ctx.fillStyle='#25d89d';ctx.fillRect(120,684,1040*pc,3);
}
function draw(){if(!state.playing)return;if(state.mode==='foot')drawFoot(false);else if(state.mode==='drive')drawDrive();else if(state.mode==='boss')drawFoot(true);if(state.paused){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.font=`900 ${46*DPR()}px ui-monospace`;ctx.textAlign='center';ctx.fillText('PAUSED',W/2,H/2)}if(flash>0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=`rgba(255,255,255,${flash})`;ctx.fillRect(0,0,W,H);flash*=.78}}

function loop(now){const dt=(now-last)/1000;last=now;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
})();
