# EX™ Dossier V3 — تفعيل Firebase + Google Apps Script + GitHub Pages

هذه الحزمة صممت **لعدم تعطيل الموقع الرسمي**. السكربت لا ينشر شيئاً تلقائياً ولا يغيّر الصفحة قبل إنشاء نسخة احتياطية.

## لماذا هذه الترقية مطلوبة؟

الفحص الحالي أظهر أن ملفات `dossier/integrations/` الثلاثة مبدلة المحتوى:
- `agency-config.js` يحتوي إعداد Firebase CLI JSON بدلاً من JavaScript.
- `agency-integration.css` يحتوي JavaScript وإعدادات Firebase/Apps Script بدلاً من CSS.
- `agency-integration.js` يحتوي Firestore Rules بدلاً من JavaScript.

كما أن الصفحة الحالية تكتب إلى `CreativeIntakes`, `EarlyAccess`, `SiteEvents`, `OracleLogs` وتقرأ `ClientProjects` بينما قواعد V3 الحالية لا تسمح بهذه المجموعات؛ لذلك تفشل أجزاء من الوظائف حتى لو بقي الشكل المرئي يعمل.

## ما الذي يفعله V3؟

- يحافظ على `dossier/index.html` ولا يعيد بناءه.
- يصلح Integration Layer فقط.
- يفعّل رفع مراجع الأعمال إلى Firebase Storage.
- يفعّل Creative Intake مع رقم متابعة.
- يضيف Business Consultation مع مرفقات ورقم متابعة.
- يفعّل Early Access مع رقم متابعة.
- يضيف Client Portal يعرض:
  - المشاريع.
  - Creative Intakes.
  - الاستشارات.
  - الوصول المبكر.
  - Timeline / سجل المتابعة.
- يضيف تتبع Reference + Email من أي جهاز (بيانات حالة محدودة فقط).
- يفعّل عداد زيارات server-side.
- يربط EX Oracle عبر Firebase Callable Function ثم Google Apps Script.
- يرسل إشعارات بريد عند وصول طلب جديد.
- يضيف لوحة إدارة `dossier/admin-requests.html`.
- يضيف Public Services من Firestore مع fallback داخل الموقع.
- يبقي GitHub Pages للواجهة فقط؛ لا يتم تحويل Hosting إلى Firebase.

## 0. مهم جداً قبل أي نشر

القيمة القديمة `EX_SHIELD_99X` ظهرت داخل كود/إعداد عام، لذلك اعتبرها **مكشوفة**.

أنشئ Token جديداً عشوائياً ولا تضعه في GitHub.

مثال من Terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 1. تشغيل السكربت داخل VS Code

من جذر المستودع:

```bash
git pull
git switch -c ex-integration-v3

node EX_DOSSIER_CONNECT_V3.mjs --verify
node EX_DOSSIER_CONNECT_V3.mjs --apply
node EX_DOSSIER_CONNECT_V3.mjs --verify
```

النسخ الاحتياطية تحفظ في:
```text
.ex-backups/YYYYMMDD-HHMMSS/
```

للتراجع:
```bash
node EX_DOSSIER_CONNECT_V3.mjs --rollback
```

## 2. Firebase Authentication

من Firebase Console:
- Authentication → Sign-in method
- فعّل **Anonymous**.
- فعّل **Google**.
- أضف نطاق GitHub Pages المصرح:
  `ex-experience.github.io`

الربط من Anonymous إلى Google يحافظ على UID نفسه، وبالتالي تبقى طلبات العميل مرتبطة بحسابه.

## 3. Google Apps Script

انسخ:
- `apps-script/Code.gs`
- `apps-script/appsscript.json`

إلى مشروع Apps Script.

في **Project Settings → Script Properties** أضف:

```text
SECURE_TOKEN=<NEW_RANDOM_TOKEN>
GEMINI_KEY=<YOUR_GEMINI_KEY>
GROQ_KEY=<YOUR_GROQ_KEY>              # اختياري
MY_EMAIL=<NOTIFICATION_EMAIL>
SHEET_ID=<OPTIONAL_SHEET_ID>
GEMINI_MODEL=gemini-3.6-flash
GROQ_MODEL=llama-3.1-8b-instant
```

