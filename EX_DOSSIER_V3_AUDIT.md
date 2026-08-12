# EX™ Dossier V3 — Technical Audit

## نتيجة الفحص

تمت مقارنة الكود المرفق مع الملفات الحالية في مستودع GitHub.

### 1) طبقة integrations مبدلة المحتوى
- `dossier/integrations/agency-config.js` ليست JavaScript config في الحالة المفحوصة؛ محتواها Firebase CLI JSON.
- `dossier/integrations/agency-integration.css` تحتوي JavaScript configuration بدلاً من CSS، وتتضمن compatibility token قديم.
- `dossier/integrations/agency-integration.js` تحتوي Firestore Rules بدلاً من JavaScript.

هذا يعني أن `index.html` يستدعي ملفاً بامتداد `.js` لكنه ليس JavaScript صالحاً.

### 2) عدم تطابق الواجهة مع Firestore Rules V3
الواجهة الحالية تستخدم:
- `CreativeIntakes`
- `EarlyAccess`
- `SiteEvents`
- `OracleLogs`
- `ClientProjects`

بينما Rules V3 الحالية تنتهي بـ default deny لأي Collection غير معرفة، لذلك هذه العمليات لا تملك عقد صلاحيات متوافقاً.

### 3) EX Oracle
الواجهة الحالية تعرف `AI_PROXY_URL = ""`، لذلك المساعد يعمل بالرد المحلي في النسخة الحالية ما لم تتولى طبقة V3 الجديدة الحدث.

V3 يغير المسار إلى:
Browser → Firebase Callable Function → Google Apps Script → Gemini → Groq fallback.

### 4) Request tracking
V3 يضيف:
- ReferenceCode
- Status
- Stage
- NextAction
- Timeline subcollection
- Reference + Email lookup
- Google Client Portal
- Admin control page

### 5) No-downtime strategy
- GitHub Pages يبقى مستضيف الواجهة.
- لا يوجد Firebase Hosting في `firebase.json`.
- لا يتم النشر أو push تلقائياً.
- كل تغيير محلي له Backup + Rollback.
- App Check يتم تفعيله على مرحلتين لتجنب قطع المستخدمين الحاليين.

## القرار الأمني الأهم
القيمة القديمة `EX_SHIELD_99X` يجب اعتبارها مكشوفة لأنها ظهرت في إعداد عميل عام. يجب تدويرها قبل تشغيل Apps Script V3.
