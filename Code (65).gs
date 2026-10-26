/**
 * نظام نقاط الزبائن — مكتبة عمر سوفت
 * ------------------------------------------------------------
 * مشروع Apps Script داخل Google Sheets، فيه ملفان (ويمكن أيضاً فتح الواجهة من GitHub Pages عبر doPost):
 *   Code.gs    ← هذا الملف (قاعدة البيانات والحسابات)
 *   index.html ← واجهة البرنامج (حاسبة سعر الطباعة + نقاط الزبون)
 * الشيت هو قاعدة البيانات، والبرنامج يُفتح من رابط "تطبيق الويب".
 *
 * أول مرة: من القائمة "نظام النقاط" ← "إعداد النظام (أول مرة)"، ثم النشر كتطبيق ويب.
 * لا تغيّر أسماء الأوراق ولا ترتيب الأعمدة.
 */

var SH = { C: 'الزبائن', L: 'العمليات', S: 'الإعدادات', W: 'العمال', R: 'التقارير', D: 'الأجهزة' };

var C_HEAD = ['رقم الكارت', 'الاسم', 'الهاتف', 'النوع', 'تاريخ التسجيل', 'تاريخ الميلاد', 'أحاله (رقم كارت)',
  'مكافأة الإحالة', 'الرصيد (نقاط)', 'المستوى', 'مجموع الطباعة (دج)', 'مجموع النقاط المكتسبة', 'آخر زيارة', 'سجّله', 'ملاحظات', 'مستوى ثابت (يدوي)'];
var CI = { id: 0, name: 1, phone: 2, type: 3, reg: 4, birth: 5, ref: 6, refDone: 7, bal: 8, tier: 9, total: 10, recent: 11, last: 12, by: 13, note: 14, tierFix: 15 };

var L_HEAD = ['التاريخ', 'رقم الكارت', 'الاسم', 'نوع العملية', 'المبلغ (دج)', 'النقاط', 'العامل', 'ملاحظة', 'رقم العملية'];
var LI = { date: 0, id: 1, name: 2, kind: 3, amount: 4, pts: 5, worker: 6, note: 7, op: 8 };

var W_HEAD = ['اسم العامل', 'الرمز السري (PIN)', 'الصلاحية', 'نشط'];

// الأجهزة المسموح لها بفتح البرنامج (حاسوب المحل، هاتف المدير…)
var D_HEAD = ['اسم الجهاز', 'رمز الجهاز', 'الحالة', 'طلبه', 'تاريخ الطلب', 'آخر استعمال', 'المفتاح (لا تغيّره)'];
var DI = { name: 0, code: 1, st: 2, by: 3, at: 4, last: 5, key: 6 };
var DEV_OK = 'معتمد', DEV_WAIT = 'بانتظار الموافقة', DEV_OFF = 'موقوف';

var K = { // أنواع العمليات
  WELCOME: 'نقاط ترحيب', EARN: 'طباعة', REDEEM: 'استبدال مكافأة', REF: 'إحالة زبون', TEACHER: 'طباعة تلميذ',
  FOLLOW: 'متابعة الصفحة', BIRTH: 'عيد ميلاد', MANUAL: 'تعديل يدوي', EXPIRE: 'انتهاء صلاحية'
};
var TYPES = ['تلميذ', 'أستاذ', 'زبون عادي'];
var TIERS = ['فضي', 'ذهبي']; // مستويان فقط: فضي (البطاقة الصغيرة) ثم ذهبي (البطاقة البرتقالية)
var SILVER = TIERS[0], GOLD = TIERS[1];
function normTier_(t) { t = String(t || '').trim(); return t === 'برونزي' ? SILVER : t; }
var OWNER = 'مالك';

// [المفتاح, الاسم الظاهر, القيمة الافتراضية, الشرح]
var SETTINGS = [
  ['DA_PER_POINT', 'كم دينار = نقطة واحدة', 100, 'مبلغ الطباعة الذي يعطي نقطة واحدة. تُحسب الكسور (مثلاً 50 دج = 0.5 نقطة).'],
  ['REWARD_POINTS', 'نقاط المكافأة الواحدة', 10, 'عدد النقاط التي تساوي مكافأة واحدة.'],
  ['REWARD_VALUE', 'قيمة الهدية — المستوى الذهبي (دج)', 100, 'قيمة الطباعة المجانية عن كل 10 نقاط لأصحاب البطاقة الذهبية.'],
  ['REWARD_VALUE_SILVER', 'قيمة الهدية — المستوى الفضي (دج)', 50, 'قيمة الطباعة المجانية عن كل 10 نقاط لأصحاب البطاقة الفضية.'],
  ['WELCOME_POINTS', 'نقاط الترحيب', 1, 'تُعطى مرة واحدة عند تسجيل زبون جديد.'],
  ['REFERRAL_POINTS', 'نقاط الإحالة', 0, 'لمن أحضر زبوناً جديداً. تُعطى عند أول طباعة للزبون الجديد (وليس عند التسجيل) لمنع الغش.'],
  ['FOLLOW_POINTS', 'نقاط متابعة الصفحة', 0, 'مرة واحدة لكل زبون يتابع صفحتنا على فيسبوك/إنستغرام.'],
  ['BIRTHDAY_POINTS', 'نقاط عيد الميلاد', 0, 'تُعطى مرة في السنة إذا طبع الزبون في أسبوع عيد ميلاده (3 أيام قبله أو بعده).'],
  ['TEACHER_BONUS_PCT', 'زيادة الأستاذ (%)', 100, '100 = نقاط مضاعفة للأساتذة. 0 = بدون زيادة.'],
  ['TEACHER_LINK_PER_100', 'نقاط الأستاذ عن طباعة تلاميذه', 0.5, 'عندما يذكر التلميذ رقم أستاذه، يحصل الأستاذ على هذا العدد من النقاط عن كل 100 دج يطبعها التلميذ.'],
  ['GOLD_POINTS', 'ينتقل إلى الذهبي عند جمع (نقطة)', 30, 'عندما يجمع الزبون الفضي هذا العدد من النقاط من طباعته (منذ تسجيله) ينتقل إلى المستوى الذهبي، ويظهر للعامل تنبيه ليعطيه البطاقة البرتقالية. 0 = الذهبي فقط لمن أُعطي بطاقة ذهبية.'],
  ['PROMO_PCT', 'زيادة العرض (%)', 100, '100 = نقاط مضاعفة خلال العرض. يعمل فقط إذا حددت تاريخاً أو أياماً أدناه.'],
  ['PROMO_NAME', 'اسم العرض', 'نقاط مضاعفة', 'يظهر للعامل في البرنامج.'],
  ['PROMO_FROM', 'العرض من تاريخ', '', 'مثلاً بداية فترة الامتحانات. اتركه فارغاً إن لم يوجد عرض.'],
  ['PROMO_TO', 'العرض إلى تاريخ', '', 'آخر يوم في العرض (يدخل ضمنه).'],
  ['PROMO_DAYS', 'أيام العرض الأسبوعية', '', 'أيام هادئة بنقاط مضاعفة كل أسبوع، مثلاً: الثلاثاء، الأربعاء. اتركه فارغاً لإيقافه.'],
  ['EXPIRY_MONTHS', 'انتهاء النقاط بعد الغياب (أشهر)', 0, 'إذا لم يأتِ الزبون للطباعة خلال هذه المدة تنتهي نقاطه. 0 = لا تنتهي أبداً.'],
  ['SHOP_NAME', 'اسم المحل على البطاقة', 'مكتبة عمر سوفت', 'يظهر على وجه البطاقة.'],
  ['WHATSAPP', 'رقم الواتساب على البطاقة', '0671476791', 'يظهر على ظهر البطاقة.'],
  ['SERVICES', 'الخدمات على ظهر البطاقة', 'طباعة ملونة، تسجيلات إلكترونية، فليكسي، دفع فواتير الإنترنت، تفعيل الإنترنت، تصميم كارت فيزيت، دعوات الزفاف، تصوير وثائق', 'افصلوا بين الخدمات بفاصلة (8 خدمات كحد أقصى).'],
  ['WORKER_PTS_NEW', 'نقاط العامل: زبون جديد', 10, 'يحصل العامل على هذه النقاط عن كل زبون جديد يسجّله.'],
  ['WORKER_PTS_TXN', 'نقاط العامل: عملية بالبطاقة', 1, 'عن كل طباعة يسجّلها على بطاقة زبون.'],
  ['WORKER_PTS_RETURN', 'نقاط العامل: زبون رجع', 5, 'عندما يرجع زبون سجّله العامل ويطبع مرة ثانية ببطاقته (مرة واحدة لكل زبون).'],
  ['NEAR_REWARD_DA', 'تنبيه "قريب من المكافأة" (دج)', 200, 'يظهر تنبيه للعامل إذا كان الزبون يحتاج هذا المبلغ أو أقل ليصل إلى مكافأة.']
];

