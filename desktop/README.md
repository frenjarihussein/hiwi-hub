# نسخة سطح المكتب (Windows) — Yousef Soft

## كيف تعمل
عند فتح البرنامج يشغّل في الخلفية "خادماً محلياً" (`yousef-server`) يحتوي:
1. PostgreSQL محمول — البيانات في `%APPDATA%/com.yousefsoft.desktop`.
2. PostgREST (واجهة الجداول) + GoTrue (تسجيل الدخول) — لأن البرنامج يعتمد على تسجيل الدخول وسياسات الأمان.
3. خادم التطبيق نفسه (ناتج `vite build`) على `127.0.0.1:3000`.

عند أول تشغيل يُطبَّق ملف المخطط `hiwi-hub-schema-v2.sql` على القاعدة الفارغة.
عند إغلاق النافذة يتوقف كل شيء.

## خطوات البناء (على جهاز Windows)
1. ثبّت: Rust (rustup)، Bun، و `cargo install tauri-cli --version ^2`.
2. جهّز مجلد `desktop/src-tauri/binaries/stack/` يحتوي:
   - `pgsql/` (PostgreSQL 15 المحمول لويندوز: zip من EnterpriseDB)
   - `postgrest.exe` و `gotrue.exe` (من صفحات إصدارات GitHub)
   - `hiwi-hub-schema-v2.sql`
   - `app-cmd.json` يحدد أمر تشغيل خادم الواجهات، مثال: `{"cmd":"node","args":["app/server.js"]}`
3. ابنِ الواجهات بعنوان محلي: `VITE_SUPABASE_URL=http://127.0.0.1:54321 bun run build`
4. ابنِ المشغّل:
   `bun build --compile --target=bun-windows-x64 desktop/server/yousef-server.ts --outfile desktop/src-tauri/binaries/yousef-server-x86_64-pc-windows-msvc.exe`
5. مفتاح الواجهة العام يُنشأ عند أول تشغيل في `anon.key` داخل مجلد البيانات؛ ضعه في `VITE_SUPABASE_PUBLISHABLE_KEY` وأعد بناء الواجهات.
6. من `desktop/src-tauri`: `cargo tauri build` ← ملف التثبيت.

## المنافذ المحلية
54321 بوابة (rest/auth) · 54322 Postgres · 3000 البرنامج.

## حدود هذه النسخة
- ربط Sungrow/SMA وتلغرام والذكاء الاصطناعي يحتاج إنترنت.
- البيانات على جهاز واحد فقط؛ النسخ الاحتياطي يدوي.
- خادم الواجهات مبني لـ Cloudflare، فتشغيله محلياً يحتاج محوّل Node (يُحدد في `app-cmd.json`) — لم يُجرَّب بعد.
- لم تُبنَ الحزمة أو تُختبر على ويندوز حتى الآن.
