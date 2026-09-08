# PixelShift — Browser Image Converter

موقع Static Front-end فقط لتحويل الصور داخل المتصفح، مع دعم رفع وتحويل مجموعة كبيرة دفعة واحدة وتنزيل النتائج كملف ZIP.

## التشغيل محليًا

يتطلب Node.js فقط (لا يوجد `npm install` ولا dependencies محلية):

### Windows
اضغط مرتين على `start-local.bat` ثم افتح:
`http://127.0.0.1:8080`

### Terminal
```bash
node server.mjs 8080
```

## النشر على GitHub Pages

1. أنشئ Repository جديد على GitHub.
2. ارفع كل محتويات هذا المشروع إلى branch باسم `main`.
3. افتح **Settings → Pages**.
4. من **Build and deployment → Source** اختر **GitHub Actions**.
5. الـ workflow الموجود في `.github/workflows/pages.yml` سينشر الموقع تلقائيًا.

## كيف يعمل؟

- لا يوجد Backend أو Database.
- الصور لا ترفع إلى سيرفر التطبيق.
- المحرك الكامل يستخدم `@imagemagick/magick-wasm` من CDN ويعمل داخل WebAssembly في المتصفح.
- عند عدم توفر المحرك الكامل، يوجد Fallback محلي لصيغ PNG / JPEG / WEBP / BMP / ICO.
- قائمة صيغ الإخراج الكاملة تُكتشف تلقائيًا من `Magick.supportedFormats` وقت التشغيل.
- بعض صيغ ImageMagick التي تعتمد على برامج خارجية (مثل Ghostscript) قد لا تعمل داخل WASM، لذلك يستبعد التطبيق أشهر هذه الصيغ من قائمة الإخراج.
- الصور المتحركة/متعددة الإطارات يتم التعامل معها حاليًا كإطار رئيسي عند التحويل.

## ملاحظات الأداء

المعالجة تتم ملفًا بعد ملف لتقليل استهلاك RAM. لا يوجد حد ثابت لعدد الصور، لكن الحد العملي يعتمد على حجم الصور وذاكرة الجهاز والمتصفح.

## Libraries / services

- ImageMagick WASM: Apache-2.0
- التطبيق نفسه لا يحتاج npm packages أو build step.
