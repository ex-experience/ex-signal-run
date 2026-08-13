(() => {
'use strict';

const $ = s => document.querySelector(s);
const canvas = $("#game");
const ctx = canvas.getContext("2d",{alpha:false,desynchronized:true});

const UI = {
  menu:$("#menu"),how:$("#how"),brief:$("#brief"),result:$("#result"),
  startBtn:$("#startBtn"),dailyBtn:$("#dailyBtn"),howBtn:$("#howBtn"),closeHow:$("#closeHow"),briefGo:$("#briefGo"),
  restartBtn:$("#restartBtn"),menuBtn:$("#menuBtn"),rewardBtn:$("#rewardBtn"),
  hud:$("#hud"),touch:$("#touch"),pauseBtn:$("#pauseBtn"),muteBtn:$("#muteBtn"),boostHud:$("#boostHud"),
  hpBar:$("#hpBar"),hpText:$("#hpText"),heatBar:$("#heatBar"),boostBar:$("#boostBar"),
  scoreText:$("#scoreText"),stageLabel:$("#stageLabel"),objective:$("#objective"),comboText:$("#comboText"),
  resultTitle:$("#resultTitle"),resultScore:$("#resultScore"),resultStats:$("#resultStats"),toast:$("#toast"),
  menuLevel:$("#menuLevel"),menuBest:$("#menuBest"),menuCredits:$("#menuCredits"),
  menuSponsor:$("#menuSponsor"),briefSponsor:$("#briefSponsor"),resultSponsor:$("#resultSponsor"),worldAd:$("#worldAd"),
  briefTitle:$("#briefTitle"),briefText:$("#briefText"),briefImg:$("#briefImg")
};

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
let W=1280,H=720,S=1;
function resize(){
  const r=canvas.getBoundingClientRect(), d=DPR();
  canvas.width=Math.max(1,Math.floor(r.width*d));
  canvas.height=Math.max(1,Math.floor(r.height*d));
  W=canvas.width;H=canvas.height;S=H/720;
}
addEventListener("resize",resize,{passive:true});resize();

const store = {
  get(){
    try{
      return {...{best:0,credits:0,xp:0,level:1,runs:0}, ...JSON.parse(localStorage.getItem("ex_signal_profile")||"{}")};
    }catch{return {best:0,credits:0,xp:0,level:1,runs:0}}
  },
  set(v){try{localStorage.setItem("ex_signal_profile",JSON.stringify(v))}catch{}}
};
let profile=store.get();

function refreshMenu(){
  profile.level=Math.max(1,Math.floor(profile.xp/1200)+1);
  UI.menuLevel.textContent=String(profile.level).padStart(2,"0");
  UI.menuBest.textContent=String(Math.floor(profile.best)).padStart(6,"0");
  UI.menuCredits.textContent=String(Math.floor(profile.credits));
  window.EXAds?.renderCard(UI.menuSponsor,"menu_partner");
}
refreshMenu();

const input={left:false,right:false,jump:false,fire:false,boost:false};
const pulse={left:false,right:false,jump:false,boost:false};
function press(k,on){
  input[k]=on;
  if(on && ["left","right","jump","boost"].includes(k)) pulse[k]=true;
}
function key(code,on){
  if(["ArrowLeft","KeyA"].includes(code)) press("left",on);
  if(["ArrowRight","KeyD"].includes(code)) press("right",on);
  if(["Space","ArrowUp","KeyW"].includes(code)) press("jump",on);
  if(["ShiftLeft","ShiftRight"].includes(code)) press("boost",on);
  if(["KeyJ","KeyF","KeyK"].includes(code)) press("fire",on);
}
addEventListener("keydown",e=>{
  if(["ArrowLeft","ArrowRight","ArrowUp","Space"].includes(e.code))e.preventDefault();
  if(e.code==="KeyP"){togglePause();return}
  key(e.code,true);
});
addEventListener("keyup",e=>key(e.code,false));
document.querySelectorAll("#touch button").forEach(b=>{
  const k=b.dataset.key;
  const down=e=>{e.preventDefault();b.classList.add("on");press(k,true)};
  const up=e=>{e.preventDefault();b.classList.remove("on");press(k,false)};
  b.addEventListener("pointerdown",down);
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>b.addEventListener(ev,up));
});

let ac=null, master=null, muted=false, beatTimer=null;
function audioInit(){
  if(ac)return;
  ac=new (window.AudioContext||window.webkitAudioContext)();
  master=ac.createGain();master.gain.value=.18;master.connect(ac.destination);
}
function tone(f=220,d=.07,type="square",v=.04,slide=0){
  if(!ac||muted)return;
  const o=ac.createOscillator(),g=ac.createGain();
  o.type=type;o.frequency.setValueAtTime(f,ac.currentTime);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),ac.currentTime+d);
  g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);
  o.connect(g);g.connect(master);o.start();o.stop(ac.currentTime+d);
}
function noise(d=.08,v=.035){
  if(!ac||muted)return;
  const b=ac.createBuffer(1,ac.sampleRate*d,ac.sampleRate),data=b.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const n=ac.createBufferSource(),g=ac.createGain();n.buffer=b;g.gain.setValueAtTime(v,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);n.connect(g);g.connect(master);n.start();
}
function startBeat(){
  stopBeat();let i=0;
  beatTimer=setInterval(()=>{if(state.playing&&!state.paused)tone([55,55,73,49,82,55,73,49][i++%8],.13,"sawtooth",.018,-8)},210);
}
function stopBeat(){if(beatTimer){clearInterval(beatTimer);beatTimer=null}}
UI.muteBtn.onclick=()=>{muted=!muted;UI.muteBtn.textContent=muted?"×":"◉"};
UI.pauseBtn.onclick=()=>togglePause();

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const R=(a,b)=>a+Math.random()*(b-a);
const ease=(a,b,t)=>a+(b-a)*t;
const pad=n=>String(Math.max(0,Math.floor(n))).padStart(6,"0");

