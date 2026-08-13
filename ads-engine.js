(() => {
'use strict';

const FALLBACK = {
  version: 1,
  endpoint: "",
  provider: "house",
  campaigns: [
    {
      id: "ex-house-001",
      brand: "EX™ PLAYABLE WORLDS",
      headline: "ENGINEERING HUMAN EXPERIENCES",
      subline: "Playable media. Built into the world.",
      clickUrl: "",
      placements: ["menu_partner","brief_partner","world_billboard","result_partner"],
      weight: 1,
      active: true
    }
  ],
  rewarded: {
    provider: "house",
    label: "SIGNAL BOOST",
    seconds: 5,
    rewardCredits: 250,
    googleAdUnitPath: ""
  }
};

const now = () => Date.now();
const safeText = (v, n=100) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0,n);
const validHttp = (u) => {
  try {
    const x = new URL(u, location.href);
    return ["https:","http:"].includes(x.protocol) ? x.href : "";
  } catch { return ""; }
};

class EXAdEngine {
  constructor(){
    this.config = FALLBACK;
    this.sessionId = crypto?.randomUUID?.() || `sess-${now()}-${Math.random().toString(16).slice(2)}`;
    this.exposure = new Map();
    this.loaded = false;
  }

  async init(){
    try{
      const r = await fetch(`campaigns.json?v=${now()}`, {cache:"no-store"});
      if(r.ok){
        const cfg = await r.json();
        if(cfg && Array.isArray(cfg.campaigns)) this.config = {...FALLBACK, ...cfg};
      }
    }catch{}
    this.loaded = true;
    return this;
  }

  eligible(placement){
    const t = now();
    return (this.config.campaigns || []).filter(c => {
      if(!c || c.active === false) return false;
      if(!Array.isArray(c.placements) || !c.placements.includes(placement)) return false;
      if(c.startAt && t < Date.parse(c.startAt)) return false;
      if(c.endAt && t > Date.parse(c.endAt)) return false;
      const cap = Number(c.frequencyCapPerSession || 0);
      if(cap > 0){
        const used = Number(sessionStorage.getItem(`exad:${c.id}:${placement}`) || 0);
        if(used >= cap) return false;
      }
      return true;
    });
  }

  pick(placement){
    const list = this.eligible(placement);
    if(!list.length) return null;
    const weighted = [];
    for(const c of list){
      const w = Math.max(1, Math.min(10, Number(c.weight || 1)));
      for(let i=0;i<w;i++) weighted.push(c);
    }
    return weighted[Math.floor(Math.random()*weighted.length)] || list[0];
  }

  mark(placement, campaign){
    if(!campaign) return;
    const key = `exad:${campaign.id}:${placement}`;
    sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || 0)+1));
  }

  track(type, payload={}){
    const event = {
      type,
      at: new Date().toISOString(),
      sessionId: this.sessionId,
      path: location.pathname,
      ...payload
    };
    try{
      const endpoint = validHttp(this.config.endpoint || "");
      if(endpoint && navigator.sendBeacon){
        navigator.sendBeacon(endpoint, new Blob([JSON.stringify(event)], {type:"application/json"}));
      } else if(endpoint){
        fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(event),keepalive:true}).catch(()=>{});
      }
    }catch{}
    try{
      const q = JSON.parse(localStorage.getItem("ex_signal_ad_events") || "[]");
      q.push(event);
      localStorage.setItem("ex_signal_ad_events", JSON.stringify(q.slice(-100)));
    }catch{}
    return event;
  }

  renderCard(el, placement){
    if(!el) return null;
    const c = this.pick(placement);
    if(!c){ el.hidden = true; return null; }
    const b = el.querySelector("b");
    const s = el.querySelector("small");
    const btn = el.querySelector("button");
    if(b) b.textContent = safeText(c.brand,50);
    if(s) s.textContent = safeText(c.headline || c.subline,110);
    if(btn){
      const url = validHttp(c.clickUrl || "");
      btn.hidden = !url;
      btn.onclick = () => {
        if(!url) return;
        this.track("sponsor_click",{campaignId:c.id,placement});
        window.open(url,"_blank","noopener,noreferrer");
      };
    }
    el.hidden = false;
    this.mark(placement,c);
    this.track("sponsor_exposure",{campaignId:c.id,placement});
    return c;
  }

  showWorldBillboard(el, durationMs=4200){
    if(!el) return;
    const c = this.pick("world_billboard");
    if(!c){ el.classList.add("hidden"); return; }
    el.querySelector("b").textContent = safeText(c.brand,50);
    el.querySelector("small").textContent = safeText(c.headline || c.subline,100);
    el.classList.remove("hidden");
    this.mark("world_billboard",c);
    this.track("sponsor_exposure",{campaignId:c.id,placement:"world_billboard",visibleMs:durationMs});
    clearTimeout(this._worldTimer);
    this._worldTimer = setTimeout(()=>el.classList.add("hidden"),durationMs);
  }

  async showRewarded(){
    const r = this.config.rewarded || FALLBACK.rewarded;
    if(r.provider === "google-gpt" && r.googleAdUnitPath && window.googletag){
      return this._showGoogleRewarded(r.googleAdUnitPath);
    }
    return this._showHouseRewarded(r);
  }

  _showHouseRewarded(r){
    return new Promise(resolve => {
      const seconds = Math.max(3, Math.min(15, Number(r.seconds || 5)));
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.94);display:flex;align-items:center;justify-content:center;padding:24px;color:white;font-family:system-ui";
      const box = document.createElement("div");
      box.style.cssText = "width:min(520px,92vw);padding:28px;border:1px solid rgba(60,255,216,.3);background:#07100f;text-align:center";
      box.innerHTML = `<div style="font-size:9px;letter-spacing:.2em;color:#3cffd8">REWARDED • OPTIONAL</div>
        <h2 style="font-size:36px;margin:10px 0">${safeText(r.label || "SIGNAL BOOST",50)}</h2>
        <p style="color:#aabbb6;line-height:1.7">مساحة تجريبية لمحتوى الشريك. لا توجد نقرة إجبارية ولا يتوقف اللعب أثناء الجولة.</p>
        <div id="exRewardCountdown" style="font-size:64px;font-weight:900;color:#3cffd8">${seconds}</div>
        <button id="exRewardCancel" style="margin-top:10px;background:transparent;color:white;border:1px solid #29423e;padding:10px 16px">إلغاء</button>`;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      this.track("rewarded_start",{provider:"house"});
      let left = seconds;
      const iv = setInterval(()=>{
        left--;
        const n = box.querySelector("#exRewardCountdown");
        if(n) n.textContent = Math.max(0,left);
        if(left <= 0){
          clearInterval(iv);
          overlay.remove();
          this.track("rewarded_complete",{provider:"house"});
          resolve({granted:true,credits:Number(r.rewardCredits || 250)});
        }
      },1000);
      box.querySelector("#exRewardCancel").onclick = () => {
        clearInterval(iv);
        overlay.remove();
        this.track("rewarded_cancel",{provider:"house"});
        resolve({granted:false,credits:0});
      };
    });
  }

  _showGoogleRewarded(adUnitPath){
    return new Promise(resolve => {
      const g = window.googletag;
      g.cmd = g.cmd || [];
      g.cmd.push(() => {
        let granted = false;
        const slot = g.defineOutOfPageSlot(adUnitPath, g.enums.OutOfPageFormat.REWARDED);
        if(!slot){ resolve({granted:false,credits:0,error:"unsupported"}); return; }
        slot.addService(g.pubads());
        const ready = e => {
          if(e.slot !== slot) return;
          e.makeRewardedVisible();
        };
        const reward = e => {
          if(e.slot !== slot) return;
          granted = true;
        };
        const closed = e => {
          if(e.slot !== slot) return;
          g.pubads().removeEventListener("rewardedSlotReady", ready);
          g.pubads().removeEventListener("rewardedSlotGranted", reward);
          g.pubads().removeEventListener("rewardedSlotClosed", closed);
          g.destroySlots([slot]);
          this.track(granted ? "rewarded_complete" : "rewarded_cancel",{provider:"google-gpt"});
          resolve({granted,credits:granted?Number(this.config.rewarded.rewardCredits || 250):0});
        };
        g.pubads().addEventListener("rewardedSlotReady",ready);
        g.pubads().addEventListener("rewardedSlotGranted",reward);
        g.pubads().addEventListener("rewardedSlotClosed",closed);
        g.enableServices();
        g.display(slot);
      });
    });
  }
}

window.EXAds = new EXAdEngine();
window.EXAds.init();
})();
