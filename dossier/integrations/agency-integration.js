/* EX™ Dossier Integration V3
 * GitHub Pages client runtime.
 * Secrets never live here: EX Oracle uses Firebase Callable Functions,
 * which call Apps Script server-to-server.
 */
(() => {
  "use strict";

  const C = window.EX_AGENCY_CONFIG;
  if (!C || !window.firebase) {
    console.error("[EX V3] Missing config or Firebase SDK.");
    return;
  }

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const ar = () => document.documentElement.lang === "ar";
  const tr = (a,e) => ar() ? a : e;
  const clean = (v,n=1800) => String(v ?? "").replace(/[<>]/g,"").trim().slice(0,n);
  const ts = () => firebase.firestore.FieldValue.serverTimestamp();

  let app, auth, db, storage, functions;
  try {
    app = firebase.apps.length ? firebase.app() : firebase.initializeApp(C.firebase);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    functions = firebase.app().functions(C.functionsRegion || "us-central1");

    if (C.appCheckSiteKey && firebase.appCheck) {
      const ac = firebase.appCheck();
      ac.activate(
        new firebase.appCheck.ReCaptchaEnterpriseProvider(C.appCheckSiteKey),
        true
      );
    }
  } catch (err) {
    console.error("[EX V3] Firebase initialization failed:", err);
    return;
  }

  const call = {
    oracle: functions.httpsCallable("exOracle"),
    visit: functions.httpsCallable("exIncrementVisit"),
    stats: functions.httpsCallable("exGetPublicStats"),
    lookup: functions.httpsCallable("exLookupRequest")
  };

  async function identity() {
    if (auth.currentUser) return auth.currentUser;
    const r = await auth.signInAnonymously();
    return r.user;
  }

  function refCode(prefix="EX") {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,"0");
    const day = String(d.getUTCDate()).padStart(2,"0");
    const rnd = crypto.getRandomValues(new Uint32Array(2));
    const token = (rnd[0].toString(36)+rnd[1].toString(36)).toUpperCase().slice(0,10);
    return `${prefix}-${y}${m}${day}-${token}`;
  }

  function status(el, msg, type="") {
    if (!el) return;
    el.textContent = msg;
    el.className = `exv3-status${type ? " "+type : ""}`;
  }

  function fmtDate(v) {
    try {
      const d = v?.toDate ? v.toDate() : new Date(v);
      if (Number.isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat(ar()?"ar-SA":"en-GB", {dateStyle:"medium", timeStyle:"short"}).format(d);
    } catch { return ""; }
  }

  function safeFileName(name) {
    return clean(name,120).replace(/[^\w.\-() ]+/g,"_").replace(/\s+/g,"_");
  }

  function validFile(file) {
    const types = ["image/jpeg","image/png","image/webp","application/pdf"];
    return file && types.includes(file.type) && file.size > 0 && file.size <= C.maxUploadBytes;
  }

  async function uploadList(files, basePath) {
    const uploaded = [];
    for (let i=0;i<files.length;i++) {
      const file = files[i];
      if (!validFile(file)) throw new Error("invalid-file");
      const path = `${basePath}/${Date.now()}-${i+1}-${safeFileName(file.name)}`;
      const ref = storage.ref(path);
      await ref.put(file, {
        contentType: file.type,
        cacheControl: "private,max-age=3600",
        customMetadata: {source:"ex-dossier-v3"}
      });
      uploaded.push({Path:path, Name:clean(file.name,160), Type:file.type, Size:file.size});
    }
    return uploaded;
  }

  function injectServices() {
    if ($("#exv3-services")) return;
    const anchor = $("#system") || $("#portfolio") || $("#creative-lab");
    if (!anchor) return;
    const section = document.createElement("section");
    section.id = "exv3-services";
    section.className = "exv3-section";
    section.innerHTML = `
      <div class="exv3-shell">
        <div class="exv3-kicker">EX / ACTIVE CAPABILITIES</div>
        <h2 class="exv3-title"><span class="ar-only">الخدمات المتاحة.<br>من الاستراتيجية إلى الأثر.</span><span class="en-only">Active capabilities.<br>From strategy to impact.</span></h2>
        <p class="exv3-lead"><span class="ar-only">يتم تحميل القائمة من قاعدة البيانات عند توفرها، مع إبقاء النسخة الأساسية للموقع متاحة دائماً.</span><span class="en-only">The list is loaded from the database when available while keeping the core site experience available at all times.</span></p>
        <div class="exv3-services" id="exv3ServiceGrid"></div>
      </div>`;
    anchor.insertAdjacentElement("afterend", section);
    loadServices();
  }

  const FALLBACK_SERVICES = [
    ["01","Strategy","الاستراتيجية والتموضع","Strategy & positioning"],
    ["02","Identity","الهوية والأنظمة البصرية","Identity & visual systems"],
    ["03","Campaign","الحملات والسرد متعدد القنوات","Campaigns & multi-channel narrative"],
    ["04","Film","الإخراج والإنتاج السينمائي","Creative direction & film production"],
    ["05","Experience","هندسة التجربة والفعاليات","Experience architecture & activations"],
    ["06","Digital","المنتجات والمنصات الرقمية","Digital products & platforms"],
    ["07","Consulting","الاستشارات الإبداعية والتنفيذية","Creative & executive consulting"],
    ["08","Partnership","الشراكات والمشاريع الخاصة","Partnerships & special projects"]
  ];

  function paintServices(rows) {
    const grid = $("#exv3ServiceGrid");
    if (!grid) return;
    grid.innerHTML = "";
    rows.forEach((r,i) => {
      const el = document.createElement("article");
      el.className = "exv3-service";
      const n = String(i+1).padStart(2,"0");
      el.innerHTML = `<b>${clean(r.Number||n,4)}</b><div><h3>${clean(ar()?(r.NameAr||r.Name||""):(r.NameEn||r.Name||""),90)}</h3><p>${clean(ar()?(r.DescriptionAr||r.Description||""):(r.DescriptionEn||r.Description||""),280)}</p></div>`;
      grid.appendChild(el);
    });
  }

  async function loadServices() {
    paintServices(FALLBACK_SERVICES.map(([Number,Name,NameAr,NameEn])=>({Number,Name,NameAr,NameEn,DescriptionAr:NameAr,DescriptionEn:NameEn})));
    try {
      const snap = await db.collection(C.collections.publicServices).where("Active","==",true).limit(20).get();
      if (!snap.empty) paintServices(snap.docs.map(d=>d.data()));
    } catch (err) {
      console.info("[EX V3] Using embedded service fallback.");
    }
  }

  function injectConsultation() {
    if ($("#exv3-consultation")) return;
    const anchor = $("#creative-lab");
    if (!anchor) return;
    const sec = document.createElement("section");
    sec.id = "exv3-consultation";
    sec.className = "exv3-section exv3-dark";
    sec.innerHTML = `
      <div class="exv3-shell exv3-consult-grid">
        <div>
          <div class="exv3-kicker">EXECUTIVE CONSULTATION / V3</div>
          <h2 class="exv3-title"><span class="ar-only">طلب استشارة<br>قابل للمتابعة.</span><span class="en-only">A consultation request<br>you can track.</span></h2>
          <p class="exv3-lead"><span class="ar-only">أرسل التحدي والملفات المرجعية. تحصل فوراً على رقم مرجعي وتظهر المراحل والردود اللاحقة في بوابة العميل.</span><span class="en-only">Send the challenge and references. You receive a reference immediately, with later stages and updates visible in the client portal.</span></p>
        </div>
        <form class="exv3-card" id="exv3ConsultForm" novalidate>
          <div class="exv3-form-grid">
            <input class="exv3-input" id="exv3ConsultName" maxlength="80" required placeholder="${tr("الاسم الكامل","Full name")}">
            <input class="exv3-input" id="exv3ConsultCompany" maxlength="100" placeholder="${tr("العلامة / الجهة","Brand / organisation")}">
            <input class="exv3-input" id="exv3ConsultEmail" type="email" maxlength="120" required placeholder="${tr("البريد الإلكتروني","Email")}">
            <input class="exv3-input" id="exv3ConsultPhone" type="tel" maxlength="24" placeholder="${tr("رقم الجوال","Phone")}">
            <select class="exv3-select full" id="exv3ConsultService" required>
              <option value="">${tr("نوع الاستشارة","Consultation type")}</option>
              <option value="strategy">Strategy</option><option value="identity">Identity</option>
              <option value="campaign">Campaign</option><option value="film">Film / Production</option>
              <option value="experience">Experience</option><option value="digital">Digital</option>
              <option value="partnership">Partnership</option><option value="other">Other</option>
            </select>
            <textarea class="exv3-textarea full" id="exv3ConsultMessage" maxlength="4000" required placeholder="${tr("اكتب التحدي، الهدف، والسياق الذي يجب أن نعرفه.","Describe the challenge, objective and essential context.")}"></textarea>
            <div class="exv3-files full">
              ${[1,2,3,4].map(i=>`<label class="exv3-file">${tr("مرفق","Attachment")} ${i}<input id="exv3ConsultFile${i}" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>`).join("")}
            </div>
            <label class="full" style="font-size:.72rem;line-height:1.7;color:#bbb"><input type="checkbox" id="exv3ConsultConsent" required> ${tr("أوافق على معالجة الطلب والمرفقات لغرض التقييم والتواصل، وأؤكد أنني مخول بمشاركة الملفات.","I consent to processing this request and attachments for assessment and communication, and confirm I am authorised to share the files.")}</label>
            <button class="exv3-btn full" id="exv3ConsultSubmit" type="submit">${tr("إرسال الاستشارة بأمان","Submit consultation securely")}</button>
            <div class="exv3-status full" id="exv3ConsultStatus" aria-live="polite"></div>
          </div>
        </form>
      </div>`;
    anchor.insertAdjacentElement("afterend", sec);
  }

  async function submitConsultation(form) {
    const s = $("#exv3ConsultStatus"), btn = $("#exv3ConsultSubmit");
    const data = {
      Name: clean($("#exv3ConsultName").value,80),
      Company: clean($("#exv3ConsultCompany").value,100),
      Email: clean($("#exv3ConsultEmail").value,120).toLowerCase(),
      Phone: clean($("#exv3ConsultPhone").value,24),
      Service: clean($("#exv3ConsultService").value,60),
      Message: clean($("#exv3ConsultMessage").value,4000),
      Consent: $("#exv3ConsultConsent").checked
    };
    if (!data.Name || !data.Email || !data.Service || !data.Message || !data.Consent) {
      status(s,tr("أكمل الحقول الأساسية والموافقة.","Complete the required fields and consent."),"err"); return;
    }
    const files = [1,2,3,4].map(i=>$(`#exv3ConsultFile${i}`)?.files?.[0]).filter(Boolean);
    if (files.some(f=>!validFile(f))) {
      status(s,tr("أحد الملفات غير مدعوم أو أكبر من 12MB.","One attachment is unsupported or exceeds 12MB."),"err"); return;
    }
    btn.disabled = true;
    status(s,tr("جارٍ إنشاء الطلب ورفع المرفقات...","Creating the request and uploading attachments..."));
    try {
      const user = await identity();
      const doc = db.collection(C.collections.consultations).doc();
      const code = refCode("EXC");
      const attachments = await uploadList(files, `consultations/${user.uid}/${doc.id}`);
      await doc.set({
        ...data, ReferenceCode:code, ReferenceFiles:attachments,
        OwnerUid:user.uid, Status:"Received", Stage:"Intake",
        NextAction:tr("مراجعة الطلب من الفريق","Team review"),
        Source:"EX Executive Consultation", Language:ar()?"ar":"en",
        ConsentVersion:"2026-08-v3", CreatedAt:ts(), UpdatedAt:ts()
      });
      form.reset();
      status(s,tr(`تم الاستلام. رقم المتابعة: ${code}`,`Received. Tracking reference: ${code}`),"ok");
      renderPortal(auth.currentUser);
    } catch (err) {
      console.error(err);
      status(s,tr("تعذر إرسال الاستشارة. تحقق من Firebase والصلاحيات.","Could not submit the consultation. Check Firebase and permissions."),"err");
    } finally { btn.disabled=false; }
  }

  async function takeOverCreativeIntake(e) {
    const form = e.target;
    const s = $("#vrStatus"), btn = $("#vrSubmit");
    const capabilities = $$('input[name="capability"]:checked').map(x=>x.value);
    const payload = {
      Name:clean($("#vrName")?.value,80), Company:clean($("#vrCompany")?.value,100),
      Email:clean($("#vrEmail")?.value,120).toLowerCase(), Phone:clean($("#vrPhone")?.value,24),
      Sector:clean($("#vrSector")?.value,60), Budget:clean($("#vrBudget")?.value,40),
      Capabilities:capabilities, Goal:clean($("#vrGoal")?.value,1800),
      PrivacyConsent:!!$("#privacyConsent")?.checked, DirectionConsent:!!$("#simulationConsent")?.checked
    };
    if (!payload.Name || !payload.Company || !payload.Email || !payload.Phone || !payload.Sector || !payload.Budget || !payload.Goal || !capabilities.length || !payload.PrivacyConsent || !payload.DirectionConsent) {
      if (s) { s.textContent=tr("أكمل جميع الحقول واختر خدمة واحدة على الأقل ووافق على الإقرارات.","Complete all fields, select a capability and accept the consents."); s.className="status error"; }
      return;
    }
    const files = [1,2,3,4,5,6].map(i=>$(`#file${i}`)?.files?.[0]).filter(Boolean);
    if (files.some(f=>!validFile(f))) {
      if(s){s.textContent=tr("أحد المراجع غير مدعوم أو أكبر من 12MB.","A reference is unsupported or exceeds 12MB.");s.className="status error";} return;
    }
    if (btn) btn.disabled=true;
    if(s){s.textContent=tr("جارٍ حفظ الطلب والمراجع...","Saving request and references...");s.className="status";}
    try {
      const user = await identity();
      const doc = db.collection(C.collections.creativeIntakes).doc();
      const code = refCode("EXI");
      const refs = await uploadList(files, `creative-intakes/${user.uid}/${doc.id}`);
      await doc.set({
        ...payload, ReferenceFiles:refs, ReferenceCode:code,
        OwnerUid:user.uid, Status:"Received", Stage:"Intake",
        NextAction:tr("مراجعة الملاءمة والنطاق","Fit and scope review"),
        Source:"EX Creative Direction Lab", Language:ar()?"ar":"en",
        ConsentVersion:"2026-08-v3", CreatedAt:ts(), UpdatedAt:ts()
      });
      form.reset();
      if(s){s.innerHTML=`${tr("تم استلام الملف. رقم المتابعة:","Intake received. Tracking reference:")} <span class="exv3-reference">${code}</span>`;s.className="status success";}
      $$("[data-index].upload-box").forEach(box=>{box.classList.remove("has-file","is-uploaded","is-uploading","is-invalid");box.style.setProperty("--upload-progress","0%");const img=$("img",box);if(img)img.removeAttribute("src");const meta=$(".upload-meta",box);if(meta)meta.textContent="";});
      if ($("#uploadSummaryCount")) $("#uploadSummaryCount").textContent="0 / 6";
      if ($("#uploadSummaryBar")) $("#uploadSummaryBar").style.width="0";
      renderPortal(auth.currentUser);
    } catch(err) {
      console.error(err);
      if(s){s.textContent=tr("فشل الإرسال. راجع Authentication وقواعد Firestore وStorage.","Submission failed. Check Authentication and Firestore/Storage rules.");s.className="status error";}
    } finally { if(btn)btn.disabled=false; }
  }

  async function takeOverEarlyAccess(e) {
    const form=e.target, s=$("#earlyStatus"), btn=$("#earlySubmit");
    const data={
      Name:clean($("#earlyName")?.value,80), Phone:clean($("#earlyPhone")?.value,24),
      Email:clean($("#earlyEmail")?.value,120).toLowerCase(),
      Interest:clean($("#earlyInterest")?.value,60), Consent:!!$("#earlyConsent")?.checked
    };
    if(!data.Name||!data.Phone||!data.Email||!data.Interest||!data.Consent){
      if(s){s.textContent=tr("أكمل البيانات والموافقة.","Complete the details and consent.");s.className="status error";}return;
    }
    if(btn)btn.disabled=true;
    try{
      const user=await identity(), code=refCode("EXA");
      await db.collection(C.collections.earlyAccess).add({
        ...data,ReferenceCode:code,OwnerUid:user.uid,Status:"Received",Stage:"Registered",
        NextAction:tr("مراجعة طلب الانضمام","Membership review"),Source:"EX Private Circle",
        Language:ar()?"ar":"en",ConsentVersion:"2026-08-v3",CreatedAt:ts(),UpdatedAt:ts()
      });
      form.reset();
      if(s){s.innerHTML=`${tr("تم تسجيلك. رقم المتابعة:","Registration received. Reference:")} <span class="exv3-reference">${code}</span>`;s.className="status success";}
      renderPortal(auth.currentUser);
    }catch(err){console.error(err);if(s){s.textContent=tr("تعذر التسجيل حالياً.","Registration is currently unavailable.");s.className="status error";}}
    finally{if(btn)btn.disabled=false;}
  }

  function assistantHistory() {
    try { return JSON.parse(sessionStorage.getItem("ex_oracle_history_v3")||"[]").slice(-8); }
    catch { return []; }
  }
  function saveAssistantHistory(h) {
    sessionStorage.setItem("ex_oracle_history_v3",JSON.stringify(h.slice(-8)));
  }
  function appendAssistant(role,text) {
    const body=$("#assistantBody"); if(!body)return null;
    const div=document.createElement("div");div.className=`message ${role}`;div.textContent=text;body.appendChild(div);body.scrollTop=body.scrollHeight;return div;
  }

  async function takeOverAssistant(e) {
    const input=$("#assistantInput"), q=clean(input?.value,1000); if(!q)return;
    appendAssistant("user",q);input.value="";
    const wait=appendAssistant("bot",tr("لحظة واحدة...","One moment..."));
    try{
      await identity();
      const h=assistantHistory();
      const result=await call.oracle({message:q,language:ar()?"ar":"en",history:h});
      const reply=clean(result.data?.reply,2200)||tr("تعذر تجهيز الإجابة الآن.","The reply is temporarily unavailable.");
      wait.textContent=reply;
      h.push({role:"user",text:q},{role:"assistant",text:reply});saveAssistantHistory(h);
    }catch(err){
      console.error("[EX V3] Oracle:",err);
      wait.textContent=tr("تعذر الاتصال بـ EX Oracle حالياً. يمكنك إرسال طلبك عبر EXECUTIVE PORTAL.","EX Oracle is temporarily unavailable. You can submit your request through the EXECUTIVE PORTAL.");
    }
  }

  function collectionForType(type) {
    return ({
      PROJECT:C.collections.clientProjects,
      INTAKE:C.collections.creativeIntakes,
      CONSULTATION:C.collections.consultations,
      EARLY_ACCESS:C.collections.earlyAccess
    })[type];
  }

  async function loadTimeline(type,id,container) {
    const col=collectionForType(type); if(!col)return;
    container.textContent=tr("جارٍ تحميل السجل...","Loading timeline...");
    try{
      const snap=await db.collection(col).doc(id).collection("Timeline").orderBy("At","asc").limit(C.requestLookupMaxTimeline||20).get();
      container.innerHTML="";
      if(snap.empty){container.textContent=tr("لا توجد تحديثات إضافية بعد.","No additional updates yet.");return;}
      snap.forEach(d=>{
        const x=d.data(), el=document.createElement("div");el.className="exv3-timeline-item";
        el.innerHTML=`<b>${clean(ar()?(x.TitleAr||x.Title||x.Status||""):(x.TitleEn||x.Title||x.Status||""),120)}</b><span>${clean(ar()?(x.NoteAr||x.Note||""):(x.NoteEn||x.Note||""),300)} ${fmtDate(x.At)}</span>`;
        container.appendChild(el);
      });
    }catch(err){console.error(err);container.textContent=tr("تعذر تحميل السجل.","Could not load timeline.");}
  }

  function recordCard(row) {
    const card=document.createElement("article");card.className="exv3-record";
    const title=clean(row.ProjectName||row.Company||row.Name||row.Service||row.type,100);
    card.innerHTML=`<div class="exv3-record-head"><div><h3>${title}</h3><p><span class="exv3-reference">${clean(row.ReferenceCode||row.id,80)}</span> · ${clean(row.type,30)}</p></div><span class="exv3-chip">${clean(row.Status||"Received",50)}</span></div>
      ${row.Stage?`<p>${tr("المرحلة:","Stage:")} ${clean(row.Stage,100)}</p>`:""}
      ${row.NextAction?`<p>${tr("الخطوة التالية:","Next action:")} ${clean(row.NextAction,300)}</p>`:""}
      <button class="exv3-linkbtn" type="button">${tr("عرض سجل المتابعة","View tracking history")}</button><div class="exv3-timeline exv3-hidden"></div>`;
    const btn=$(".exv3-linkbtn",card), timeline=$(".exv3-timeline",card);
    btn.addEventListener("click",async()=>{
      const hidden=timeline.classList.contains("exv3-hidden");
      timeline.classList.toggle("exv3-hidden",!hidden);
      if(hidden && !timeline.dataset.loaded){timeline.dataset.loaded="1";await loadTimeline(row.type,row.id,timeline);}
    });
    return card;
  }

  function portalBoxV3() {
    const legacy=$("#portalProjects"), signedIn=$("#portalSignedIn");
    if(!signedIn)return null;
    let box=$("#exv3PortalRecords");
    if(!box){
      box=document.createElement("div");
      box.id="exv3PortalRecords";
      box.className="portal-projects";
      if(legacy){
        legacy.classList.add("exv3-hidden");
        legacy.insertAdjacentElement("afterend",box);
      } else signedIn.appendChild(box);
    }
    return box;
  }

  async function renderPortal(user) {
    const signedOut=$("#portalSignedOut"),signedIn=$("#portalSignedIn"),box=portalBoxV3();
    if(!signedOut||!signedIn||!box)return;
    if(!user||user.isAnonymous){signedOut.hidden=false;signedIn.hidden=true;return;}
    signedOut.hidden=true;signedIn.hidden=false;
    if($("#portalUserName"))$("#portalUserName").textContent=user.displayName||user.email||"Client";
    box.textContent=tr("جارٍ تحميل جميع الطلبات...","Loading all requests...");
    const defs=[
      ["PROJECT",C.collections.clientProjects],
      ["INTAKE",C.collections.creativeIntakes],
      ["CONSULTATION",C.collections.consultations],
      ["EARLY_ACCESS",C.collections.earlyAccess]
    ];
    try{
      const snaps=await Promise.all(defs.map(async([type,col])=>{
        try{return [type,await db.collection(col).where("OwnerUid","==",user.uid).limit(50).get()];}
        catch(err){console.warn("[EX V3] portal collection",col,err);return[type,null];}
      }));
      const rows=[];
      snaps.forEach(([type,snap])=>snap?.forEach(d=>rows.push({id:d.id,type,...d.data()})));
      rows.sort((a,b)=>{
        const at=x=>x?.toMillis?.()||x?.toDate?.()?.getTime?.()||0;
        return at(b.UpdatedAt||b.CreatedAt)-at(a.UpdatedAt||a.CreatedAt);
      });
      box.innerHTML="";
      if(!rows.length){box.textContent=tr("لا توجد سجلات مرتبطة بهذا الحساب بعد.","No records are linked to this account yet.");return;}
      rows.forEach(r=>box.appendChild(recordCard(r)));
    }catch(err){console.error(err);box.textContent=tr("تعذر تحميل السجلات.","Could not load records.");}
  }

  function injectLookup() {
    const out=$("#portalSignedOut"); if(!out||$("#exv3Lookup"))return;
    const wrap=document.createElement("div");wrap.id="exv3Lookup";wrap.className="exv3-lookup";
    wrap.innerHTML=`<p style="font-size:.75rem;color:#aaa">${tr("لديك رقم متابعة؟ يمكنك رؤية الحالة الأساسية من أي جهاز.","Have a tracking reference? Check the basic status from any device.")}</p>
      <div class="exv3-lookup-row"><input class="exv3-input" id="exv3LookupRef" placeholder="${tr("رقم المتابعة","Reference")}"><input class="exv3-input" id="exv3LookupEmail" type="email" placeholder="${tr("البريد المستخدم في الطلب","Request email")}"><button class="exv3-btn" id="exv3LookupBtn" type="button">${tr("تتبع","Track")}</button></div><div class="exv3-status" id="exv3LookupStatus"></div><div id="exv3LookupResult"></div>`;
    out.appendChild(wrap);
    $("#exv3LookupBtn").addEventListener("click",lookupRequest);
  }

  async function lookupRequest(){
    const ref=clean($("#exv3LookupRef").value,80).toUpperCase(),email=clean($("#exv3LookupEmail").value,160).toLowerCase();
    const s=$("#exv3LookupStatus"),box=$("#exv3LookupResult");
    if(!ref||!email){status(s,tr("أدخل الرقم المرجعي والبريد.","Enter the reference and email."),"err");return;}
    status(s,tr("جارٍ التحقق...","Checking..."));box.innerHTML="";
    try{
      await identity();
      const r=await call.lookup({reference:ref,email});
      if(!r.data?.found){status(s,tr("لم يتم العثور على سجل مطابق.","No matching record was found."),"err");return;}
      status(s,"","ok");
      const d=r.data.record;
      const card=document.createElement("article");card.className="exv3-record";
      card.innerHTML=`<div class="exv3-record-head"><div><h3>${clean(d.title||d.type,120)}</h3><p class="exv3-reference">${clean(d.reference,80)}</p></div><span class="exv3-chip">${clean(d.status,50)}</span></div>${d.stage?`<p>${tr("المرحلة:","Stage:")} ${clean(d.stage,100)}</p>`:""}${d.nextAction?`<p>${tr("الخطوة التالية:","Next action:")} ${clean(d.nextAction,300)}</p>`:""}<div class="exv3-timeline">${(d.timeline||[]).map(x=>`<div class="exv3-timeline-item"><b>${clean(ar()?(x.titleAr||x.title):(x.titleEn||x.title),120)}</b><span>${clean(ar()?(x.noteAr||x.note):(x.noteEn||x.note),280)}</span></div>`).join("")}</div>`;
      box.appendChild(card);
    }catch(err){console.error(err);status(s,tr("تعذر التحقق حالياً.","Tracking is temporarily unavailable."),"err");}
  }

  async function googleSignIn(){
    const s=$("#portalStatus");
    try{
      const provider=new firebase.auth.GoogleAuthProvider();
      let result;
      if(auth.currentUser?.isAnonymous) result=await auth.currentUser.linkWithPopup(provider);
      else result=await auth.signInWithPopup(provider);
      const u=result.user;
      await db.collection(C.collections.users).doc(u.uid).set({
        Name:u.displayName||"",Email:u.email||"",Phone:"",OwnerUid:u.uid,
        AuthProvider:"google",Timestamp:ts(),UpdatedAt:ts()
      },{merge:true});
      await renderPortal(u);
      if(s){s.textContent="";s.className="status";}
    }catch(err){console.error(err);if(s){s.textContent=tr("تعذر تسجيل الدخول. تأكد من تفعيل Google Auth وإضافة نطاق GitHub Pages.","Sign-in failed. Enable Google Auth and authorise the GitHub Pages domain.");s.className="status error";}}
  }

  async function visitCounter(){
    if(sessionStorage.getItem("exv3_visit_ui_done"))return;
    try{
      await identity();
      const r=await call.visit({path:location.pathname});
      const count=Number(r.data?.count||0);
      sessionStorage.setItem("exv3_visit_ui_done","1");
      let badge=$("#exv3VisitBadge");
      if(!badge){
        badge=document.createElement("span");badge.id="exv3VisitBadge";badge.className="exv3-visit-badge";
        ($("footer")||document.body).appendChild(badge);
      }
      badge.innerHTML=`<i></i><span>EX VISITS · ${count.toLocaleString(ar()?"ar-SA":"en-US")}</span>`;
    }catch(err){console.info("[EX V3] visitor metric unavailable");}
  }

  function intercept(){
    document.addEventListener("submit",e=>{
      if(e.target?.id==="vrForm"){e.preventDefault();e.stopImmediatePropagation();takeOverCreativeIntake(e);}
      else if(e.target?.id==="earlyForm"){e.preventDefault();e.stopImmediatePropagation();takeOverEarlyAccess(e);}
      else if(e.target?.id==="assistantForm"){e.preventDefault();e.stopImmediatePropagation();takeOverAssistant(e);}
      else if(e.target?.id==="exv3ConsultForm"){e.preventDefault();e.stopImmediatePropagation();submitConsultation(e.target);}
    },true);

    document.addEventListener("click",e=>{
      const sign=e.target.closest?.("#portalGoogleSignIn");
      const out=e.target.closest?.("#portalSignOut");
      if(sign){e.preventDefault();e.stopImmediatePropagation();googleSignIn();}
      if(out){e.preventDefault();e.stopImmediatePropagation();auth.signOut().then(()=>renderPortal(null));}
    },true);
  }

  function seedAssistantNote(){
    const box=$(".assistant-disclaimer");
    if(box && !$(".exv3-assistant-note",box)){
      const n=document.createElement("div");n.className="exv3-assistant-note";
      n.textContent=tr("EX Oracle يعمل عبر طبقة خادم آمنة؛ لا تُخزن مفاتيح الذكاء الاصطناعي داخل المتصفح.","EX Oracle runs through a protected server layer; AI keys are never stored in the browser.");
      box.appendChild(n);
    }
  }

  intercept();
  injectServices();
  injectConsultation();
  injectLookup();
  seedAssistantNote();

  auth.onAuthStateChanged(user=>renderPortal(user));
  visitCounter();

  console.info("[EX V3] Integration active", C.version);
})();