const state={
  mode:"menu",playing:false,paused:false,daily:false,
  t:0,score:0,dist:0,target:5000,hp:100,heat:8,boost:100,
  combo:1,comboTime:0,shards:0,kills:0,near:0,checkpoints:0,
  speed:360,maxSpeed:760,startAt:0,lastAdAt:0,bosses:0
};
let world=null,last=performance.now(),shake=0,flash=0;

function show(el){
  [UI.menu,UI.how,UI.brief,UI.result].forEach(x=>x.classList.remove("active"));
  if(el)el.classList.add("active");
}
function toast(t){
  UI.toast.textContent=t;UI.toast.classList.add("show");
  clearTimeout(toast._t);toast._t=setTimeout(()=>UI.toast.classList.remove("show"),850);
}
function uiPlay(on){
  UI.hud.classList.toggle("hidden",!on);
  UI.touch.classList.toggle("hidden",!on);
  UI.pauseBtn.classList.toggle("hidden",!on);
  UI.boostHud.classList.toggle("hidden",!on);
}
function updateHud(){
  UI.hpBar.style.width=clamp(state.hp,0,100)+"%";
  UI.hpText.textContent=Math.max(0,Math.round(state.hp));
  UI.heatBar.style.width=clamp(state.heat,0,100)+"%";
  UI.boostBar.style.width=clamp(state.boost,0,100)+"%";
  UI.scoreText.textContent=pad(state.score);
  UI.objective.textContent=`DISTANCE ${Math.floor(state.dist)} M / ${state.target} M`;
  UI.comboText.textContent=`COMBO x${state.combo.toFixed(1)}`;
}
function resetRun(daily=false){
  Object.assign(state,{mode:"brief",playing:false,paused:false,daily,t:0,score:0,dist:0,target:daily?6200:5000,hp:100,heat:8,boost:100,combo:1,comboTime:0,shards:0,kills:0,near:0,checkpoints:0,speed:360,maxSpeed:daily?820:760,startAt:performance.now(),lastAdAt:-999,bosses:0});
  updateHud();
}
function startRun(daily=false){
  audioInit(); if(ac?.state==="suspended")ac.resume();
  resetRun(daily);
  UI.briefTitle.textContent=daily?"DAILY BLACKOUT":"CITY BREACH";
  UI.briefText.textContent=daily?"عقد يومي أسرع وأقسى: اقطع 6.2 KM مع حرارة أعلى ومكافأة مضاعفة.":"اقطع 5 KM، حافظ على الإشارة، وارفع الـCOMBO قبل وصول BLACK NODE.";
  UI.briefImg.src="assets/hummer_ext.webp";
  if(window.EXAds){
    const c=window.EXAds.pick("brief_partner");
    if(c){UI.briefSponsor.hidden=false;UI.briefSponsor.querySelector("b").textContent=c.brand;window.EXAds.mark("brief_partner",c);window.EXAds.track("sponsor_exposure",{campaignId:c.id,placement:"brief_partner"})}
    else UI.briefSponsor.hidden=true;
  }
  show(UI.brief);uiPlay(false);
}
function begin(){
  initWorld();show(null);uiPlay(true);state.mode="drive";state.playing=true;state.paused=false;startBeat();toast("SIGNAL LOCKED");
  window.EXAds?.track("run_start",{daily:state.daily});
}
function togglePause(){
  if(!state.playing)return;
  state.paused=!state.paused;
  toast(state.paused?"PAUSED":"RESUME");
}
function end(win){
  if(!state.playing)return;
  state.playing=false;state.mode="result";stopBeat();uiPlay(false);
  const secs=Math.max(1,Math.round((performance.now()-state.startAt)/1000));
  const gained=Math.max(40,Math.floor(state.score/260)+(state.daily?120:0));
  profile.runs++;profile.xp+=Math.floor(state.score/8);profile.credits+=gained;
  if(state.score>profile.best)profile.best=state.score;
  store.set(profile);
  UI.resultTitle.textContent=win?"SIGNAL ESCAPED":"RUN TERMINATED";
  UI.resultScore.textContent=pad(state.score);
  UI.resultStats.innerHTML=`<div><b>${Math.floor(state.dist)}m</b><small>DISTANCE</small></div>
    <div><b>${state.kills}</b><small>DRONES</small></div>
    <div><b>${state.near}</b><small>NEAR MISS</small></div>
    <div><b>+${gained}</b><small>CREDITS</small></div>`;
  window.EXAds?.renderCard(UI.resultSponsor,"result_partner");
  window.EXAds?.track("run_end",{win,score:Math.floor(state.score),distance:Math.floor(state.dist),seconds:secs});
  show(UI.result);refreshMenu();
}
function toMenu(){state.playing=false;state.mode="menu";stopBeat();uiPlay(false);show(UI.menu);refreshMenu()}

