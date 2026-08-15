/* EX™ SIGNAL RUN — resilient analytics v1.1 */
(() => {
  'use strict';
  const GAME_ID='SIGNAL_RUN';
  const STORE='ex_signal_run_analytics_v1';
  const PLAYER='ex_signal_run_player_id';
  const sessionId=(globalThis.crypto?.randomUUID?.()||`S-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0,64);
  const startedAt=Date.now();
  let ended=false;

  function playerId(){
    try{
      let id=localStorage.getItem(PLAYER);
      if(!id){id=`EX-${(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(-8).toUpperCase()}`;localStorage.setItem(PLAYER,id)}
      return id;
    }catch{return 'EX-ANON'}
  }
  function read(){try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return []}}
  function track(event,payload={}){
    const row={schema:1,gameId:GAME_ID,event:String(event).slice(0,64),playerId:playerId(),sessionId,at:new Date().toISOString(),...payload};
    try{const q=read();q.push(row);localStorage.setItem(STORE,JSON.stringify(q.slice(-250)))}catch{}
    try{window.dispatchEvent(new CustomEvent('ex:analytics',{detail:row}))}catch{}
    return row;
  }
  function score(){const el=document.querySelector('#resultScore')||document.querySelector('#scoreText');const n=Number(String(el?.textContent||'0').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0}
  function bind(){
    track('game_visit',{path:location.pathname});
    document.querySelector('#startBtn')?.addEventListener('click',()=>track('menu_start'));
    document.querySelector('#briefGo')?.addEventListener('click',()=>{ended=false;track('game_start')});
    document.querySelector('#restartBtn')?.addEventListener('click',()=>track('game_restart',{previousScore:score()}));
    document.querySelector('#rewardBtn')?.addEventListener('click',()=>track('rewarded_ad_request',{score:score()}));
    const result=document.querySelector('#result');
    if(result)new MutationObserver(()=>{if(result.classList.contains('active')&&!ended){ended=true;track('game_end',{score:score(),result:String(document.querySelector('#resultTitle')?.textContent||'complete').slice(0,80),sessionSeconds:Math.max(1,Math.round((Date.now()-startedAt)/1000))})}}).observe(result,{attributes:true,attributeFilter:['class']});
    addEventListener('pagehide',()=>track('session_exit',{score:score(),sessionSeconds:Math.max(1,Math.round((Date.now()-startedAt)/1000))}));
  }
  window.EXGameAnalytics=Object.freeze({track,read,gameId:GAME_ID,playerId:playerId()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
