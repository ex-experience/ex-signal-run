/**
 * EX™ Backend Bridge V3 — Google Apps Script
 *
 * Script Properties required:
 * SECURE_TOKEN     = new rotated random token (DO NOT use EX_SHIELD_99X)
 * GEMINI_KEY       = Google AI API key
 * GROQ_KEY         = Groq key (optional fallback)
 * MY_EMAIL         = notification destination
 * SHEET_ID         = optional audit sheet
 * GEMINI_MODEL     = optional; default gemini-3.6-flash
 * GROQ_MODEL       = optional; default llama-3.1-8b-instant
 *
 * Optional temporary backward compatibility:
 * LEGACY_SECURE_TOKEN = previous token. Remove after migration.
 */

function props_() {
  return PropertiesService.getScriptProperties();
}

function json_(obj, status) {
  var out = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return out;
}

function clean_(v, max) {
  var s = String(v == null ? "" : v).replace(/[<>]/g, "").trim();
  return s.substring(0, max || 4000);
}

function readBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try { return JSON.parse(e.postData.contents); }
  catch (_) { return {}; }
}

function authorised_(token) {
  var p = props_();
  var current = p.getProperty("SECURE_TOKEN") || "";
  var legacy = p.getProperty("LEGACY_SECURE_TOKEN") || "";
  return !!token && (token === current || (!!legacy && token === legacy));
}

function doGet(e) {
  try {
    // Harmless health endpoint.
    if (!e || !e.parameter || !e.parameter.Token) {
      return json_({status:"ok", service:"EX Backend Bridge V3"});
    }

    // Backward-compatible legacy GET Oracle during migration only.
    if (!authorised_(e.parameter.Token)) return json_({error:"ACCESS DENIED"});
    var msg = clean_(e.parameter.Message || "مرحبا", 1000);
    var lang = e.parameter.Lang === "en" ? "en" : "ar";
    var history = clean_(e.parameter.History || "", 5000);
    var result = oracle_(msg, lang, history);
    return json_(result);
  } catch (err) {
    return json_({error: clean_(err.message, 600)});
  }
}

function doPost(e) {
  try {
    var body = readBody_(e);
    var token = body.Token || (e && e.parameter && e.parameter.Token) || "";
    if (!authorised_(token)) return json_({error:"ACCESS DENIED"});

    var action = clean_(body.Action || body.action || "health", 80);
    if (action === "oracle") {
      return json_(oracle_(
        clean_(body.Message,1000),
        body.Lang === "en" ? "en" : "ar",
        body.History || []
      ));
    }

    if (action === "notify_intake" ||
        action === "notify_consultation" ||
        action === "notify_early_access") {
      notify_(action, body);
      return json_({status:"Success"});
    }

    if (action === "health") return json_({status:"ok"});
    return json_({error:"UNKNOWN ACTION"});
  } catch (err) {
    return json_({error:clean_(err.message,600)});
  }
}

function oracle_(message, lang, history) {
  var p = props_();
  var geminiKey = p.getProperty("GEMINI_KEY") || "";
  var groqKey = p.getProperty("GROQ_KEY") || "";
  var geminiModel = p.getProperty("GEMINI_MODEL") || "gemini-3.6-flash";
  var groqModel = p.getProperty("GROQ_MODEL") || "llama-3.1-8b-instant";

  var prompt = systemPrompt_(lang);
  var transcript = historyText_(history, lang);
  var fullInput = transcript
    ? transcript + "\n\n" + (lang === "ar" ? "رسالة العميل الحالية:\n" : "Current client message:\n") + message
    : message;

  var response = "", engine = "";
  try {
    if (!geminiKey) throw new Error("GEMINI_KEY missing");
    response = callGemini_(fullInput, prompt, geminiKey, geminiModel);
    engine = "GEMINI";
  } catch (gErr) {
    if (!groqKey) throw gErr;
    response = callGroq_(fullInput, prompt, groqKey, groqModel);
    engine = "GROQ";
  }

  logSheet_("oracle", {
    Message: message,
    Reply: response,
    Engine: engine,
    Language: lang
  });
  return {reply:clean_(response,2200),engine:engine};
}