UI.startBtn.onclick=()=>startRun(false);
UI.dailyBtn.onclick=()=>startRun(true);
UI.howBtn.onclick=()=>show(UI.how);
UI.closeHow.onclick=()=>show(UI.menu);
UI.briefGo.onclick=begin;
UI.restartBtn.onclick=()=>startRun(state.daily);
UI.menuBtn.onclick=toMenu;
UI.rewardBtn.onclick=async()=>{
  UI.rewardBtn.disabled=true;
  const res=await window.EXAds?.showRewarded?.();
  if(res?.granted){
    profile=store.get();profile.credits+=Number(res.credits||250);store.set(profile);refreshMenu();
    UI.rewardBtn.textContent=`تمت الإضافة +${res.credits||250}`;
    toast("REWARD GRANTED");
  }else UI.rewardBtn.textContent="لم تكتمل المشاهدة";
  setTimeout(()=>{UI.rewardBtn.disabled=false;UI.rewardBtn.textContent="شاهد واحصل على المكافأة"},1800);
};

function initWorld(){
  world={
    lane:1,targetLane:1,jump:0,jumpV:0,roll:0,
    roadPhase:0,objects:[],bullets:[],particles:[],
    spawn:0.4,droneSpawn:1.2,checkpointAt:700,bossAt:1500,
    skyline:Array.from({length:22},(_,i)=>({x:i/22,w:R(.02,.07),h:R(.08,.30),glow:Math.random()}))
  };
  seedStarter();
}
function seedStarter(){
  for(let i=0;i<5;i++) spawnObject(500+i*280);
}
function laneX(lane,z=1){
  const center=640;
  const spread=220*(.48+.52*z);
  return center+(lane-1)*spread;
}
function spawnObject(ahead=R(650,1100)){
  const types=["barrier","shard","barrier","shard","boost","barrier"];
  const type=types[Math.floor(Math.random()*types.length)];
  const lane=Math.floor(R(0,3));
  world.objects.push({type,lane,z:ahead,x:0,hit:false,passed:false,w:type==="barrier"?68:34});
}
function spawnDrone(){
  world.objects.push({type:"drone",lane:Math.floor(R(0,3)),z:R(900,1300),x:0,hp:2,phase:R(0,6),passed:false});
}
function spawnCheckpoint(){
  world.objects.push({type:"checkpoint",lane:1,z:1100,x:0,passed:false});
}
function spawnBoss(){
  world.objects.push({type:"boss",lane:1,z:1500,x:0,hp:14+state.bosses*4,phase:0,passed:false});
  state.bosses++;toast("BLACK NODE INBOUND");state.heat=Math.min(100,state.heat+22);
}
function burst(x,y,n=12,c="#3cffd8"){
  for(let i=0;i<n;i++)world.particles.push({x,y,vx:R(-180,180),vy:R(-220,120),life:R(.25,.65),s:R(2,6),c});
}
function addScore(n){
  state.score+=n*state.combo;
  state.comboTime=2.3;
  updateHud();
}
function bumpCombo(n=.2){
  state.combo=clamp(state.combo+n,1,8);state.comboTime=2.5;
}
function damage(n){
  state.hp-=n;state.combo=1;state.comboTime=0;shake=15;flash=.28;noise(.14,.06);tone(70,.18,"sawtooth",.09,-30);
  state.heat=Math.min(100,state.heat+6);updateHud();
  if(state.hp<=0)end(false);
}
function fire(){
  if(world.fireCd>0)return;
  world.fireCd=.18;
  world.bullets.push({lane:world.lane,z:130,life:1.1});
  tone(230,.04,"square",.04,120);
}
function update(dt){
  if(!state.playing||state.paused)return;
  state.t+=dt;
  if(!world.fireCd)world.fireCd=0;world.fireCd=Math.max(0,world.fireCd-dt);

  if(pulse.left){world.targetLane=Math.max(0,world.targetLane-1);pulse.left=false;tone(130,.03,"square",.02,20)}
  if(pulse.right){world.targetLane=Math.min(2,world.targetLane+1);pulse.right=false;tone(130,.03,"square",.02,20)}
  world.lane=ease(world.lane,world.targetLane,clamp(dt*8,0,1));

  if(pulse.jump && world.jump<=.01){world.jumpV=1.55;tone(150,.05,"square",.04,90)}pulse.jump=false;
  if(world.jumpV!==0 || world.jump>0){
    world.jump+=world.jumpV*dt;world.jumpV-=3.2*dt;
    if(world.jump<=0){world.jump=0;world.jumpV=0}
  }

  if(input.fire)fire();
  const boosting=input.boost && state.boost>0;
  if(boosting){
    state.boost=Math.max(0,state.boost-28*dt);
    state.speed=Math.min(state.maxSpeed+150,state.speed+340*dt);
    state.heat=Math.min(100,state.heat+3.5*dt);
    if(Math.random()<.22)burst(640,610,1,"#ff9d2f");
  }else{
    state.boost=Math.min(100,state.boost+8*dt);
    state.speed=ease(state.speed,Math.min(state.maxSpeed,360+state.dist*.035),dt*1.3);
  }

  const dz=state.speed*dt;
  state.dist+=dz/10;
  state.score+=dz*.13*state.combo;
  state.heat=clamp(state.heat+dt*(.7+state.speed/1100),0,100);

  state.comboTime-=dt;
  if(state.comboTime<=0)state.combo=ease(state.combo,1,dt*2);

  world.spawn-=dt;
  if(world.spawn<=0){spawnObject();world.spawn=R(.42,.78)*(540/state.speed)}
  world.droneSpawn-=dt;
  if(world.droneSpawn<=0){spawnDrone();world.droneSpawn=R(1.1,1.8)*(520/state.speed)}

  if(state.dist>=world.checkpointAt){spawnCheckpoint();world.checkpointAt+=R(680,920)}
  if(state.dist>=world.bossAt){spawnBoss();world.bossAt+=R(1700,2200)}

  for(const b of world.bullets){b.z+=980*dt;b.life-=dt}
  world.bullets=world.bullets.filter(b=>b.life>0 && b.z<1650);

  for(const o of world.objects){
    o.z-=dz;
    if(o.type==="drone"||o.type==="boss")o.phase=(o.phase||0)+dt;
    const rel=o.z;
    const scale=clamp(1-rel/1500,.04,1.25);
    o.x=laneX(o.lane,scale);

    if((o.type==="drone"||o.type==="boss") && !o.hit){
      for(const b of world.bullets){
        if(Math.abs(b.z-o.z)<70 && Math.abs(b.lane-o.lane)<.58 && b.life>0){
          b.life=0;o.hp--;burst(o.x,250+320*scale,8,"#ff9d2f");addScore(o.type==="boss"?250:90);
          if(o.hp<=0){o.hit=true;state.kills++;bumpCombo(o.type==="boss"?.7:.25);tone(o.type==="boss"?90:180,.16,"sawtooth",.06,180)}
          break;
        }
      }
    }

    if(!o.passed && o.z<110){
      o.passed=true;
      const same=Math.abs(world.lane-o.lane)<.52;
      if(o.type==="barrier" && same){
        if(world.jump>.28){state.near++;addScore(180);bumpCombo(.18);toast("CLEAN JUMP")}
        else damage(22);
      }else if(o.type==="barrier" && Math.abs(world.lane-o.lane)<.9){
        state.near++;addScore(120);bumpCombo(.14);toast("NEAR MISS");
      }else if(o.type==="shard" && same){
        state.shards++;state.boost=Math.min(100,state.boost+18);addScore(130);bumpCombo(.1);tone(420,.09,"sine",.04,260);burst(o.x,470,12);
      }else if(o.type==="boost" && same){
        state.boost=Math.min(100,state.boost+42);addScore(90);toast("BOOST CELL");
      }else if(o.type==="drone" && !o.hit && same){
        damage(12);
      }else if(o.type==="checkpoint"){
        state.checkpoints++;addScore(500);bumpCombo(.25);state.hp=Math.min(100,state.hp+6);toast("CHECKPOINT");
        if(state.t-state.lastAdAt>18){window.EXAds?.showWorldBillboard(UI.worldAd,4300);state.lastAdAt=state.t}
      }else if(o.type==="boss" && !o.hit){
        damage(35);
      }
    }
  }
  world.objects=world.objects.filter(o=>o.z>-180 && !(o.hit && o.z<260));

  for(const p of world.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=420*dt;p.life-=dt}
  world.particles=world.particles.filter(p=>p.life>0);

  world.roadPhase=(world.roadPhase+dz*.0028)%1;
  shake=Math.max(0,shake-35*dt);flash=Math.max(0,flash-dt);

  if(state.dist>=state.target)end(true);
  updateHud();
}