// ============================================================
// القائمة والإعداد
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('نظام النقاط')
    .addItem('إعداد النظام (أول مرة)', 'setup')
    .addItem('تحديث التقارير', 'updateReports')
    .addItem('عرض رابط البرنامج', 'showUrl')
    .addItem('تطبيق انتهاء صلاحية النقاط الآن', 'expireAll')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Africa/Algiers');
  var c = sheet_(SH.C, C_HEAD), l = sheet_(SH.L, L_HEAD), s = sheet_(SH.S, ['المفتاح', 'الإعداد', 'القيمة', 'الشرح']);
  var w = sheet_(SH.W, W_HEAD); sheet_(SH.R, ['']); devSheet_(ss);

  c.getRange('A:A').setNumberFormat('@'); c.getRange('C:C').setNumberFormat('@'); c.getRange('G:G').setNumberFormat('@');
  c.getRange('E:E').setNumberFormat('yyyy-mm-dd'); c.getRange('F:F').setNumberFormat('yyyy-mm-dd'); c.getRange('M:M').setNumberFormat('yyyy-mm-dd');
  c.getRange('I:I').setNumberFormat('0.0'); c.getRange('K:L').setNumberFormat('#,##0');
  c.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(TYPES, true).build());
  l.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm'); l.getRange('B:B').setNumberFormat('@');
  l.getRange('E:E').setNumberFormat('#,##0'); l.getRange('F:F').setNumberFormat('0.0');
  w.getRange('B:B').setNumberFormat('@');
  w.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['عامل', OWNER], true).build());
  w.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['نعم', 'لا'], true).build());

  // الإعدادات: نضيف الناقص فقط ولا نغيّر قيمكم
  var have = {}; s.getDataRange().getValues().forEach(function (r) { have[r[0]] = 1; });
  SETTINGS.forEach(function (d) { if (!have[d[0]]) s.appendRow(d); });
  s.getRange('A:A').setFontColor('#9CA3AF'); s.setColumnWidth(2, 260); s.setColumnWidth(3, 130); s.setColumnWidth(4, 520);
  s.getRange('C2:C').setBackground('#FEF9C3').setFontWeight('bold');
  s.getRange('C2:C').setHorizontalAlignment('center');

  var msg = [];
  if (w.getLastRow() < 2) {
    var pin = String(Math.floor(1000 + Math.random() * 9000));
    w.getRange(2, 1, 1, 4).setValues([['المالك', pin, OWNER, 'نعم']]);
    msg.push('تمت إضافة حساب "المالك" برمز سري: ' + pin + '\n(يمكنكم تغييره من ورقة "العمال"، وإضافة العمال تحتها).');
  }

  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'daily') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('daily').timeBased().everyDays(1).atHour(5).create();

  [c, l, s, w].forEach(function (x) { x.setRightToLeft(true); });
  ss.getSheetByName(SH.R).setRightToLeft(true);
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  updateReports();
  SpreadsheetApp.getUi().alert('تم إعداد النظام ✔\n\n' + msg.join('\n\n') + '\n\nالخطوة التالية: Deploy ← New deployment ← Web app (راجع الدليل).');
}

