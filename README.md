# نقاط الزبائن — مكتبة عمر سوفت

واجهة برنامج حاسبة الطباعة ونقاط الزبائن، منشورة على GitHub Pages.
البيانات **ليست هنا**: كلها في Google Sheets الخاص بالمحل، عبر Apps Script.

## الملفات

| الملف | ماذا يفعل |
| --- | --- |
| `index.html` | البرنامج كاملاً (الحاسبة + النقاط) |
| `config.js` | رابط Apps Script — **الملف الوحيد الذي تعدّلونه** |
| `manifest.webmanifest`، `sw.js`، `icon-192.png`، `icon-512.png` | لتثبيت البرنامج كتطبيق على الحاسوب والهاتف |

## التحديث لاحقاً

- **تحديث الواجهة:** ارفعوا `index.html` الجديد مكان القديم (Add file ← Upload files).
- **تحديث Code.gs:** يبقى في Apps Script كالعادة (الصق ← احفظ ← Deploy ← Manage deployments ← New version). الرابط لا يتغير، فلا حاجة لتعديل `config.js`.