function draw(){
  const d=DPR();ctx.setTransform(d,0,0,d,0,0);
  const cw=W/d,ch=H/d;const sx=cw/1280,sy=ch/720;
  ctx.save();ctx.scale(sx,sy);
  if(state.mode==="drive" && world)drawGame();
  else drawBackdrop();
  ctx.restore();
}
function drawBackdrop(){
  const g=ctx.createLinearGradient(0,0,0,720);g.addColorStop(0,"#051c1a");g.addColorStop(.6,"#06100f");g.addColorStop(1,"#020404");ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
  for(let i=0;i<50;i++){ctx.fillStyle=`rgba(60,255,216,${.02+(i%5)*.008})`;ctx.fillRect((i*149)%1280,(i*83)%560,1,1)}
}
function drawGame(){
  ctx.save();
  if(shake){ctx.translate(R(-shake,shake),R(-shake*.5,shake*.5))}
  const sky=ctx.createLinearGradient(0,0,0,510);sky.addColorStop(0,"#071d24");sky.addColorStop(.48,"#0a3b38");sky.addColorStop(1,"#f08b42");ctx.fillStyle=sky;ctx.fillRect(0,0,1280,720);
  ctx.fillStyle="rgba(255,189,107,.12)";ctx.beginPath();ctx.arc(980,165,88,0,Math.PI*2);ctx.fill();

  for(let i=0;i<22;i++){
    const x=i*63-10,h=100+((i*53)%190);
    ctx.fillStyle=i%4===0?"#0a2425":"#081a1d";ctx.fillRect(x,360-h,58,h);
    for(let y=378-h;y<348;y+=24){ctx.fillStyle=(i+y)%3===0?"rgba(60,255,216,.34)":"rgba(255,173,77,.13)";ctx.fillRect(x+10,y,5,8);ctx.fillRect(x+30,y,5,8)}
  }

  const topY=315,bottomY=720;
  ctx.fillStyle="#111919";ctx.beginPath();ctx.moveTo(515,topY);ctx.lineTo(765,topY);ctx.lineTo(1120,bottomY);ctx.lineTo(160,bottomY);ctx.closePath();ctx.fill();
  ctx.strokeStyle="rgba(60,255,216,.25)";ctx.lineWidth=3;
  for(const lx of [557,640,723]){ctx.beginPath();ctx.moveTo(lx,topY);ctx.lineTo(640+(lx-640)*4.7,bottomY);ctx.stroke()}
  for(let i=0;i<17;i++){
    let p=(i/17+world.roadPhase)%1;p=p*p;
    const y=topY+(bottomY-topY)*p;
    const half=120+350*p;
    ctx.strokeStyle=`rgba(255,255,255,${.04+.15*p})`;ctx.lineWidth=1+5*p;ctx.beginPath();ctx.moveTo(640-half,y);ctx.lineTo(640+half,y);ctx.stroke();
  }
  ctx.fillStyle="rgba(60,255,216,.22)";ctx.fillRect(155,592,180,4);ctx.fillStyle="rgba(255,157,47,.20)";ctx.fillRect(945,570,170,4);

  const sorted=[...world.objects].sort((a,b)=>b.z-a.z);
  for(const o of sorted)drawObject(o);
  for(const b of world.bullets)drawBullet(b);
  drawHummer();
  for(const p of world.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.s,p.s)}ctx.globalAlpha=1;

  if(flash){ctx.fillStyle=`rgba(255,50,70,${flash*.35})`;ctx.fillRect(0,0,1280,720)}
  ctx.restore();
}
function proj(z,lane){
  const p=clamp(1-z/1500,.02,1.16);
  const y=320+390*p*p;
  const x=laneX(lane,p);
  return {x,y,s:.12+p*.94};
}
function drawObject(o){
  const q=proj(o.z,o.lane),x=q.x,y=q.y,s=q.s;
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  if(o.type==="barrier"){
    ctx.fillStyle="#171b1c";ctx.fillRect(-55,-36,110,72);ctx.fillStyle="#ff9d2f";ctx.fillRect(-50,-28,100,12);ctx.fillStyle="#dce9e6";ctx.fillRect(-38,4,76,8);
  }else if(o.type==="shard"){
    ctx.rotate(state.t*2);ctx.strokeStyle="#3cffd8";ctx.lineWidth=5;ctx.shadowColor="#3cffd8";ctx.shadowBlur=20;ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2,r=28;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.stroke();
  }else if(o.type==="boost"){
    ctx.fillStyle="#ff9d2f";ctx.shadowColor="#ff9d2f";ctx.shadowBlur=20;ctx.beginPath();ctx.moveTo(-12,-32);ctx.lineTo(11,-7);ctx.lineTo(0,-7);ctx.lineTo(14,31);ctx.lineTo(-13,5);ctx.lineTo(-2,5);ctx.closePath();ctx.fill();
  }else if(o.type==="drone"){
    ctx.globalAlpha=o.hit?.35:1;ctx.strokeStyle="#3cffd8";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-42,0);ctx.lineTo(42,0);ctx.stroke();ctx.fillStyle="#101818";ctx.fillRect(-18,-10,36,24);ctx.fillStyle="#ff435f";ctx.fillRect(-5,-4,10,8);ctx.beginPath();ctx.arc(-42,0,12,0,Math.PI*2);ctx.arc(42,0,12,0,Math.PI*2);ctx.stroke();
  }else if(o.type==="checkpoint"){
    ctx.strokeStyle="#3cffd8";ctx.lineWidth=12;ctx.shadowColor="#3cffd8";ctx.shadowBlur=20;ctx.beginPath();ctx.arc(0,0,110,Math.PI,0);ctx.stroke();ctx.fillStyle="#02100d";ctx.fillRect(-82,-124,164,34);ctx.strokeStyle="#3cffd8";ctx.lineWidth=3;ctx.strokeRect(-82,-124,164,34);ctx.fillStyle="#eafff8";ctx.font="900 22px system-ui";ctx.textAlign="center";ctx.fillText("CHECKPOINT",0,-101);
  }else if(o.type==="boss"){
    ctx.globalAlpha=o.hit?.3:1;ctx.strokeStyle="#ff435f";ctx.lineWidth=8;ctx.shadowColor="#ff435f";ctx.shadowBlur=24;ctx.beginPath();ctx.arc(0,0,70,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#111";ctx.fillRect(-44,-44,88,88);ctx.fillStyle="#ff435f";ctx.fillRect(-9,-9,18,18);ctx.font="900 18px system-ui";ctx.fillStyle="#fff";ctx.textAlign="center";ctx.fillText("BLACK NODE",0,104);
  }
  ctx.restore();
}
function drawBullet(b){
  const q=proj(b.z,b.lane);ctx.save();ctx.translate(q.x,q.y);ctx.scale(q.s,q.s);ctx.fillStyle="#eafff9";ctx.shadowColor="#3cffd8";ctx.shadowBlur=16;ctx.fillRect(-6,-36,12,36);ctx.restore();
}
function drawHummer(){
  const lane=world.lane,p=proj(60,lane),jump=world.jump*95;
  ctx.save();ctx.translate(p.x,610-jump);ctx.rotate((world.targetLane-world.lane)*-.045);
  if(input.boost&&state.boost>0){ctx.fillStyle="rgba(255,157,47,.7)";ctx.beginPath();ctx.moveTo(-66,24);ctx.lineTo(-112,9);ctx.lineTo(-70,2);ctx.fill();ctx.beginPath();ctx.moveTo(66,24);ctx.lineTo(112,9);ctx.lineTo(70,2);ctx.fill()}
  ctx.fillStyle="#0b0e0f";ctx.strokeStyle="#c7b58f";ctx.lineWidth=4;
  ctx.beginPath();ctx.roundRect(-92,-44,184,82,17);ctx.fill();ctx.stroke();
  ctx.fillStyle="#9d8b68";ctx.fillRect(-74,-58,148,31);ctx.fillStyle="#10181b";ctx.fillRect(-55,-54,110,24);
  ctx.fillStyle="#0a0c0d";ctx.beginPath();ctx.arc(-62,40,24,0,Math.PI*2);ctx.arc(62,40,24,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#eefcf8";ctx.shadowColor="#d8fff8";ctx.shadowBlur=16;ctx.fillRect(-76,-20,18,16);ctx.fillRect(58,-20,18,16);
  ctx.shadowBlur=0;ctx.fillStyle="#3cffd8";ctx.font="900 17px system-ui";ctx.textAlign="center";ctx.fillText("EX-001",0,20);
  ctx.restore();
}
function frame(t){
  const dt=Math.min(.035,(t-last)/1000||0);last=t;
  update(dt);draw();requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