function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (head.length > 1 && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function showUrl() {
  var u = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(u ? 'رابط البرنامج:\n\n' + u + '\n\nافتحوه في حاسوب المحل واحفظوه في المفضلة.' : 'لم يُنشر البرنامج بعد: Deploy ← New deployment ← Web app.');
}
function daily() { expireAll(); updateReports(); }

// ============================================================
// واجهة البرنامج ونقطة الاتصال (google.script.run)
// ============================================================
function doGet() {
  // نقبل عدة أسماء لملف الواجهة حتى لا يتوقف البرنامج بسبب الاسم
  var names = ['index', 'Index', 'code', 'Code', 'index.html', 'code.html', 'Index.html', 'Code.html'], out = null;
  for (var i = 0; i < names.length && !out; i++) { try { out = HtmlService.createHtmlOutputFromFile(names[i]); } catch (e) { } }
  if (!out) return HtmlService.createHtmlOutput('<div dir="rtl" style="font:18px Tahoma;padding:30px">لم أجد ملف الواجهة.<br>في Apps Script أضيفوا ملف HTML باسم <b>index</b> والصقوا فيه محتوى index.html، ثم احفظوا وانشروا نسخة جديدة (Deploy ← Manage deployments ← New version).</div>');
  return out
    .setTitle('حاسبة الطباعة ونقاط الزبائن — مكتبة عمر سوفت')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** كل طلبات البرنامج تمر من هنا: api({action, worker, pin, ...}) */
/** نقطة الاتصال لنسخة GitHub Pages: الصفحة ترسل الطلب بـ POST وتستقبل JSON */
function doPost(e) {
  var req;
  try { req = JSON.parse(e && e.postData && e.postData.contents || '{}'); } catch (x) { req = null; }
  var out = req ? api(req) : { ok: false, err: 'طلب غير صالح' };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function api(req) {
  if (!req || typeof req !== 'object') return { ok: false, err: 'طلب غير صالح' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (x) { return { ok: false, err: 'النظام مشغول، أعد المحاولة', code: 'busy' }; }
  try {
    var ctx = ctx_();
    var w = auth_(ctx, req.worker, req.pin, req.dev, req.devName);
    var a = API[req.action];
    if (!a) throw new Error('عملية غير معروفة');
    if (a.owner && w.role !== OWNER) throw new Error('هذه العملية لصاحب المحل فقط');
    var data = a.run(ctx, req, w);
    SpreadsheetApp.flush();
    return { ok: true, data: JSON.parse(JSON.stringify(data)) };
  } catch (x) {
    return { ok: false, err: String(x && x.message || x), code: x && x.code || '' };
  } finally { lock.releaseLock(); }
}
function fail_(m, code) { var e = new Error(m); e.code = code || ''; throw e; }

/** تحديث ورقة الإعدادات تلقائياً مرة واحدة بعد كل نسخة جديدة (إضافة الأسطر الناقصة، والهدية 100 دج) */
function migrate_(ss) {
  var props = PropertiesService.getScriptProperties();
  var ver = props.getProperty('SETTINGS_VER');
  if (ver === '12') return;
  if (ver === '11') { migrate12_(ss, props); return; }
  if (ver === '10') { migrate11_(ss, props); return; }
  if (ver === '9') { migrate10_(ss, props); return; }
  var sh = ss.getSheetByName(SH.S); if (!sh) return;
  if (ver !== '7') {
  var data = sh.getDataRange().getValues(), have = {};
  data.forEach(function (r, i) {
    have[r[0]] = 1;
    if (r[0] === 'REWARD_VALUE' && +r[2] === 50) sh.getRange(i + 1, 2, 1, 2).setValues([['قيمة الهدية (دج)', 100]]);
  });
  SETTINGS.forEach(function (d) { if (!have[d[0]]) sh.appendRow(d); });
  }
  // نسخة 8: عمود «مستوى ثابت»، وتسجيل البطاقات 1–8 المطبوعة كبطاقات ذهبية
  var shc = ss.getSheetByName(SH.C);
  if (shc && !String(shc.getRange(1, CI.tierFix + 1).getValue()).trim())
    shc.getRange(1, CI.tierFix + 1).setValue(C_HEAD[CI.tierFix]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
  if (!props.getProperty('CARD_RANGES')) props.setProperty('CARD_RANGES', JSON.stringify([{ from: 1, to: 8, tier: GOLD }]));
  // نسخة 9: مستويان فقط (فضي، ذهبي) — حذف إعدادات البرونزي والنسب، وإضافة قيمة هدية الفضي
  var rows = sh.getDataRange().getValues();
  for (var k = rows.length - 1; k >= 1; k--) if (['SILVER_MIN', 'SILVER_BONUS_PCT', 'GOLD_BONUS_PCT'].indexOf(rows[k][0]) >= 0) sh.deleteRow(k + 1);
  rows = sh.getDataRange().getValues(); var have9 = {};
  rows.forEach(function (r, i) {
    have9[r[0]] = 1;
    SETTINGS.forEach(function (d) { if (d[0] === r[0] && (r[0] === 'REWARD_VALUE')) sh.getRange(i + 1, 2).setValue(d[1]), sh.getRange(i + 1, 4).setValue(d[3]); });
  });
  SETTINGS.forEach(function (d) { if (!have9[d[0]]) sh.appendRow(d); });
  props.setProperty('CARD_RANGES', JSON.stringify(cardRanges_().map(function (r) { r.tier = normTier_(r.tier); return r; })));
  if (shc && shc.getLastRow() > 1) {
    var rg = shc.getRange(2, CI.tier + 1, shc.getLastRow() - 1, 1), v = rg.getValues().map(function (r) { return [normTier_(r[0]) || SILVER]; }); rg.setValues(v);
    var rf = shc.getRange(2, CI.tierFix + 1, shc.getLastRow() - 1, 1), vf = rf.getValues().map(function (r) { var t = normTier_(r[0]); return [t === GOLD ? GOLD : '']; }); rf.setValues(vf);
  }
  props.setProperty('SETTINGS_VER', '9');
  migrate10_(ss, props);
}
/** نسخة 10: إيقاف الإحالة، متابعة الصفحة، عيد الميلاد، وانتهاء النقاط (غير مستعملة في المحل) */
function migrate10_(ss, props) {
  var sh = ss.getSheetByName(SH.S);
  if (sh) sh.getDataRange().getValues().forEach(function (r, i) {
    if (['REFERRAL_POINTS', 'FOLLOW_POINTS', 'BIRTHDAY_POINTS', 'EXPIRY_MONTHS'].indexOf(r[0]) >= 0) sh.getRange(i + 1, 3).setValue(0);
  });
  props.setProperty('SETTINGS_VER', '10');
  migrate11_(ss, props);
}
/** نسخة 11: نقطة ترحيب واحدة */
function migrate11_(ss, props) {
  var sh = ss.getSheetByName(SH.S);
  if (sh) sh.getDataRange().getValues().forEach(function (r, i) { if (r[0] === 'WELCOME_POINTS') sh.getRange(i + 1, 3).setValue(1); });
  props.setProperty('SETTINGS_VER', '11');
  migrate12_(ss, props);
}
/** نسخة 12: الانتقال إلى الذهبي بعدد النقاط المجمّعة (بدون مدة) */
function migrate12_(ss, props) {
  var sh = ss.getSheetByName(SH.S);
  if (sh) {
    var rows = sh.getDataRange().getValues(), have = {};
    for (var k = rows.length - 1; k >= 1; k--) if (rows[k][0] === 'GOLD_MIN' || rows[k][0] === 'TIER_MONTHS') sh.deleteRow(k + 1);
    sh.getDataRange().getValues().forEach(function (r) { have[r[0]] = 1; });
    SETTINGS.forEach(function (d) { if (!have[d[0]]) sh.appendRow(d); });
  }
  var shc = ss.getSheetByName(SH.C);
  if (shc) shc.getRange(1, CI.recent + 1).setValue('مجموع النقاط المكتسبة');
  props.setProperty('SETTINGS_VER', '12');
  try { var ctx = { ss: ss, tz: ss.getSpreadsheetTimeZone(), now: new Date(), S: readSettings_(ss), _c: null, _l: null }; customers_(ctx).forEach(function (r, i) { refresh_(ctx, i, 'النظام'); }); } catch (e) { }
}
function ctx_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  migrate_(ss);
  return { ss: ss, tz: ss.getSpreadsheetTimeZone(), now: new Date(), S: readSettings_(ss), _c: null, _l: null };
}
function readSettings_(ss) {
  var S = {}; SETTINGS.forEach(function (d) { S[d[0]] = d[2]; });
  var sh = ss.getSheetByName(SH.S);
  if (sh) sh.getDataRange().getValues().slice(1).forEach(function (r) { if (r[0] && r[2] !== '' && r[2] !== null) S[r[0]] = r[2]; });
  ['DA_PER_POINT', 'REWARD_POINTS', 'REWARD_VALUE', 'WELCOME_POINTS', 'REFERRAL_POINTS', 'FOLLOW_POINTS', 'BIRTHDAY_POINTS', 'TEACHER_BONUS_PCT',
    'TEACHER_LINK_PER_100', 'GOLD_POINTS', 'REWARD_VALUE_SILVER', 'PROMO_PCT', 'EXPIRY_MONTHS', 'NEAR_REWARD_DA']
    .concat(['WORKER_PTS_NEW', 'WORKER_PTS_TXN', 'WORKER_PTS_RETURN'])
    .forEach(function (k) { var v = parseFloat(String(S[k]).replace(',', '.')); S[k] = isNaN(v) ? 0 : v; });
  if (S.DA_PER_POINT <= 0) S.DA_PER_POINT = 100;
  if (S.REWARD_POINTS <= 0) S.REWARD_POINTS = 10;
  return S;
}

// ---- العمال ----
function isAdmin_(v) { v = String(v || '').trim(); return v === OWNER || v === 'مدير' || v === 'المدير'; }
function auth_(ctx, name, pin, dev, devName) {
  name = String(name || '').trim(); pin = String(pin || '').trim();
  dev = String(dev || '').trim();
  if (!/^[a-f0-9]{24,64}$/.test(dev)) fail_('صفحة البرنامج قديمة (النسخة 7 أو أقدم).\nإذا فتحتم من GitHub: ارفعوا index.html الجديد إلى GitHub، وانتظروا دقيقتين ثم اضغطوا Ctrl+F5.\nإذا فتحتم من رابط Apps Script: الصقوا index الجديد ثم New version.', 'auth');
  var D = devices_(ctx), di = devFind_(D, dev), approved = di >= 0 && String(D[di][DI.st]).trim() === DEV_OK;
  if (di >= 0 && String(D[di][DI.st]).trim() === DEV_OFF) fail_('هذا الجهاز موقوف من طرف المدير.', 'device');
  if (!pin) fail_('أدخل رمزك', 'auth');
  // عدّاد المحاولات الخاطئة: لكل جهاز معتمد عدّاده، وكل الأجهزة الغريبة تشترك في عدّاد واحد
  var cache = CacheService.getScriptCache(), ck = approved ? 'fail_' + dev : 'fail_pin', n = +(cache.get(ck) || 0);
  if (n >= 10) fail_('محاولات خاطئة كثيرة. انتظر 10 دقائق ثم أعد المحاولة.', 'auth');
  var rows = ctx.ss.getSheetByName(SH.W).getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[1]).trim() === pin && String(r[0]).trim() && (!name || String(r[0]).trim() === name);
  });
  if (!rows.length) { cache.put(ck, String(n + 1), 600); fail_('الرمز غير صحيح', 'auth'); }
  if (rows.length > 1) fail_('هذا الرمز مستعمل لأكثر من عامل — يجب على المدير تغييره', 'auth');
  var r = rows[0];
  if (String(r[3]).trim() === 'لا') fail_('هذا الحساب موقوف', 'auth');
  var who = { name: String(r[0]).trim(), role: isAdmin_(r[2]) ? OWNER : 'عامل' };
  var sh = devSheet_(ctx.ss), now = ctx.now;
  if (approved) {
    var last = D[di][DI.last];
    if (!(last instanceof Date) || now - last > 10 * 60 * 1000) sh.getRange(di + 2, DI.last + 1).setValue(now);
    return who;
  }
  var label = String(devName || 'جهاز').replace(/[<>=+@]/g, '').slice(0, 40);
  // أول مرة فقط: لا يوجد أي جهاز معتمد بعد ← جهاز المدير الأول يُعتمد تلقائياً
  var anyOk = D.some(function (x) { return String(x[DI.st]).trim() === DEV_OK; });
  if (!anyOk && who.role === OWNER) {
    var row = [label, devCode_(dev), DEV_OK, who.name, now, now, dev];
    if (di >= 0) sh.getRange(di + 2, 1, 1, D_HEAD.length).setValues([row]); else sh.appendRow(row);
    return who;
  }
  if (di < 0) {
    var waiting = D.filter(function (x) { return String(x[DI.st]).trim() === DEV_WAIT; }).length;
    if (waiting < 30) sh.appendRow([label, devCode_(dev), DEV_WAIT, who.name, now, '', dev]);
  }
  fail_('هذا الجهاز غير معتمد بعد.\nرمز الجهاز: ' + devCode_(dev) + '\nاطلب من المدير اعتماده من خانة «العمال» ← «الأجهزة».', 'device');
}
function devSheet_(ss) {
  var sh = ss.getSheetByName(SH.D);
  if (!sh) {
    sh = ss.insertSheet(SH.D);
    sh.getRange(1, 1, 1, D_HEAD.length).setValues([D_HEAD]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
    sh.setFrozenRows(1); sh.setRightToLeft(true);
    sh.getRange('E:F').setNumberFormat('yyyy-mm-dd hh:mm'); sh.getRange('B:B').setNumberFormat('@'); sh.getRange('G:G').setNumberFormat('@').setFontColor('#9CA3AF');
    sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([DEV_OK, DEV_WAIT, DEV_OFF], true).build());
    sh.setColumnWidth(1, 200); sh.setColumnWidth(3, 140);
  }
  return sh;
}
function devices_(ctx) {
  var sh = devSheet_(ctx.ss), n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, D_HEAD.length).getValues() : [];
}
function devFind_(D, key) { for (var i = 0; i < D.length; i++) if (String(D[i][DI.key]).trim() === key) return i; return -1; }
function devCode_(key) { return String(key).slice(0, 4).toUpperCase() + '-' + String(key).slice(4, 8).toUpperCase(); }

