"use strict";

const { setGlobalOptions } = require("firebase-functions/v2/options");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 20
});

const APPS_SCRIPT_URL = defineSecret("APPS_SCRIPT_URL");
const APPS_SCRIPT_TOKEN = defineSecret("APPS_SCRIPT_TOKEN");

const SECRETS = [APPS_SCRIPT_URL, APPS_SCRIPT_TOKEN];

// IMPORTANT: staged migration. Keep false until the GitHub Pages domain is
// registered in App Check and metrics confirm legitimate traffic is valid.
// Then change this to true and redeploy callable functions.
const ENFORCE_APP_CHECK = false;

function clean(v, max=1800) {
  return String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}
function email(v) { return clean(v,254).toLowerCase(); }
function reference(prefix="EX") {
  const d = new Date();
  const day = d.toISOString().slice(0,10).replace(/-/g,"");
  return `${prefix}-${day}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}
function publicDate(v) {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function rateLimitServer(key, max, windowMs) {
  const id = crypto.createHash("sha256").update(String(key)).digest("hex");
  const ref = db.collection("UsageLimits").doc(id);
  const now = Date.now();

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const start = data.windowStart?.toMillis?.() || 0;
    const within = start && now - start < windowMs;
    const count = within ? Number(data.count || 0) : 0;

    if (count >= max) return false;

    tx.set(ref, {
      count: count + 1,
      windowStart: within ? data.windowStart : Timestamp.fromMillis(now),
      updatedAt: FieldValue.serverTimestamp()
    }, {merge:true});
    return true;
  });
}

async function callAppsScript(action, payload={}) {
  const url = APPS_SCRIPT_URL.value();
  const token = APPS_SCRIPT_TOKEN.value();
  if (!url || !token) throw new Error("Apps Script secrets are not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        Action: action,
        Token: token,
        ...payload
      }),
      signal: controller.signal
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Apps Script returned non-JSON (${res.status}).`); }
    if (!res.ok || data.error) throw new Error(data.error || `Apps Script HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

exports.exOracle = onCall({
  secrets: SECRETS,
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 35,
  memory: "256MiB"
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated","Authentication required.");

  const message = clean(request.data?.message, 1000);
  const language = request.data?.language === "en" ? "en" : "ar";
  const rawHistory = Array.isArray(request.data?.history) ? request.data.history.slice(-8) : [];
  const history = rawHistory.map(x => ({
    role: x?.role === "assistant" ? "assistant" : "user",
    text: clean(x?.text, 1200)
  }));

  if (!message) throw new HttpsError("invalid-argument","Message is required.");

  const allowed = await rateLimitServer(`oracle|${request.auth.uid}`, 40, 60 * 60 * 1000);
  if (!allowed) throw new HttpsError("resource-exhausted","Assistant rate limit reached. Try again later.");

  try {
    const result = await callAppsScript("oracle", {
      Message: message,
      Lang: language,
      History: history,
      UserUid: request.auth.uid,
      UserEmail: request.auth.token.email || ""
    });

    const reply = clean(result.reply, 2200);
    if (!reply) throw new Error("Empty assistant response.");

    await db.collection("MatrixLogs").add({
      Name: clean(request.auth.token.name || "EX Visitor",100),
      Email: clean(request.auth.token.email || "anonymous@ex.local",254),
      Type: "EX_ORACLE",
      Input: message,
      Output: reply,
      Timestamp: FieldValue.serverTimestamp(),
      OwnerUid: request.auth.uid
    });

    return {reply, engine: clean(result.engine || "AI",40)};
  } catch (err) {
    console.error("exOracle", err);
    throw new HttpsError("unavailable","EX Oracle is temporarily unavailable.");
  }
});

exports.exIncrementVisit = onCall({
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 15
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated","Authentication required.");

  const uid = request.auth.uid;
  const day = new Date().toISOString().slice(0,10);
  const sessionId = crypto.createHash("sha256").update(`${uid}|${day}`).digest("hex");
  const sessionRef = db.collection("VisitorSessions").doc(sessionId);
  const totalRef = db.collection("visitors").doc("total");

  const count = await db.runTransaction(async tx => {
    const [sessionSnap,totalSnap] = await Promise.all([tx.get(sessionRef),tx.get(totalRef)]);
    const current = totalSnap.exists ? Number(totalSnap.data().count || 0) : 0;
    if (sessionSnap.exists) return current;

    tx.set(sessionRef,{
      uidHash: crypto.createHash("sha256").update(uid).digest("hex"),
      day,
      path: clean(request.data?.path || "/dossier/",180),
      createdAt: FieldValue.serverTimestamp()
    });
    tx.set(totalRef,{count:current+1,lastUpdated:FieldValue.serverTimestamp()},{merge:true});
    return current+1;
  });

  return {count};
});

exports.exGetPublicStats = onCall({
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 10
}, async () => {
  const snap = await db.collection("visitors").doc("total").get();
  return {visitors: snap.exists ? Number(snap.data().count || 0) : 0};
});

const LOOKUP_COLLECTIONS = [
  ["INTAKE","CreativeIntakes"],
  ["CONSULTATION","Consultations"],
  ["EARLY_ACCESS","EarlyAccess"],
  ["PROJECT","ClientProjects"]
];

exports.exLookupRequest = onCall({
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 20
}, async (request) => {
  const ref = clean(request.data?.reference,80).toUpperCase();
  const mail = email(request.data?.email);
  if (ref.length < 8 || !mail.includes("@")) {
    throw new HttpsError("invalid-argument","Reference and email are required.");
  }

  const ip = clean(request.rawRequest?.ip || request.rawRequest?.headers?.["x-forwarded-for"] || "unknown",120);
  const allowed = await rateLimitServer(`lookup|${ip}|${mail}`, 20, 10 * 60 * 1000);
  if (!allowed) throw new HttpsError("resource-exhausted","Too many lookup attempts. Try again later.");

  let match = null;
  for (const [type,col] of LOOKUP_COLLECTIONS) {
    const snap = await db.collection(col).where("ReferenceCode","==",ref).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0], data = doc.data();
      if (email(data.Email) === mail) match = {type,col,doc,data};
      break;
    }
  }

  // Always use a generic negative response to avoid revealing whether a reference exists.
  if (!match) return {found:false};

  const timelineSnap = await match.doc.ref.collection("Timeline").orderBy("At","asc").limit(20).get();
  const timeline = timelineSnap.docs.map(d => {
    const x=d.data();
    return {
      title: clean(x.Title || x.Status || "",120),
      titleAr: clean(x.TitleAr || "",120),
      titleEn: clean(x.TitleEn || "",120),
      note: clean(x.Note || "",280),
      noteAr: clean(x.NoteAr || "",280),
      noteEn: clean(x.NoteEn || "",280),
      at: publicDate(x.At)
    };
  });

  const d = match.data;
  return {
    found:true,
    record:{
      type:match.type,
      reference:clean(d.ReferenceCode,80),
      title:clean(d.ProjectName || d.Company || d.Name || d.Service || match.type,120),
      status:clean(d.Status || "Received",50),
      stage:clean(d.Stage || "",100),
      nextAction:clean(d.NextAction || "",300),
      createdAt:publicDate(d.CreatedAt || d.Timestamp),
      updatedAt:publicDate(d.UpdatedAt),
      timeline
    }
  };
});

async function timelineReceived(docRef, titleAr, titleEn, noteAr, noteEn) {
  const existing = await docRef.collection("Timeline").where("Kind","==","received").limit(1).get();
  if (!existing.empty) return;
  await docRef.collection("Timeline").add({
    Kind:"received",
    TitleAr:titleAr, TitleEn:titleEn,
    NoteAr:noteAr, NoteEn:noteEn,
    At:FieldValue.serverTimestamp(),
    Actor:"system"
  });
}

async function enrichAndNotify(event, config) {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const code = clean(data.ReferenceCode,80) || reference(config.prefix);

  const patch = {};
  if (!data.ReferenceCode) patch.ReferenceCode = code;
  if (!data.Status) patch.Status = "Received";
  if (!data.Stage) patch.Stage = config.stage;
  patch.UpdatedAt = FieldValue.serverTimestamp();
  await snap.ref.set(patch,{merge:true});

  await timelineReceived(
    snap.ref,
    config.titleAr, config.titleEn,
    `${config.noteAr} ${code}`, `${config.noteEn} ${code}`
  );

  try {
    await callAppsScript(config.action,{
      ReferenceCode:code,
      Name:clean(data.Name,100),
      Email:clean(data.Email,254),
      Phone:clean(data.Phone,32),
      Company:clean(data.Company,120),
      Service:clean(data.Service || data.Sector || data.Interest,120),
      Summary:clean(data.Goal || data.Message || data.Interest,1200),
      DocumentId:snap.id,
      Collection:snap.ref.parent.id
    });
  } catch (err) {
    // Never roll back a valid customer submission because notification failed.
    console.error(`${config.action} notification failed`,err);
  }
}

exports.onCreativeIntakeCreatedV3 = onDocumentCreated({
  document:"CreativeIntakes/{id}",
  secrets:SECRETS,
  region:"us-central1"
}, event => enrichAndNotify(event,{
  prefix:"EXI",stage:"Intake",action:"notify_intake",
  titleAr:"تم استلام الملف الإبداعي",titleEn:"Creative intake received",
  noteAr:"بدأت مرحلة المراجعة. المرجع:",noteEn:"Review has started. Reference:"
}));

exports.onConsultationCreatedV3 = onDocumentCreated({
  document:"Consultations/{id}",
  secrets:SECRETS,
  region:"us-central1"
}, event => enrichAndNotify(event,{
  prefix:"EXC",stage:"Intake",action:"notify_consultation",
  titleAr:"تم استلام طلب الاستشارة",titleEn:"Consultation received",
  noteAr:"تم فتح سجل الاستشارة. المرجع:",noteEn:"The consultation record is open. Reference:"
}));

exports.onEarlyAccessCreatedV3 = onDocumentCreated({
  document:"EarlyAccess/{id}",
  secrets:SECRETS,
  region:"us-central1"
}, event => enrichAndNotify(event,{
  prefix:"EXA",stage:"Registered",action:"notify_early_access",
  titleAr:"تم تسجيل طلب الوصول المبكر",titleEn:"Early access request received",
  noteAr:"تم تسجيل الطلب. المرجع:",noteEn:"The request was registered. Reference:"
}));
