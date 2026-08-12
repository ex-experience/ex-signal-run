# EX™ // SIGNAL RUN — Browser Game Demo

ديمو لعبة أكشن يعمل مباشرة داخل المتصفح وبدون مكتبات خارجية.

## التشغيل

1. افتح `index.html` في Chrome / Safari / Edge / Firefox.
2. اضغط **ابدأ المهمة**.
3. الصوت يبدأ بعد أول ضغطة بسبب سياسات المتصفحات الحديثة.

## التحكم

- `A / D` أو الأسهم: حركة
- `SPACE`: قفز
- `J` أو `F`: إطلاق
- `SHIFT`: Dash
- `P`: إيقاف مؤقت
- على الجوال تظهر أزرار لمس تلقائياً.

## المراحل

1. **THE SIGNAL BREACH** — منصة أكشن داخل استوديو تناظري، جمع 6 Signal Shards.
2. **HUMMER // HARD ESCAPE** — مطاردة سريعة وتفادي حواجز وإسقاط Drones.
3. **BLACK NODE** — Boss Fight بثلاث طبقات درع ثم تدمير النواة.

## النشر على الإنترنت

المجلد Static بالكامل. ارفعه كما هو إلى GitHub Pages أو Netlify أو Vercel أو أي استضافة ملفات ثابتة. لا يحتاج Backend في نسخة الديمو.

## هيكل الملفات

- `index.html` الواجهة
- `style.css` الهوية والتجاوب
- `game.js` محرك اللعبة والفيزياء والمراحل والصوت
- `assets/` صور البطل والمشاهد المرجعية

## الخطوة التالية للإنتاج

يمكن ترقية هذا الديمو إلى WebGL/Three.js أو Phaser مع: حسابات لاعبين، Leaderboard، Multiplayer، Skins، Inventory، Missions، Firebase/Supabase، PWA، وحفظ التقدم.