// ============================================================
// أدوات البيانات
// ============================================================
function customers_(ctx) {
  if (!ctx._c) {
    var sh = ctx.ss.getSheetByName(SH.C), n = sh.getLastRow() - 1;
    ctx._c = n > 0 ? sh.getRange(2, 1, n, C_HEAD.length).getValues() : [];
  }
  return ctx._c;
}
function logRows_(ctx) {
  if (!ctx._l) {
    var sh = ctx.ss.getSheetByName(SH.L), n = sh.getLastRow() - 1;
    ctx._l = n > 0 ? sh.getRange(2, 1, n, L_HEAD.length).getValues() : [];
  }
  return ctx._l;
}
function normPhone_(p) {
  p = String(p || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/\D/g, '');
  if (p.indexOf('00213') === 0) p = '0' + p.slice(5); else if (p.indexOf('213') === 0 && p.length === 12) p = '0' + p.slice(3);
  if (p.length === 9 && /^[567]/.test(p)) p = '0' + p;
  return p;
}
function normId_(q) {
  q = String(q || '').trim().toUpperCase().replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
  var m = q.match(/^(?:OS)?[-\s]?0*(\d{1,6})$/);
  return m ? 'OS-' + ('0000' + m[1]).slice(-Math.max(4, m[1].length)) : null;
}
function findIdx_(ctx, id) {
  var c = customers_(ctx), nid = normId_(id) || String(id);
  for (var i = 0; i < c.length; i++) if (String(c[i][CI.id]) === nid) return i;
  return -1;
}
function must_(ctx, id) { var i = findIdx_(ctx, id); if (i < 0) fail_('الزبون غير موجود: ' + id, 'nocust'); return i; }
function r1_(x) { return Math.round(x * 10) / 10; }
function asDate_(v) { if (v instanceof Date) return v; if (!v) return null; var d = new Date(v); return isNaN(d) ? null : d; }
function addMonths_(d, m) { var x = new Date(d.getTime()); x.setMonth(x.getMonth() + m); return x; }

function addLog_(ctx, id, name, kind, amount, pts, worker, note, op, when) {
  var row = [when || ctx.now, id, name, kind, amount || 0, r1_(pts || 0), worker, note || '', op || ''];
  var L = logRows_(ctx); // نقرأ السجل قبل الإضافة حتى لا يُحسب السطر مرتين
  ctx.ss.getSheetByName(SH.L).appendRow(row);
  L.push(row);
  return row;
}

/** يعيد حساب رصيد ومستوى الزبون من سجل العمليات، ويطبّق انتهاء الصلاحية إن لزم */
function refresh_(ctx, idx, workerName) {
  var c = customers_(ctx)[idx], id = String(c[CI.id]), S = ctx.S, L = logRows_(ctx);
  var bal = 0, total = 0, recent = 0, last = asDate_(c[CI.reg]); // recent = مجموع النقاط المكتسبة من الطباعة
  for (var i = 0; i < L.length; i++) {
    var r = L[i]; if (String(r[LI.id]) !== id) continue;
    bal += +r[LI.pts] || 0;
    var d = asDate_(r[LI.date]);
    if (r[LI.kind] === K.EARN) { total += +r[LI.amount] || 0; recent += Math.max(0, +r[LI.pts] || 0); }
    if ((r[LI.kind] === K.EARN || r[LI.kind] === K.REDEEM) && d && (!last || d > last)) last = d;
  }
  bal = r1_(bal);
  if (S.EXPIRY_MONTHS > 0 && bal > 0 && last && addMonths_(last, S.EXPIRY_MONTHS) < ctx.now) {
    addLog_(ctx, id, c[CI.name], K.EXPIRE, 0, -bal, workerName || 'النظام', 'غياب أكثر من ' + S.EXPIRY_MONTHS + ' أشهر');
    bal = 0;
  }
  var fx = normTier_(c[CI.tierFix]);
  recent = r1_(recent);
  var tier = fx === GOLD ? GOLD : (S.GOLD_POINTS > 0 && recent >= S.GOLD_POINTS ? GOLD : SILVER);
  c[CI.bal] = bal; c[CI.tier] = tier; c[CI.total] = total; c[CI.recent] = recent; c[CI.last] = last || '';
  ctx.ss.getSheetByName(SH.C).getRange(idx + 2, CI.bal + 1, 1, 5).setValues([[bal, tier, total, recent, last || '']]);
  return c;
}