لا تضف `EX_SHIELD_99X` كقيمة جديدة. إذا اضطررت لتوافق انتقالي قصير فقط، استخدم `LEGACY_SECURE_TOKEN` ثم احذفه بعد نجاح V3.

Deploy → New deployment → Web app.
انسخ رابط `/exec`.

## 4. Firebase Functions Secrets

من جذر المستودع:

```bash
npm install -g firebase-tools
firebase login
firebase use ex-experience-962ca

firebase functions:secrets:set APPS_SCRIPT_URL
# الصق رابط Apps Script /exec

firebase functions:secrets:set APPS_SCRIPT_TOKEN
# الصق SECURE_TOKEN الجديد نفسه
```

## 5. تثبيت Functions

```bash
cd functions
npm install
cd ..
```

## 6. نشر Backend فقط — لا Hosting

راجع أولاً:

```bash
firebase deploy --only firestore:rules,storage
firebase deploy --only functions
```

ملف `firebase.json` **لا يحتوي Hosting** عمداً. موقع GitHub Pages يبقى كما هو.

## 7. اختبر قبل دمج branch

اختبر:
1. فتح الموقع بدون أخطاء Console.
2. Creative Intake مع ملف.
3. ظهور رقم `EXI-...`.
4. استشارة جديدة مع مرفق.
5. ظهور رقم `EXC-...`.
6. Early Access ورقم `EXA-...`.
7. EX Oracle يجيب عبر Gemini أو Groq fallback.
8. Google Portal يعرض كل الطلبات.
9. Reference + Email يعرض الحالة من متصفح آخر.
10. `admin-requests.html` يعمل فقط بحساب الإدارة.
11. تغيير Status / Stage / NextAction يظهر للعميل.
12. Timeline يظهر.
13. عداد الزيارات يظهر في Footer.
14. وصول بريد عند إنشاء الطلب.

## 8. App Check — بدون تعطيل الموقع

في أول نشر اترك:
```js
appCheckSiteKey: ""
```
و`ENFORCE_APP_CHECK = false`.

بعد نجاح الإنتاج:
1. أنشئ reCAPTCHA Enterprise Website key.
2. أضف `ex-experience.github.io`.
3. سجل Web App في Firebase App Check.
4. ضع **Site Key العامة** في `agency-config.js`.
5. انشر الواجهة.
6. راقب App Check metrics.
7. بعدها فقط غيّر `ENFORCE_APP_CHECK = true` في `functions/index.js`.
8. انشر Functions ثم فعّل Enforcement للمنتجات تدريجياً.

هذا يمنع قطع الطلبات الحقيقية أثناء الانتقال.

## 9. GitHub

بعد الاختبار المحلي:

```bash
git status
git add dossier firestore.rules storage.rules firebase.json .firebaserc functions apps-script EX_DOSSIER_CONNECT_V3.mjs .github/workflows/ex-integration-check.yml
git commit -m "Activate EX dossier integrations v3"
git push -u origin ex-integration-v3
```

افتح Pull Request، راجع التغييرات، ثم Merge إلى `main`.
GitHub Pages لن يتغير قبل الـMerge.

## 10. حماية المفاتيح

مسموح في GitHub:
- Firebase Web config.
- App Check Site Key.

ممنوع:
- Gemini key.
- Groq key.
- Apps Script secure token.
- Service-account JSON.
- Firebase Admin credentials.

## 11. تحديث العميل داخل لوحة الإدارة

افتح:
`/dossier/admin-requests.html`

الحساب المسموح حسب القواعد:
`hussambinhassan92@gmail.com`

يمكنك:
- اختيار نوع الطلب.
- تعديل Status.
- تعديل Stage.
- تعديل Next Action.
- إضافة حدث Timeline.
- تهيئة قائمة الخدمات العامة.
- مشاهدة عدد الزيارات.

## 12. حالات مقترحة

Status:
`Received → In Review → Qualified → Discovery → Proposal → Active → Waiting Client → Completed → Closed`

Stage:
`Intake / Review / Discovery / Proposal / Production / Delivery / Follow-up`

## 13. لا تستخدم query-string للمفاتيح

V3 يجعل المتصفح يتصل بـFirebase Callable Function، ثم Function تتصل بـApps Script. بهذه الطريقة لا يظهر Token في GitHub أو Network request من المتصفح إلى Apps Script مباشرة.