function systemPrompt_(lang) {
  if (lang === "ar") {
    return [
      "أنت EX Oracle، المساعد الرقمي الرسمي وواجهة الضيافة الذكية لدار المفاهيم フサム | experience™.",
      "اكتب كخبير ضيافة إبداعية رفيع المستوى: طبيعي، دافئ، مباشر، غير إعلاني.",
      "لا تدّعِ أنك إنسان. لا تناقش طبيعتك التقنية إلا إذا سأل المستخدم مباشرة.",
      "الرد من سطر إلى ثلاثة أسطر قصيرة فقط.",
      "لا تسرد قائمة الخدمات تلقائياً. افهم النية أولاً واسأل سؤالاً واحداً فقط عند الحاجة.",
      "للإلهام والانتماء والمجتمع: وجّه بلطف إلى JOIN OUR SOCIETY / EX PRIVATE CIRCLE.",
      "للعمل، الاستشارة، الهوية، الإنتاج، الحملة أو مشروع تجاري: وجّه إلى EXECUTIVE PORTAL أو CREATIVE DIRECTION LAB.",
      "إذا أعطاك سجل محادثة، استخدمه لتجنب التكرار والحفاظ على السياق.",
      "لا تعد بنتائج أو أسعار أو مواعيد غير مؤكدة."
    ].join("\n");
  }
  return [
    "You are EX Oracle, the official digital concierge for フサム | experience™.",
    "Write like an elite creative concierge: natural, warm, direct and never salesy.",
    "Do not claim to be human. Only discuss your technical nature if directly asked.",
    "Keep every reply to 1–3 short lines.",
    "Never dump a service list. Infer intent first and ask at most one elegant question when needed.",
    "For inspiration/community, guide naturally to JOIN OUR SOCIETY / EX PRIVATE CIRCLE.",
    "For business, consulting, identity, campaigns, film or production, guide to EXECUTIVE PORTAL or CREATIVE DIRECTION LAB.",
    "Use conversation history to preserve context and avoid repetition.",
    "Do not promise unconfirmed outcomes, pricing or timing."
  ].join("\n");
}

function historyText_(history, lang) {
  if (!history) return "";
  if (typeof history === "string") return clean_(history,5000);
  if (!Array.isArray(history)) return "";
  var lines = history.slice(-8).map(function(x) {
    var role = x && x.role === "assistant" ? "EX Oracle" : (lang === "ar" ? "العميل" : "Client");
    return role + ": " + clean_(x && x.text,1200);
  });
  return (lang === "ar" ? "سجل المحادثة السابقة:\n" : "Previous conversation:\n") + lines.join("\n");
}

function callGemini_(msg, prompt, key, model) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

  var payload = {
    system_instruction: {parts:[{text:prompt}]},
    contents: [{role:"user",parts:[{text:msg}]}]
  };

  var res = UrlFetchApp.fetch(url, {
    method:"post",
    contentType:"application/json",
    payload:JSON.stringify(payload),
    muteHttpExceptions:true
  });

  var code = res.getResponseCode();
  var raw = res.getContentText();
  var obj = JSON.parse(raw);
  if (code < 200 || code >= 300 || obj.error) {
    throw new Error((obj.error && obj.error.message) || ("Gemini HTTP " + code));
  }
  if (!obj.candidates || !obj.candidates[0] ||
      !obj.candidates[0].content || !obj.candidates[0].content.parts) {
    throw new Error("Gemini returned no content");
  }
  return obj.candidates[0].content.parts.map(function(p){return p.text || "";}).join("").trim();
}

function callGroq_(msg, prompt, key, model) {
  var url = "https://api.groq.com/openai/v1/chat/completions";
  var payload = {
    model:model,
    messages:[
      {role:"system",content:prompt},
      {role:"user",content:msg}
    ]
  };
  var res = UrlFetchApp.fetch(url,{
    method:"post",
    headers:{Authorization:"Bearer " + key},
    contentType:"application/json",
    payload:JSON.stringify(payload),
    muteHttpExceptions:true
  });
  var code=res.getResponseCode(), obj=JSON.parse(res.getContentText());
  if (code < 200 || code >= 300 || obj.error) {
    throw new Error((obj.error && obj.error.message) || ("Groq HTTP " + code));
  }
  return clean_(obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content,2200);
}

function notify_(action, body) {
  var to = props_().getProperty("MY_EMAIL") || "";
  if (!to) throw new Error("MY_EMAIL missing");

  var labels = {
    notify_intake:"NEW CREATIVE INTAKE",
    notify_consultation:"NEW CONSULTATION",
    notify_early_access:"NEW EARLY ACCESS"
  };
  var subject = "[EX™] " + (labels[action] || "NEW REQUEST") + " · " + clean_(body.ReferenceCode,80);
  var lines = [
    "Reference: " + clean_(body.ReferenceCode,80),
    "Name: " + clean_(body.Name,100),
    "Company: " + clean_(body.Company,120),
    "Email: " + clean_(body.Email,254),
    "Phone: " + clean_(body.Phone,32),
    "Service: " + clean_(body.Service,120),
    "",
    "Summary:",
    clean_(body.Summary,1200),
    "",
    "Firestore: " + clean_(body.Collection,80) + " / " + clean_(body.DocumentId,120)
  ];
  MailApp.sendEmail({to:to,subject:subject,body:lines.join("\n"),name:"EX™ Operations"});
  logSheet_(action, body);
}

function logSheet_(kind, data) {
  var id = props_().getProperty("SHEET_ID") || "";
  if (!id) return;
  try {
    var ss = SpreadsheetApp.openById(id);
    var sheet = ss.getSheetByName("EX Logs") || ss.insertSheet("EX Logs");
    if (sheet.getLastRow() === 0) sheet.appendRow(["Timestamp","Type","Reference","Name","Email","Engine","Message","Reply"]);
    sheet.appendRow([
      new Date(), kind,
      clean_(data.ReferenceCode,80), clean_(data.Name,100), clean_(data.Email,254),
      clean_(data.Engine,40), clean_(data.Message,1000), clean_(data.Reply,2200)
    ]);
  } catch (err) {
    console.error("Sheet log failed: " + err.message);
  }
}