function promo_(ctx) {
  var S = ctx.S; if (!(S.PROMO_PCT > 0)) return null;
  var today = Utilities.formatDate(ctx.now, ctx.tz, 'yyyy-MM-dd');
  var f = asDate_(S.PROMO_FROM), t = asDate_(S.PROMO_TO), on = false;
  if (f || t) {
    var fs = f ? Utilities.formatDate(f, ctx.tz, 'yyyy-MM-dd') : '0000', ts = t ? Utilities.formatDate(t, ctx.tz, 'yyyy-MM-dd') : '9999';
    if (today >= fs && today <= ts) on = true;
  }
  var days = String(S.PROMO_DAYS || '').trim();
  if (days) {
    var names = ['', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
    var u = +Utilities.formatDate(ctx.now, ctx.tz, 'u');
    var norm = function (s) { return s.replace(/[إأآ]/g, 'ا').replace(/^ال/, '').trim(); };
    days.split(/[،,\s]+/).forEach(function (d) { if (d && norm(d) === norm(names[u])) on = true; });
  }
  return on ? { name: String(S.PROMO_NAME || 'عرض'), pct: S.PROMO_PCT } : null;
}

function bonusParts_(ctx, c) {
  var S = ctx.S, parts = [];
  if (c[CI.type] === 'أستاذ' && S.TEACHER_BONUS_PCT > 0) parts.push({ label: 'أستاذ', pct: S.TEACHER_BONUS_PCT });
  var p = promo_(ctx); if (p) parts.push({ label: p.name, pct: p.pct });
  return parts;
}

function view_(ctx, idx, withHistory) {
  var c = customers_(ctx)[idx], S = ctx.S, id = String(c[CI.id]);
  var parts = bonusParts_(ctx, c), pct = parts.reduce(function (a, p) { return a + p.pct; }, 0);
  var bal = +c[CI.bal] || 0, rem = r1_(S.REWARD_POINTS - (bal % S.REWARD_POINTS));
  if (rem <= 0) rem = S.REWARD_POINTS;
  var daNeeded = Math.ceil(rem * S.DA_PER_POINT / (1 + pct / 100));
  var hist = [], used = 0, usedN = 0, L0 = logRows_(ctx);
  for (var u = 0; u < L0.length; u++) if (String(L0[u][LI.id]) === id && L0[u][LI.kind] === K.REDEEM) { used += +L0[u][LI.amount] || 0; usedN++; }
  if (withHistory) {
    var L = logRows_(ctx);
    for (var i = L.length - 1; i >= 0 && hist.length < 12; i--) if (String(L[i][LI.id]) === id)
      hist.push({ d: fmt_(ctx, L[i][LI.date]), k: L[i][LI.kind], a: +L[i][LI.amount] || 0, p: +L[i][LI.pts] || 0, w: L[i][LI.worker] });
  }
  var p = String(c[CI.phone]);
  return {
    id: id, name: c[CI.name], phone: p, phoneMask: p ? p.slice(0, 4) + '••••' + p.slice(-2) : '', type: c[CI.type], tier: normTier_(c[CI.tier]) || SILVER,
    balance: r1_(bal), rewards: Math.floor(bal / S.REWARD_POINTS + 1e-9), rewardValue: rv_(S, c[CI.tier]), rewardPoints: S.REWARD_POINTS,
    toNext: rem, daToNext: daNeeded, near: daNeeded <= S.NEAR_REWARD_DA,
    bonusPct: pct, bonus: parts, total: +c[CI.total] || 0, recent: +c[CI.recent] || 0, last: fmt_(ctx, c[CI.last]),
    since: fmt_(ctx, c[CI.reg]), earned: +c[CI.recent] || 0, goldLeft: (normTier_(c[CI.tier]) === GOLD || !(S.GOLD_POINTS > 0)) ? 0 : r1_(Math.max(0, S.GOLD_POINTS - (+c[CI.recent] || 0))), cardTier: cardTier_(id), tierFix: String(c[CI.tierFix] || ''), hasBirth: !!c[CI.birth], followed: hasKind_(ctx, id, K.FOLLOW), hist: hist, used: used, usedN: usedN
  };
}
function fmt_(ctx, d) { d = asDate_(d); return d ? Utilities.formatDate(d, ctx.tz, 'yyyy-MM-dd') : ''; }
function hasKind_(ctx, id, kind, sinceDate) {
  var L = logRows_(ctx);
  for (var i = 0; i < L.length; i++) if (String(L[i][LI.id]) === id && L[i][LI.kind] === kind && (!sinceDate || asDate_(L[i][LI.date]) >= sinceDate)) return true;
  return false;
}
function settingsView_(ctx) {
  var S = ctx.S;
  return { DA_PER_POINT: S.DA_PER_POINT, REWARD_POINTS: S.REWARD_POINTS, REWARD_VALUE: S.REWARD_VALUE, REWARD_VALUE_SILVER: S.REWARD_VALUE_SILVER, WELCOME_POINTS: S.WELCOME_POINTS,
    REFERRAL_POINTS: S.REFERRAL_POINTS, FOLLOW_POINTS: S.FOLLOW_POINTS, BIRTHDAY_POINTS: S.BIRTHDAY_POINTS, promo: promo_(ctx),
    SHOP_NAME: String(S.SHOP_NAME || ''), WHATSAPP: (function (w) { w = String(w || '').trim(); return /^\d{9}$/.test(w) ? '0' + w : w; })(S.WHATSAPP), SERVICES: String(S.SERVICES || '') };
}

// ============================================================
// العمليات المتاحة للبرنامج
// ============================================================
var API = {
  ping: { run: function (ctx, req, w) { return { worker: w.name, role: w.role, settings: settingsView_(ctx), count: customers_(ctx).length }; } },

  find: {
    run: function (ctx, req) {
      var q = String(req.q || '').trim(); if (!q) fail_('اكتب رقم الهاتف أو رقم الكارت أو الاسم');
      var c = customers_(ctx), nid = normId_(q), ph = normPhone_(q), ql = q.toLowerCase(), out = [];
      for (var i = 0; i < c.length; i++) {
        var r = c[i], p = String(r[CI.phone]);
        var hit = (nid && String(r[CI.id]) === nid) || (!/^os/i.test(q) && ph.length >= 4 && p.indexOf(ph) >= 0 && (ph.length >= 8 || p.slice(-ph.length) === ph)) ||
          (!/^\d+$/.test(q) && String(r[CI.name]).toLowerCase().indexOf(ql) >= 0);
        if (hit) out.push(i);
      }
      // تطابق تام برقم الكارت أو الهاتف كاملاً → نفتح الزبون مباشرة
      var exact = out.filter(function (i) { return String(c[i][CI.id]) === nid || (ph.length >= 9 && String(c[i][CI.phone]) === ph); });
      if (exact.length === 1) { refresh_(ctx, exact[0]); return { one: view_(ctx, exact[0], true), via: String(c[exact[0]][CI.id]) === nid ? 'card' : 'phone' }; }
      if (!out.length && nid) {
        var num = +nid.replace(/\D/g, ''), last = +(PropertiesService.getScriptProperties().getProperty('LAST_CARD') || 0);
        return { list: [], unusedCard: nid, printed: num <= last, cardTier: cardTier_(nid) };
      }
      return {
        list: out.slice(0, 10).map(function (i) {
          var p = String(c[i][CI.phone]);
          return { id: c[i][CI.id], name: c[i][CI.name], type: c[i][CI.type], phoneMask: p ? p.slice(0, 4) + '••••' + p.slice(-2) : '', balance: +c[i][CI.bal] || 0 };
        }), more: out.length > 10
      };
    }
  },

  get: { run: function (ctx, req, w) { var i = must_(ctx, req.id); refresh_(ctx, i, w.name); return { one: view_(ctx, i, true) }; } },

  register: {
    run: function (ctx, req, w) {
      var name = String(req.name || '').trim(), phone = normPhone_(req.phone), type = TYPES.indexOf(req.type) >= 0 ? req.type : TYPES[0];
      if (name.length < 2) fail_('اكتب اسم الزبون');
      if (phone && !/^0[5-7]\d{8}$/.test(phone) && !/^0[2-4]\d{7,8}$/.test(phone)) fail_('رقم الهاتف غير صحيح (مثال: 0550123456) — أو اتركه فارغاً');
      var c = customers_(ctx);
      if (phone) for (var i = 0; i < c.length; i++) if (String(c[i][CI.phone]) === phone) fail_('هذا الرقم مسجل من قبل باسم: ' + c[i][CI.name] + ' (' + c[i][CI.id] + ')', 'dup');
      var ref = '';
      if (req.ref) {
        var ri = findRef_(ctx, req.ref); if (ri < 0) fail_('لم أجد الزبون الذي أحاله: ' + req.ref);
        ref = String(c[ri][CI.id]);
      }
      var birth = asDate_(req.birth), id;
      if (String(req.card || '').trim()) {
        id = normId_(req.card); if (!id) fail_('رقم البطاقة غير صحيح (مثال: 15 أو OS-0015)');
        if (findIdx_(ctx, id) >= 0) fail_('البطاقة ' + id + ' مستعملة من قبل زبون آخر. أعطه بطاقة أخرى.', 'dupcard');
      } else id = cardId_(nextCard_(ctx));
      var fix = cardTier_(id) === GOLD ? GOLD : ''; // من يأخذ بطاقة ذهبية يصبح ذهبياً
      var row = [id, name, phone, type, ctx.now, birth || '', ref, ref ? 'في الانتظار' : '', 0, fix || SILVER, 0, 0, '', w.name, String(req.note || ''), fix];
      ctx.ss.getSheetByName(SH.C).appendRow(row); c.push(row);
      if (ctx.S.WELCOME_POINTS > 0) addLog_(ctx, id, name, K.WELCOME, 0, ctx.S.WELCOME_POINTS, w.name, '', req.opId);
      var idx = c.length - 1; refresh_(ctx, idx, w.name);
      return { one: view_(ctx, idx, true), created: true };
    }
  },

  /** تسجيل طباعة: إضافة نقاط، مع استبدال مكافأة اختياري في نفس العملية */
  txn: {
    run: function (ctx, req, w) {
      var S = ctx.S, L = logRows_(ctx), op = String(req.opId || '');
      if (op) for (var j = L.length - 1; j >= 0 && j >= L.length - 3000; j--) if (L[j][LI.op] === op) {
        var di = findRef_(ctx, req.id); if (di < 0) di = must_(ctx, req.id); return { one: view_(ctx, di, true), dup: true, summary: { earned: 0, discount: 0, paid: 0, extras: [] } };
      }
      var idx = findRef_(ctx, req.id); if (idx < 0) fail_('الزبون غير موجود: ' + req.id, 'nocust');
      var c = customers_(ctx)[idx], id = String(c[CI.id]);
      var when = req.ts ? asDate_(req.ts) : null; if (!when || when > ctx.now) when = ctx.now;
      refresh_(ctx, idx, w.name);
      var tierBefore = c[CI.tier];
      var amount = Math.max(0, Math.round(+req.amount || 0)), units = Math.max(0, Math.floor(+req.redeem || 0)), discount = 0, extras = [];
      if (amount <= 0) fail_('مبلغ الطباعة يجب أن يكون أكبر من 0');
      if (units > 0) {
        if (req.queued) fail_('لا يمكن استبدال المكافأة بدون إنترنت');
        var ph = String(c[CI.phone]);
        if (!req.viaCard && ph && String(req.last2 || '').trim() !== ph.slice(-2)) fail_('آخر رقمين من الهاتف غير صحيحين — تأكد أن الكارت لصاحبه', 'last2');
        var need = units * S.REWARD_POINTS;
        if ((+c[CI.bal] || 0) + 1e-9 < need) fail_('رصيد الزبون لا يكفي لهذه المكافأة');
        var RV = rv_(S, c[CI.tier]);
        discount = units * RV;
        var note = units + (units > 1 ? ' هدايا' : ' هدية');
        if (discount > amount) {
          // استعمال جزء من الهدية: نخصم النقاط بقدر المبلغ المستعمل فقط، والباقي يبقى في رصيده
          discount = amount; var full = need;
          need = r1_(amount / RV * S.REWARD_POINTS);
          note = 'جزء من الهدية: ' + amount + ' دج من ' + (units * RV) + ' دج (بقي له ' + r1_(full - need) + ' نقطة)';
        }
        addLog_(ctx, id, c[CI.name], K.REDEEM, discount, -need, w.name, note, op, when);
      }
      var paid = amount - discount, parts = bonusParts_(ctx, c), pct = parts.reduce(function (a, p) { return a + p.pct; }, 0);
      var earned = r1_(paid / S.DA_PER_POINT * (1 + pct / 100));
      var note = parts.map(function (p) { return p.label + ' +' + p.pct + '%'; }).join('، ');
      if (req.note) note = (note ? note + ' — ' : '') + String(req.note);
      if (paid > 0) addLog_(ctx, id, c[CI.name], K.EARN, paid, earned, w.name, note + (req.queued ? ' (أُرسلت لاحقاً)' : ''), op, when);

      // عيد الميلاد: مرة في السنة، 3 أيام قبل أو بعد
      var b = asDate_(c[CI.birth]);
      if (b && S.BIRTHDAY_POINTS > 0) {
        var y = ctx.now.getFullYear(), bd = new Date(y, b.getMonth(), b.getDate()), diff = Math.abs((ctx.now - bd) / 864e5);
        if (diff <= 3.5 && !hasKind_(ctx, id, K.BIRTH, new Date(y, 0, 1))) {
          addLog_(ctx, id, c[CI.name], K.BIRTH, 0, S.BIRTHDAY_POINTS, w.name, 'عيد ميلاد سعيد'); extras.push('عيد ميلاد: +' + S.BIRTHDAY_POINTS);
        }
      }
      // الإحالة: تُعطى لمن أحاله عند أول طباعة
      if (c[CI.ref] && c[CI.refDone] !== 'تم' && paid > 0 && S.REFERRAL_POINTS > 0) {
        var ri = findIdx_(ctx, c[CI.ref]);
        if (ri >= 0) {
          var rc = customers_(ctx)[ri];
          addLog_(ctx, String(rc[CI.id]), rc[CI.name], K.REF, 0, S.REFERRAL_POINTS, w.name, 'أحضر الزبون ' + id + ' ' + c[CI.name]);
          refresh_(ctx, ri, w.name); extras.push(rc[CI.name] + ' حصل على ' + S.REFERRAL_POINTS + ' نقاط إحالة');
        }
        c[CI.refDone] = 'تم'; ctx.ss.getSheetByName(SH.C).getRange(idx + 2, CI.refDone + 1).setValue('تم');
      }
      // نقاط الأستاذ عن طباعة تلميذه
      if (req.teacher && paid > 0 && S.TEACHER_LINK_PER_100 > 0) {
        var ti = findRef_(ctx, req.teacher);
        if (ti < 0) extras.push('لم أجد الأستاذ ' + req.teacher + ' (لم تُضف له نقاط)');
        else if (ti === idx) extras.push('لا يمكن ربط الزبون بنفسه');
        else {
          var tc = customers_(ctx)[ti];
          if (tc[CI.type] !== 'أستاذ') extras.push(tc[CI.name] + ' ليس مسجلاً كأستاذ (لم تُضف له نقاط)');
          else {
            var tp = r1_(paid / 100 * S.TEACHER_LINK_PER_100);
            if (tp > 0) { addLog_(ctx, String(tc[CI.id]), tc[CI.name], K.TEACHER, paid, tp, w.name, 'تلميذه ' + id + ' ' + c[CI.name], '', when); refresh_(ctx, ti, w.name); extras.push('الأستاذ ' + tc[CI.name] + ': +' + tp); }
          }
        }
      }
      refresh_(ctx, idx, w.name);
      if (c[CI.tier] === GOLD && normTier_(tierBefore) !== GOLD) extras.unshift('🎉 ارتقى إلى المستوى الذهبي! أعطه البطاقة الذهبية وغيّر رقم بطاقته (المدير).');
      return { one: view_(ctx, idx, true), summary: { earned: earned, discount: discount, paid: paid, bonus: parts, extras: extras } };
    }
  },

  /** لوحة التحكم: كل الزبائن مع مستواهم ونقاطهم وما استفادوه */
  dashboard: {
    owner: true,
    run: function (ctx, req, w) {
      var c = customers_(ctx), L = logRows_(ctx), S = ctx.S, owner = w.role === OWNER;
      var used = {}, usedN = {}, month = {}, mStart = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1), givenM = 0, usedM = 0;
      L.forEach(function (r) {
        var id = String(r[LI.id]), d = asDate_(r[LI.date]), p = +r[LI.pts] || 0;
        if (r[LI.kind] === K.REDEEM) { used[id] = (used[id] || 0) + (+r[LI.amount] || 0); usedN[id] = (usedN[id] || 0) + 1; if (d >= mStart) usedM += +r[LI.amount] || 0; }
        if (d && d >= mStart) { if (r[LI.kind] === K.EARN) month[id] = (month[id] || 0) + (+r[LI.amount] || 0); if (p > 0 && r[LI.kind] !== K.EXPIRE) givenM += p; }
      });
      var rows = c.map(function (r) {
        var id = String(r[CI.id]), p = String(r[CI.phone]), bal = +r[CI.bal] || 0;
        return { id: id, name: r[CI.name], type: r[CI.type], tier: normTier_(r[CI.tier]) || SILVER, v: rv_(S, r[CI.tier]), bal: r1_(bal),
          rewards: Math.floor(bal / S.REWARD_POINTS + 1e-9), used: used[id] || 0, usedN: usedN[id] || 0, total: +r[CI.total] || 0,
          month: month[id] || 0, last: fmt_(ctx, r[CI.last]), since: fmt_(ctx, r[CI.reg]),
          phone: owner ? p : (p ? p.slice(0, 4) + '••••' + p.slice(-2) : '') };
      });
      return { rows: rows, R: S.REWARD_POINTS, V: S.REWARD_VALUE, VS: S.REWARD_VALUE_SILVER, givenM: r1_(givenM), usedM: usedM,
        ranges: cardRanges_(), nextCard: nextCard_(ctx), lastPrinted: +(PropertiesService.getScriptProperties().getProperty('LAST_CARD') || 0) };
    }
  },

  /** تجهيز أرقام بطاقات فارغة للطباعة (المالك فقط) */
  cards: {
    owner: true,
    run: function (ctx, req) {
      var n = Math.floor(+req.count || 0); if (n < 1 || n > 200) fail_('عدد البطاقات من 1 إلى 200');
      var from = nextCard_(ctx), to = from + n - 1, tier = normTier_(req.tier) === GOLD ? GOLD : SILVER;
      var props = PropertiesService.getScriptProperties();
      props.setProperty('LAST_CARD', String(to));
      var rg = cardRanges_(); rg.push({ from: from, to: to, tier: tier }); props.setProperty('CARD_RANGES', JSON.stringify(rg));
      return { from: from, to: to, tier: tier, ids: (function () { var a = []; for (var i = from; i <= to; i++) a.push(cardId_(i)); return a; })() };
    }
  },

  /** تغيير بطاقة زبون (ضاعت أو تلفت) — المالك فقط. ينقل كل السجل إلى الرقم الجديد */
  changeCard: {
    owner: true,
    run: function (ctx, req, w) {
      var idx = must_(ctx, req.id), c = customers_(ctx)[idx], old = String(c[CI.id]);
      var nid = normId_(req.card); if (!nid) fail_('رقم البطاقة الجديد غير صحيح');
      if (nid === old) fail_('هذا هو رقمه الحالي');
      if (findIdx_(ctx, nid) >= 0) fail_('البطاقة ' + nid + ' مستعملة من قبل زبون آخر');
      var shC = ctx.ss.getSheetByName(SH.C), all = customers_(ctx);
      c[CI.id] = nid; shC.getRange(idx + 2, CI.id + 1).setValue(nid);
      var nfix = cardTier_(nid) === GOLD ? GOLD : '';
      c[CI.tierFix] = nfix; shC.getRange(idx + 2, CI.tierFix + 1).setValue(nfix);
      all.forEach(function (r, i) { if (String(r[CI.ref]) === old) { r[CI.ref] = nid; shC.getRange(i + 2, CI.ref + 1).setValue(nid); } });
      var L = logRows_(ctx);
      if (L.length) {
        var col = L.map(function (r) { if (String(r[LI.id]) === old) r[LI.id] = nid; return [r[LI.id]]; });
        ctx.ss.getSheetByName(SH.L).getRange(2, LI.id + 1, col.length, 1).setValues(col);
      }
      addLog_(ctx, nid, c[CI.name], K.MANUAL, 0, 0, w.name, 'تغيير البطاقة من ' + old + ' إلى ' + nid + (nfix ? ' (' + nfix + ')' : ''));
      refresh_(ctx, idx, w.name);
      return { one: view_(ctx, idx, true) };
    }
  },

  /** قائمة العمال ورموزهم (المدير فقط) */
  workers: {
    owner: true,
    run: function (ctx) {
      var st = workerStats_(ctx, monthStart_(ctx));
      return { rows: ctx.ss.getSheetByName(SH.W).getDataRange().getValues().slice(1).filter(function (r) { return String(r[0]).trim(); })
        .map(function (r) { var n = String(r[0]).trim(), x = st[n] || blankStat_(); return { name: n, pin: String(r[1]).trim(), admin: isAdmin_(r[2]), active: String(r[3]).trim() !== 'لا', score: x.score, reg: x.reg, txn: x.txn, ret: x.ret }; }) };
    }
  },

  /** الأجهزة المسموح لها (المدير فقط) */
  devices: {
    owner: true,
    run: function (ctx, req) {
      var dt_ = function (d) { return d instanceof Date ? Utilities.formatDate(d, ctx.tz, 'yyyy-MM-dd HH:mm') : ''; };
      return { rows: devices_(ctx).map(function (r) {
        return { key: String(r[DI.key]), name: String(r[DI.name]), code: String(r[DI.code]), st: String(r[DI.st]).trim(), by: String(r[DI.by]),
          at: dt_(r[DI.at]), last: dt_(r[DI.last]), me: String(r[DI.key]) === String(req.dev) };
      }) };
    }
  },
  /** اعتماد جهاز أو إيقافه أو حذفه أو تغيير اسمه (المدير فقط) */
  deviceSave: {
    owner: true,
    run: function (ctx, req) {
      var D = devices_(ctx), i = devFind_(D, String(req.key || '')), sh = devSheet_(ctx.ss);
      if (i < 0) fail_('الجهاز غير موجود');
      if (String(req.key) === String(req.dev) && req.op !== 'name') fail_('لا يمكنك إيقاف أو حذف الجهاز الذي تستعمله الآن');
      if (req.op === 'ok') sh.getRange(i + 2, DI.st + 1).setValue(DEV_OK);
      else if (req.op === 'off') sh.getRange(i + 2, DI.st + 1).setValue(DEV_OFF);
      else if (req.op === 'del') sh.deleteRow(i + 2);
      else if (req.op === 'name') { var nm = String(req.name || '').replace(/[<>=+@]/g, '').trim().slice(0, 40); if (nm.length < 2) fail_('اكتب اسم الجهاز'); sh.getRange(i + 2, DI.name + 1).setValue(nm); }
      else fail_('عملية غير معروفة');
      return API.devices.run(ctx, req);
    }
  },

  /** ملف العامل: نقاطه وتقييمه هذا الشهر */
  me: {
    run: function (ctx, req, w) {
      var S = ctx.S, m = workerStats_(ctx, monthStart_(ctx)), all = workerStats_(ctx, null);
      var names = ctx.ss.getSheetByName(SH.W).getDataRange().getValues().slice(1)
        .filter(function (r) { return String(r[0]).trim() && String(r[3]).trim() !== 'لا' && !isAdmin_(r[2]); }).map(function (r) { return String(r[0]).trim(); }); // ترتيب العمال فقط (بدون المدير)
      var board = names.map(function (n) { return { name: n, score: (m[n] || blankStat_()).score }; }).sort(function (a, b) { return b.score - a.score; });
      var rank = 1 + board.findIndex(function (b) { return b.name === w.name; });
      var L = logRows_(ctx), recent = [];
      for (var i = L.length - 1; i >= 0 && recent.length < 10; i--) if (L[i][LI.worker] === w.name && (L[i][LI.kind] === K.EARN || L[i][LI.kind] === K.WELCOME || L[i][LI.kind] === K.REDEEM))
        recent.push({ d: fmt_(ctx, L[i][LI.date]), k: L[i][LI.kind] === K.WELCOME ? 'زبون جديد' : L[i][LI.kind], n: L[i][LI.name], a: +L[i][LI.amount] || 0 });
      return { name: w.name, role: w.role, month: m[w.name] || blankStat_(), all: all[w.name] || blankStat_(), rank: rank, of: board.length,
        top: board.slice(0, 3), rules: { reg: S.WORKER_PTS_NEW, txn: S.WORKER_PTS_TXN, ret: S.WORKER_PTS_RETURN }, recent: recent };
    }
  },

  /** تعديل بيانات زبون: الاسم، الهاتف، النوع (المدير فقط) */
  editCustomer: {
    owner: true,
    run: function (ctx, req, w) {
      var idx = must_(ctx, req.id), c = customers_(ctx)[idx], all = customers_(ctx);
      var name = String(req.name || '').trim(), phone = normPhone_(req.phone), type = TYPES.indexOf(req.type) >= 0 ? req.type : c[CI.type];
      if (name.length < 2) fail_('اكتب اسم الزبون');
      if (phone && !/^0[5-7]\d{8}$/.test(phone) && !/^0[2-4]\d{7,8}$/.test(phone)) fail_('رقم الهاتف غير صحيح');
      if (phone) for (var i = 0; i < all.length; i++) if (i !== idx && String(all[i][CI.phone]) === phone) fail_('هذا الرقم مسجل باسم: ' + all[i][CI.name]);
      var fix = normTier_(req.tierFix) === GOLD ? GOLD : (req.tierFix ? SILVER : '');
      c[CI.name] = name; c[CI.phone] = phone; c[CI.type] = type; c[CI.tierFix] = fix;
      var shC = ctx.ss.getSheetByName(SH.C);
      shC.getRange(idx + 2, CI.name + 1, 1, 3).setValues([[name, phone, type]]);
      shC.getRange(idx + 2, CI.tierFix + 1).setValue(fix);
      refresh_(ctx, idx, w.name);
      return { one: view_(ctx, idx, true) };
    }
  },

  /** إضافة عامل أو تعديله (المدير فقط) */
  workerSave: {
    owner: true,
    run: function (ctx, req, w) {
      var sh = ctx.ss.getSheetByName(SH.W), data = sh.getDataRange().getValues();
      var name = String(req.name || '').trim(), pin = String(req.wpin || '').trim(), orig = String(req.orig || '').trim();
      if (name.length < 2) fail_('اكتب اسم العامل');
      if (!/^\d{4}$/.test(pin)) fail_('الرمز السري 4 أرقام');
      var row = -1;
      for (var i = 1; i < data.length; i++) {
        var n = String(data[i][0]).trim();
        if (orig && n === orig) row = i;
        else if (n === name) fail_('يوجد عامل بنفس الاسم');
        if (n && n !== orig && String(data[i][1]).trim() === pin) fail_('هذا الرمز مستعمل لعامل آخر، اختر رمزاً مختلفاً');
      }
      if (orig && row < 0) fail_('العامل غير موجود');
      var admin = !!req.admin, active = req.active !== false;
      if (orig === w.name && (!admin || !active)) fail_('لا يمكنك إيقاف حسابك أو إزالة صلاحية المدير عن نفسك');
      var vals = [[name, pin, admin ? OWNER : 'عامل', active ? 'نعم' : 'لا']];
      if (row >= 0) sh.getRange(row + 1, 1, 1, 4).setValues(vals); else sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues(vals);
      return API.workers.run(ctx, req, w);
    }
  },

  /** مكافأة متابعة الصفحة (مرة واحدة) أو تعديل يدوي (المالك فقط) */
  bonus: {
    run: function (ctx, req, w) {
      var idx = must_(ctx, req.id), c = customers_(ctx)[idx], id = String(c[CI.id]);
      refresh_(ctx, idx, w.name);
      if (req.kind === 'follow') {
        if (hasKind_(ctx, id, K.FOLLOW)) fail_('أخذ هذا الزبون نقاط متابعة الصفحة من قبل');
        addLog_(ctx, id, c[CI.name], K.FOLLOW, 0, ctx.S.FOLLOW_POINTS, w.name, '', req.opId);
      } else if (req.kind === 'manual') {
        if (w.role !== OWNER) fail_('التعديل اليدوي لصاحب المحل فقط');
        var p = r1_(+req.points || 0); if (!p) fail_('اكتب عدد النقاط (+ أو −)');
        if (!String(req.note || '').trim()) fail_('اكتب سبب التعديل');
        if ((+c[CI.bal] || 0) + p < 0) fail_('الرصيد لا يمكن أن يصبح أقل من 0');
        addLog_(ctx, id, c[CI.name], K.MANUAL, 0, p, w.name, String(req.note), req.opId);
      } else fail_('نوع غير معروف');
      refresh_(ctx, idx, w.name);
      return { one: view_(ctx, idx, true) };
    }
  }
};
function cardId_(n) { return 'OS-' + ('0000' + n).slice(-Math.max(4, String(n).length)); }
function maxCard_(ctx) { var max = 0; customers_(ctx).forEach(function (r) { var m = String(r[CI.id]).match(/(\d+)$/); if (m) max = Math.max(max, +m[1]); }); return max; }
/** أول رقم بطاقة غير مستعمل وغير مطبوع مسبقاً */
function nextCard_(ctx) { return Math.max(maxCard_(ctx), +(PropertiesService.getScriptProperties().getProperty('LAST_CARD') || 0)) + 1; }

