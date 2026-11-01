# نسخة سطح المكتب (Windows) — Yousef Soft

## كيف تعمل
عند فتح البرنامج يشغّل في الخلفية "خادماً محلياً" (`yousef-server`) يحتوي:
1. PostgreSQL محمول — البيانات في `%APPDATA%/com.yousefsoft.desktop`.
2. PostgREST (واجهة الجداول) + GoTrue (تسجيل الدخول) — لأن البرنامج يعتمد على تسجيل الدخول وسياسات الأمان.
3. خادم التطبيق نفسه (ناتج `vite build`) على `127.0.0.1:3000`.

عند أول تشغيل يُطبَّق ملف المخطط `hiwi-hub-schema-v2.sql` على القاعدة الفارغة.
عند إغلاق النافذة يتوقف كل شيء.

## خطوات البناء (على جهاز Windows)
1. ثبّت: Rust (rustup)، Node/Bun، و `cargo install tauri-cli --version ^2`.
2. ضع داخل `desktop/stack/`: مجلد PostgreSQL المحمول، `postgrest.exe`، `gotrue.exe`، وملف المخطط.
3. ابنِ التطبيق بعنوان محلي:
   `VITE_SUPABASE_URL=http://127.0.0.1:54321 bun run build`
4. ضع ملف التشغيل `yousef-server-x86_64-pc-windows-msvc.exe` داخل `desktop/src-tauri/binaries/`.
5. من مجلد `desktop/src-tauri`: `cargo tauri build` ← ينتج ملف التثبيت `.exe` / `.msi`.

## حدود هذه النسخة
- ربط Sungrow/SMA وتلغرام والذكاء الاصطناعي يحتاج إنترنت.
- البيانات على جهاز واحد فقط؛ النسخ الاحتياطي يدوي.
- ملف `yousef-server` (المشغّل الذي يجمع المكونات) لم يُكتب بعد — هو الخطوة التالية.
