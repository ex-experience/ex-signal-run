# EX™ SIGNAL RUN — MVP / PRODUCTION RC1

هذه الحزمة ترقية عملية للنسخة الحالية من الديمو إلى **MVP قابل للاختبار التجاري** مع إبقاء ملفات الصور الحالية داخل `assets/` كما هي.

## ما الذي تغير؟

- Gameplay جديد يركز على **HUMMER CHASE** بدل ديمو قصير ثابت.
- 3 مسارات + قفز + Boost + Pulse Shot.
- Procedural obstacles / drones / checkpoints / BLACK NODE.
- Combo + Near Miss + Heat + Boost + Credits + XP + Best Score.
- Daily Contract.
- حفظ التقدم محليًا.
- PWA / Service Worker.
- طبقة Monetization مستقلة: `ads-engine.js`.
- إعلانات **Native داخل عالم اللعبة** عند الـCheckpoints.
- Mission Partner في القائمة والـBrief والنتيجة.
- Rewarded Ad اختياري بعد الجولة.
- Frequency cap داخل الجلسة.
- Event log محلي + Endpoint اختياري للقياس.
- لا توجد إعلانات Forced أثناء اللعب.

## التثبيت على المستودع الحالي

ارفع/استبدل ملفات الجذر التالية فقط:

- `index.html`
- `style.css`
- `game.js`
- `ads-engine.js`
- `campaigns.json`
- `manifest.webmanifest`
- `service-worker.js`

ولا تحذف مجلد `assets/` الحالي؛ النسخة تعتمد على:
- `assets/hero_cover.webp`
- `assets/hummer_ext.webp`

## تفعيل حملات حقيقية

عدّل `campaigns.json`.

كل حملة:
- `brand`
- `headline`
- `subline`
- `clickUrl`
- `placements`
- `startAt` / `endAt` اختياري
- `frequencyCapPerSession`
- `weight`
- `active`

الـplacements الحالية:
- `menu_partner`
- `brief_partner`
- `world_billboard`
- `result_partner`

### مهم
داخل الجولة، الإعلان المرئي **غير قابل للنقر** لتفادي تشتيت اللاعب. زر زيارة المعلن موجود فقط في الشاشات الآمنة: القائمة / النتيجة.

## Rewarded Ads

الوضع الافتراضي `house` لاختبار تجربة المستخدم.

للإنتاج:
1. إنشاء Ad Unit مناسب في Google Ad Manager.
2. تحميل Google Publisher Tag في الصفحة بعد إدارة الموافقة.
3. تغيير:
   - `rewarded.provider` إلى `google-gpt`
   - `rewarded.googleAdUnitPath` إلى مسار الـAd Unit الحقيقي.
4. لا تمنح المكافأة مقابل النقر؛ المكافأة مرتبطة بإكمال تجربة الإعلان فقط.

## قبل Production الحقيقي

هذه RC1 هي **MVP تجاري قابل للاختبار** وليست النهاية التقنية. للنسخة PRO التالية:
- نقل الرسم إلى Three.js WebGPU/WebGL2.
- Firebase Auth اختياري.
- Firestore: campaigns / placements / sessions / verified_exposures / leaderboards.
- Cloud Functions للـanti-fraud والتجميع.
- Firebase App Check بعد تسجيل نطاق GitHub Pages.
- لوحة Advertiser / Campaign Manager.
- Consent + Privacy.
- Playwright mobile QA.
- GitHub Actions.