function monthStart_(ctx) { return new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1); }
function blankStat_() { return { reg: 0, txn: 0, amt: 0, ret: 0, red: 0, score: 0 }; }
/** إحصائيات العمال: زبائن جدد، عمليات بالبطاقة، زبائن رجعوا، والنقاط */
function workerStats_(ctx, from) {
  var S = ctx.S, L = logRows_(ctx), c = customers_(ctx), st = {}, earns = {};
  function g(n) { n = String(n || '').trim(); if (!st[n]) st[n] = blankStat_(); return st[n]; }
  L.forEach(function (r) {
    var d = asDate_(r[LI.date]), id = String(r[LI.id]);
    if (r[LI.kind] === K.EARN) (earns[id] = earns[id] || []).push(d);
    if (from && (!d || d < from)) return;
    if (r[LI.kind] === K.EARN) { var x = g(r[LI.worker]); x.txn++; x.amt += +r[LI.amount] || 0; }
    else if (r[LI.kind] === K.WELCOME) g(r[LI.worker]).reg++;
    else if (r[LI.kind] === K.REDEEM) g(r[LI.worker]).red++;
  });
  c.forEach(function (r) {
    var e = (earns[String(r[CI.id])] || []).filter(Boolean).sort(function (a, b) { return a - b; });
    if (e.length >= 2 && (!from || e[1] >= from) && r[CI.by]) g(r[CI.by]).ret++;
  });
  Object.keys(st).forEach(function (n) { var x = st[n]; x.score = Math.round(x.reg * S.WORKER_PTS_NEW + x.txn * S.WORKER_PTS_TXN + x.ret * S.WORKER_PTS_RETURN); });
  return st;
}

/** قيمة الهدية حسب المستوى */
function rv_(S, tier) { return normTier_(tier) === GOLD ? S.REWARD_VALUE : (S.REWARD_VALUE_SILVER || S.REWARD_VALUE); }
function cardRanges_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('CARD_RANGES') || '[]'); } catch (e) { return []; } }
/** لون البطاقة المطبوعة لهذا الرقم (حسب دفعة الطباعة) */
function cardTier_(id) {
  var m = String(id).match(/(\d+)$/), n = m ? +m[1] : 0, rg = cardRanges_();
  for (var i = rg.length - 1; i >= 0; i--) if (n >= rg[i].from && n <= rg[i].to) return normTier_(rg[i].tier);
  return '';
}

function findRef_(ctx, q) {
  var i = findIdx_(ctx, q); if (i >= 0) return i;
  var ph = normPhone_(q), c = customers_(ctx);
  if (ph.length >= 9) for (var j = 0; j < c.length; j++) if (String(c[j][CI.phone]) === ph) return j;
  return -1;
}

// ============================================================
// صيانة وتقارير
// ============================================================
function expireAll() {
  var ctx = ctx_(), c = customers_(ctx);
  for (var i = 0; i < c.length; i++) refresh_(ctx, i, 'النظام');
}

function updateReports() {
  var ctx = ctx_(), sh = ctx.ss.getSheetByName(SH.R) || ctx.ss.insertSheet(SH.R), S = ctx.S;
  var c = customers_(ctx), L = logRows_(ctx), now = ctx.now;
  var mStart = new Date(now.getFullYear(), now.getMonth(), 1), monthName = Utilities.formatDate(now, ctx.tz, 'yyyy-MM');
  var spend = {}, given = 0, used = 0, usedDa = 0, expired = 0, workers = {}, kinds = {};
  L.forEach(function (r) {
    var d = asDate_(r[LI.date]); if (!d || d < mStart) return;
    var p = +r[LI.pts] || 0, id = String(r[LI.id]);
    if (r[LI.kind] === K.EARN) spend[id] = (spend[id] || 0) + (+r[LI.amount] || 0);
    if (r[LI.kind] === K.REDEEM) { used += -p; usedDa += +r[LI.amount] || 0; }
    else if (r[LI.kind] === K.EXPIRE) expired += -p;
    else if (p > 0) given += p;
    kinds[r[LI.kind]] = (kinds[r[LI.kind]] || 0) + 1;
    var wk = r[LI.worker] || '—'; workers[wk] = workers[wk] || { n: 0, reg: 0, da: 0 };
    if (r[LI.kind] === K.EARN) { workers[wk].n++; workers[wk].da += +r[LI.amount] || 0; }
    if (r[LI.kind] === K.WELCOME) workers[wk].reg++;
  });
  var byId = {}; c.forEach(function (r) { byId[String(r[CI.id])] = r; });
  var top = Object.keys(spend).sort(function (a, b) { return spend[b] - spend[a]; }).slice(0, 10);
  var cut = new Date(now.getTime() - 30 * 864e5);
  var away = c.filter(function (r) { var d = asDate_(r[CI.last]); return (+r[CI.bal] || 0) > 0 && (!d || d < cut); })
    .sort(function (a, b) { return (+b[CI.bal] || 0) - (+a[CI.bal] || 0); }).slice(0, 30);
  var open = c.reduce(function (a, r) { return a + (+r[CI.bal] || 0); }, 0);
  var tiers = {}; TIERS.forEach(function (t) { tiers[t] = 0; }); c.forEach(function (r) { tiers[normTier_(r[CI.tier]) || SILVER]++; });
  var types = {}; c.forEach(function (r) { types[r[CI.type]] = (types[r[CI.type]] || 0) + 1; });

  var out = [];
  var H = function (t) { out.push(['■ ' + t, '', '', '', '']); };
  var B = function () { out.push(['', '', '', '', '']); };
  out.push(['تقرير نظام النقاط — شهر ' + monthName, '', '', 'آخر تحديث:', Utilities.formatDate(now, ctx.tz, 'yyyy-MM-dd HH:mm')]); B();
  H('ملخص الشهر');
  out.push(['النقاط الموزعة', r1_(given), '', 'تكلفتها القصوى إذا استُبدلت كلها (دج)', Math.round(given / S.REWARD_POINTS * S.REWARD_VALUE)]);
  out.push(['النقاط المستبدلة', r1_(used), '', 'قيمة الطباعة المجانية المقدمة (دج)', usedDa]);
  out.push(['النقاط المنتهية', r1_(expired), '', 'مجموع الطباعة المسجلة (دج)', Object.keys(spend).reduce(function (a, k) { return a + spend[k]; }, 0)]);
  var openDa = c.reduce(function (a, r) { return a + (+r[CI.bal] || 0) / S.REWARD_POINTS * rv_(S, r[CI.tier]); }, 0);
  out.push(['النقاط غير المستعملة عند كل الزبائن', r1_(open), '', 'قيمتها (دج)', Math.round(openDa)]);
  out.push(['عدد الزبائن المسجلين', c.length, '', 'تلاميذ / أساتذة / عاديون', (types['تلميذ'] || 0) + ' / ' + (types['أستاذ'] || 0) + ' / ' + (types['زبون عادي'] || 0)]);
  out.push(['فضي / ذهبي', tiers[SILVER] + ' / ' + tiers[GOLD], '', '', '']); B();
  H('أفضل 10 زبائن هذا الشهر (مرشحون لـ"زبون الشهر")');
  out.push(['الترتيب', 'رقم الكارت', 'الاسم', 'النوع', 'الطباعة (دج)']);
  top.forEach(function (id, i) { var r = byId[id] || []; out.push([i + 1, id, r[CI.name] || '', r[CI.type] || '', spend[id]]); });
  if (!top.length) out.push(['لا توجد عمليات بعد', '', '', '', '']); B();
  H('زبائن لديهم نقاط ولم يأتوا منذ أكثر من 30 يوماً (اتصلوا بهم بعرض)');
  out.push(['رقم الكارت', 'الاسم', 'الهاتف', 'الرصيد', 'آخر زيارة']);
  away.forEach(function (r) { out.push([r[CI.id], r[CI.name], "'" + r[CI.phone], +r[CI.bal] || 0, fmt_(ctx, r[CI.last]) || '—']); });
  if (!away.length) out.push(['لا يوجد', '', '', '', '']); B();
  H('العمال هذا الشهر');
  out.push(['العامل', 'عمليات الطباعة', 'مبلغ الطباعة (دج)', 'زبائن سجلهم', '']);
  Object.keys(workers).forEach(function (k) { out.push([k, workers[k].n, workers[k].da, workers[k].reg, '']); });

  sh.clear(); sh.setRightToLeft(true);
  sh.getRange(1, 1, out.length, 5).setValues(out);
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor('#1E3A8A');
  out.forEach(function (r, i) { if (String(r[0]).indexOf('■') === 0) sh.getRange(i + 1, 1, 1, 5).setBackground('#DBEAFE').setFontWeight('bold'); });
  sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 120); sh.setColumnWidth(3, 160); sh.setColumnWidth(4, 230); sh.setColumnWidth(5, 140);
}
