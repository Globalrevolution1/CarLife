// =============================================================
// VEHICLE HEALTH ENGINE
// =============================================================
// منبع حقیقت واحد برای منطق Maintenance / Health کارنگار.
//
// قبلاً این منطق در سه فایل جداگانه کپی شده بود:
//   - CarProfile.jsx      (normalizeServiceTitle / getTemplateStatus / getOverallHealth)
//   - AddService.jsx      (normalizeTitle / getLastService)
//   - OwnerDashboard.jsx  (getHealth با آستانه‌های هاردکد 9000/7000)
//
// این فایل همهٔ آن‌ها را در یک جا جمع می‌کند.
//
// قوانینی که عمداً حفظ شده‌اند (Regression-sensitive):
//
//   1. «هنوز ثبت نشده» (بدون سابقه) با «عقب‌افتاده» فرق دارد.
//      نبودِ سابقه Overdue نیست و امتیاز سلامت را کم نمی‌کند.
//
//   2. تطبیق سرویس با template بر اساس Equality دقیق روی
//      عنوان نرمال‌شده است، نه includes.
//      بنابراین «تعویض روغن» با «تعویض روغن گیربکس» اشتباه
//      Match نمی‌شود.
//
//   3. «تعویض روغن موتور» و «تعویض روغن» یک سرویس حساب می‌شوند.
//
//   4. آخرین سرویس = بیشترین کیلومتر؛ در تساوی کیلومتر، جدیدترین تاریخ.
//
// این فایل Pure است: نه React، نه Supabase، نه I/O.
// قابل تست واحد و قابل استفاده در هر لایه.
// =============================================================

/**
 * کاراکتر نامرئی ZWNJ که در متن فارسی دیتابیس دیده می‌شود
 * و باعث می‌شود دو عنوان یکسان متفاوت به نظر برسند.
 */
const ZWNJ_PATTERN = /‌/g;

/**
 * حذف پسوند «موتور» از انتهای عنوان سرویس.
 *
 * «تعویض روغن موتور»  →  «تعویض روغن»
 * «تعویض روغن گیربکس» →  دست‌نخورده (چون «موتور» ندارد)
 */
const MOTOR_SUFFIX_PATTERN = /\s+موتور$/g;

/**
 * هم‌معنی‌های عنوان سرویس.
 *
 * کلیدها دقیقاً همان شکلی هستند که بعد از نرمال‌سازی بالا ساخته
 * می‌شوند: کوچک، بدون ZWNJ، بدون پسوند «موتور» و فشرده.
 *
 * دلیل وجود این نقشه:
 *   - دادهٔ قدیمی (migration 011) و سرویس‌های ثبت‌شدهٔ کاربر با
 *     «تعویض …» نوشته شده‌اند،
 *   - ولی کاتالوگ بازار (migration 017) نام کوتاه استاندارد را دارد.
 *
 * بدون این نقشه، «تعویض روغن گیربکس» و «روغن گیربکس» دو ردیف جدا
 * در برنامهٔ نگهداری و فرم ثبت سرویس می‌ساختند و امتیاز سلامت دو
 * بار حساب می‌شد.
 *
 * نکته: «تعویض روغن موتور» و «تعویض روغن» عمداً از مسیر دیگری
 * (حذف پسوند «موتور») یکی می‌شوند و در این نقشه نیستند.
 */
const SERVICE_TITLE_ALIASES = {
  "تعویض روغن گیربکس": "روغن گیربکس",
  "تعویض روغن واسکازین": "روغن گیربکس",
  "واسکازین": "روغن گیربکس",
  "تعویض فیلتر هوا": "فیلتر هوا",
  "تعویض فیلتر روغن": "فیلتر روغن",
  "تعویض فیلتر کابین": "فیلتر کابین",
  "تعویض فیلتر بنزین": "فیلتر بنزین",
  "تعویض روغن ترمز": "روغن ترمز",
  "تعویض ضد یخ": "ضد یخ",
  "تعویض شمع": "شمع",
  "شمع ها": "شمع",
  "تعویض تسمه تایم": "تسمه تایم",
  "تسمه تایمینگ": "تسمه تایم",
  "تعویض لنت ترمز جلو": "لنت ترمز جلو",
  "تعویض لنت ترمز عقب": "لنت ترمز عقب",
  "تعویض باتری": "باتری",
  "باتری ماشین": "باتری",
  "لاستیک": "تعویض لاستیک",
  "تایر": "تعویض لاستیک",
};

/**
 * نرمال‌سازی عنوان سرویس برای تطبیق.
 *
 * @param {string | null | undefined} title
 * @returns {string}
 */
export function normalizeServiceTitle(title) {
  if (!title) {
    return "";
  }

  let value = String(title)
    .trim()
    .toLowerCase()
    .replace(ZWNJ_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  value = value.replace(MOTOR_SUFFIX_PATTERN, "").trim();

  return SERVICE_TITLE_ALIASES[value] ?? value;
}

/**
 * آیا عنوان یک سرویس با عنوان یک template یکی است؟
 *
 * عمداً از includes استفاده نمی‌شود تا «تعویض روغن» با
 * «تعویض روغن گیربکس» اشتباه گرفته نشود.
 *
 * @param {string | null | undefined} serviceTitle
 * @param {string | null | undefined} templateTitle
 * @returns {boolean}
 */
export function serviceTitleMatches(serviceTitle, templateTitle) {
  const serviceName = normalizeServiceTitle(serviceTitle);
  const templateName = normalizeServiceTitle(templateTitle);

  if (!serviceName || !templateName) {
    return false;
  }

  return serviceName === templateName;
}

/**
 * تبدیل امن هر چیزی به عدد، با مقدار پیش‌فرض.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toNumber(value, fallback = 0) {
  const parsed = Number(value);

  if (value === null || value === undefined || value === "" || Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

/**
 * زمان مرجع یک سرویس: service_date و در نبود آن created_at.
 *
 * @param {object} service
 * @returns {number}
 */
function serviceTimestamp(service) {
  return new Date(service?.service_date || service?.created_at || 0).getTime();
}

/**
 * آخرین سرویس مرتبط با یک template.
 *
 * اولویت اول: کیلومتر بیشتر.
 * در تساوی کیلومتر: تاریخ جدیدتر.
 *
 * @param {object | null | undefined} template
 * @param {Array<object>} services
 * @returns {object | null}
 */
export function getLastServiceForTemplate(template, services) {
  if (!template || !Array.isArray(services) || services.length === 0) {
    return null;
  }

  const matching = services.filter((service) =>
    serviceTitleMatches(service?.title, template?.service_name),
  );

  if (matching.length === 0) {
    return null;
  }

  const sorted = [...matching].sort((a, b) => {
    const mileageA = toNumber(a?.mileage);
    const mileageB = toNumber(b?.mileage);

    if (mileageA !== mileageB) {
      return mileageB - mileageA;
    }

    return serviceTimestamp(b) - serviceTimestamp(a);
  });

  return sorted[0];
}

/**
 * میلیومتر سرویس بعدی.
 *
 * nextDue = lastMileage + intervalKm
 *
 * اگر سابقه‌ای نباشد یا interval معتبر نباشد، null برمی‌گرداند.
 *
 * @param {object | null} lastService
 * @param {number} intervalKm
 * @returns {number | null}
 */
export function getNextDueMileage(lastService, intervalKm) {
  if (!lastService) {
    return null;
  }

  const interval = toNumber(intervalKm);

  if (interval <= 0) {
    return null;
  }

  return toNumber(lastService?.mileage) + interval;
}

/**
 * آستانهٔ «نزدیک موعد» بر حسب کیلومتر.
 * زیر این مقدار وضعیت warning می‌گیرد.
 */
export const NEAR_DUE_THRESHOLD_KM = 1000;

/**
 * آستانهٔ «نزدیک موعد» بر حسب روز.
 * زیر این مقدار وضعیت warning می‌گیرد.
 */
export const NEAR_DUE_THRESHOLD_DAYS = 30;

/**
 * میانگین مسیر روزانهٔ یک خودروی شخصی (کیلومتر در روز).
 *
 * فقط برای «مقایسهٔ اولویت» بین دو مبنا (کیلومتر و روز) به کار
 * می‌رود تا فهرست «سرویس بعدی» مرتب بماند. در تعیینِ وضعیت
 * هیچ استفاده‌ای از این عدد نمی‌شود؛ هر مبنا جداگانه سنجیده می‌شود.
 */
const KM_PER_DAY_ASSUMED = 20;

const MS_PER_DAY = 86400000;

/**
 * شدت وضعیت، برای انتخاب بدترین مبنا.
 */
const SEVERITY = {
  good: 1,
  warning: 2,
  danger: 3,
};

/**
 * افزودن ماه به یک تاریخ، بدون لغزش روز.
 *
 * ۳۱ مارس + ۱ ماه → ۳۰ آوریل (آوریل ۳۰ روزه)
 * ۳۱ مارس + ۲ ماه → ۳۱ مه     (مه ۳۱ روزه، روز حفظ می‌شود)
 * ۲۹ فوریهٔ کبیسه + ۱۲ ماه → ۲۸ فوریه
 *
 * عمداً با متد‌های UTC کار می‌کند: service_date از دیتابیس به
 * صورت رشتهٔ ISO می‌آید و با parse شدن UTC می‌شود. اگر اینجا از
 * متد محلی استفاده می‌شد، در منطقهٔ ساعتی مختلف (مثل ایران
 * UTC+3:30) شمارش روز یکی دو روز جابه‌جا می‌شد.
 *
 * @param {Date} date
 * @param {number} months
 * @returns {Date}
 */
export function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(day, lastDayOfMonth));

  return result;
}

/**
 * سنجش صِرفاً بر مبنای کیلومتر.
 *
 * @returns {object | null} null یعنی این مبنا برای این template تعریف نشده
 */
function evaluateByKm(odometer, lastService, intervalKm, formatNumber) {
  if (intervalKm <= 0) {
    return null;
  }

  const lastMileage = toNumber(lastService?.mileage);
  const nextMileage = lastMileage + intervalKm;
  const remaining = nextMileage - odometer;

  if (remaining < 0) {
    const overdueBy = Math.abs(remaining);

    return {
      status: "danger",
      label: `${formatNumber(overdueBy)} km عقب‌افتاده`,
      nextMileage,
      remaining,
      overdueBy,
      score: 50,
    };
  }

  if (remaining === 0) {
    return {
      status: "danger",
      label: "موعد سرویس رسیده",
      nextMileage,
      remaining,
      overdueBy: 0,
      score: 50,
    };
  }

  if (remaining <= NEAR_DUE_THRESHOLD_KM) {
    return {
      status: "warning",
      label: `${formatNumber(remaining)} km دیگر`,
      nextMileage,
      remaining,
      overdueBy: 0,
      score: 80,
    };
  }

  return {
    status: "good",
    label: `${formatNumber(remaining)} km دیگر`,
    nextMileage,
    remaining,
    overdueBy: 0,
    score: 100,
  };
}

/**
 * سنجش صرفاً بر مبنای زمان (ماه).
 *
 * مرجعِ «آخرین سرویس» همان تاریخی است که برای همان سرویس ثبت
 * شده (service_date و در نبودش created_at)؛ نه تاریخِ ثبتِ خودرو.
 *
 * @returns {object | null} null یعنی ماه تعریف نشده، تاریخ معتبر
 *                          نیست، یا currentDate پاس نشده
 */
function evaluateByTime(currentDate, lastService, intervalMonths, formatNumber) {
  if (intervalMonths <= 0 || !currentDate) {
    return null;
  }

  const lastMs = serviceTimestamp(lastService);

  if (!lastMs) {
    return null;
  }

  const nowMs = new Date(currentDate).getTime();

  if (Number.isNaN(nowMs)) {
    return null;
  }

  const nextDate = addMonths(new Date(lastMs), intervalMonths);
  const daysLeft = Math.ceil((nextDate.getTime() - nowMs) / MS_PER_DAY);

  if (daysLeft < 0) {
    const overdueByDays = Math.abs(daysLeft);

    return {
      status: "danger",
      label: `${formatNumber(overdueByDays)} روز عقب‌افتاده`,
      nextDate,
      daysLeft,
      overdueByDays,
      score: 50,
    };
  }

  if (daysLeft === 0) {
    return {
      status: "danger",
      label: "موعد سرویس رسیده",
      nextDate,
      daysLeft,
      overdueByDays: 0,
      score: 50,
    };
  }

  if (daysLeft <= NEAR_DUE_THRESHOLD_DAYS) {
    return {
      status: "warning",
      label: `${formatNumber(daysLeft)} روز دیگر`,
      nextDate,
      daysLeft,
      overdueByDays: 0,
      score: 80,
    };
  }

  return {
    status: "good",
    label: `${formatNumber(daysLeft)} روز دیگر`,
    nextDate,
    daysLeft,
    overdueByDays: 0,
    score: 100,
  };
}

/**
 * ادغام نتیجهٔ دو مبنا: هر کدام زودتر برسد، تعیین‌کننده است.
 *
 * اگر فقط یک مبنا تعریف شده باشد، همان حاکم است و خروجی دقیقاً
 * همان شکل قدیمی (کیلومتر-محور) را دارد.
 */
function mergeEvaluations(km, time, lastService) {
  const available = [km, time].filter(Boolean);

  if (available.length === 0) {
    return {
      status: "unknown",
      label: "فاصله سرویس مشخص نیست",
      nextMileage: null,
      remaining: null,
      overdueBy: null,
      nextDate: null,
      daysLeft: null,
      overdueByDays: null,
      lastService,
      score: null,
    };
  }

  const worst = available.reduce((a, b) =>
    SEVERITY[b.status] > SEVERITY[a.status] ? b : a,
  );

  return {
    status: worst.status,
    label: worst.label,
    nextMileage: km?.nextMileage ?? null,
    remaining: km?.remaining ?? null,
    overdueBy: km?.overdueBy ?? null,
    nextDate: time?.nextDate ?? null,
    daysLeft: time?.daysLeft ?? null,
    overdueByDays: time?.overdueByDays ?? null,
    lastService,
    score: worst.score,
  };
}

/**
 * «سرویس بعدی» چقدر نزدیک است، در مقیاس کیلومتر.
 *
 * فقط برای مرتب‌سازی فهرست‌هاست؛ عددِ مخلوطِ واحد است ولی چون
 * هر دو «چقدر مانده» را می‌سنجند، کوچک‌تر = فوری‌تر.
 */
function urgencyOf(item) {
  const remaining = item?.status?.remaining;
  const daysLeft = item?.status?.daysLeft;

  const byKm = remaining === null || remaining === undefined
    ? Infinity
    : remaining;

  const byDays =
    daysLeft === null || daysLeft === undefined
      ? Infinity
      : daysLeft * KM_PER_DAY_ASSUMED;

  return Math.min(byKm, byDays);
}

/**
 * وضعیت یک template در برابر کیلومتر فعلی و تاریخ امروز.
 *
 * هر template می‌تواند یک یا هر دو مبنا را داشته باشد:
 *   interval_km     ← «هر ۱۰,۰۰۰ کیلومتر»
 *   interval_months ← «هر ۶ ماه»
 *
 * وضعیتِ نهایی، بدترینِ دو مبناست. اگر فقط یکی تعریف شده باشد،
 * رفتار دقیقاً همان گذشته است (کیلومتر-محور).
 *
 * خروجی:
 *   status: 'unknown' | 'danger' | 'warning' | 'good'
 *   score : null (نمره‌ای ندارد) | 50 | 80 | 100
 *
 * score برای سرویس ثبت‌نشده عمداً null است تا در Health Score
 * وزن نداشته باشد.
 *
 * @param {object}   params
 * @param {object}   params.template
 * @param {Array}    params.services
 * @param {number}   params.currentMileage
 * @param {Date | string | number} [params.currentDate] اگر پاس نشود، مبناِ زمان سنجیده نمی‌شود
 * @param {Function} [params.formatNumber]
 * @returns {{
 *   status: string,
 *   label: string,
 *   nextMileage: number | null,
 *   remaining: number | null,
 *   overdueBy: number | null,
 *   nextDate: Date | null,
 *   daysLeft: number | null,
 *   overdueByDays: number | null,
 *   lastService: object | null,
 *   score: number | null,
 * }}
 */
export function getTemplateStatus({
  template,
  services = [],
  currentMileage = 0,
  currentDate = null,
  formatNumber = defaultFormatNumber,
}) {
  const odometer = toNumber(currentMileage);
  const intervalKm = toNumber(template?.interval_km);
  const intervalMonths = toNumber(template?.interval_months);

  const lastService = getLastServiceForTemplate(template, services);

  // ---- NO HISTORY → «هنوز ثبت نشده»، نه Overdue ----

  if (!lastService) {
    return {
      status: "unknown",
      label: "هنوز ثبت نشده",
      nextMileage: null,
      remaining: null,
      overdueBy: null,
      nextDate: null,
      daysLeft: null,
      overdueByDays: null,
      lastService: null,
      score: null,
    };
  }

  // ---- هیچ مبنایی تعریف نشده ----

  if (intervalKm <= 0 && intervalMonths <= 0) {
    return {
      status: "unknown",
      label: "فاصله سرویس مشخص نیست",
      nextMileage: null,
      remaining: null,
      overdueBy: null,
      nextDate: null,
      daysLeft: null,
      overdueByDays: null,
      lastService,
      score: null,
    };
  }

  return mergeEvaluations(
    evaluateByKm(odometer, lastService, intervalKm, formatNumber),
    evaluateByTime(currentDate, lastService, intervalMonths, formatNumber),
    lastService,
  );
}

/**
 * نرمال‌سازی برچسب برند / مدل برای تطبیق.
 *
 * کاربر برند و مدل را متن آزاد تایپ می‌کند («پژو»، «پژو »، «PEUGEOT»،
 * «ایران‌خودرو» با نیم‌فاصله یا «ایران خودرو» بی‌نیم‌فاصله).
 * بدون این نرمال‌سازی، تفاوت‌های جزئی باعث می‌شد هیچ template ای
 * پیدا نشود و برنامهٔ نگهداری خالی بماند.
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function normalizeLabel(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(ZWNJ_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * حذف سرویس‌های تکراری از یک فهرست template.
 *
 * کلید تطبیق همان نرمال‌سازی عنوان سرویس است که موتور سلامت
 * استفاده می‌کند (پس «تعویض روغن موتور» و «تعویض روغن» یکی
 * شمرده می‌شوند). بدون این، وقتی fallback به کلِ برند می‌رویم
 * «روغن گیربکس پژو پارس» و «روغن گیربکس پژو ۴۰۵» هر دو در فهرست
 * می‌آیند و امتیاز سلامت دو بار حساب می‌شود.
 *
 * اولین ردیف برنده می‌شود؛ چون خروجی کوئری‌ها بر اساس interval
 * مرتب است، پایین‌ترین اینترکول حفظ می‌شود (جنبهٔ امن).
 *
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
function dedupeByServiceName(rows) {
  const seen = new Set();
  const result = [];

  rows.forEach((row) => {
    const key = normalizeServiceTitle(row?.service_name);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(row);
  });

  return result;
}

/**
 * حذف تکراری‌ها با ترجیح ردیفِ مدلِ دقیق.
 *
 * جدول سه لایه است:
 *   عمومی  (brand خالی)      ← برای همه
 *   برند   (model خالی)      ← برای هر مدلِ همان برند
 *   مدل    (brand + model)   ← فقط همان خودرو
 *
 * وقتی خودرو مدلش ثبت است، فیلتر «exact» هم ردیف‌های مدلِ دقیق
 * را نگه می‌دارد هم ردیف‌های برندی. اگر هر دو «شمع» داشته باشند
 * (مدل ۵۰,۰۰۰ و برند ۶۰,۰۰۰) بدون این تابع هر دو در فهرست
 * می‌آمدند: سرویس در فرم ثبت دو بار نشان داده می‌شد و امتیاز
 * سلامت دو بار حساب می‌شد.
 *
 * برندهٔ قطعی ردیفی است که model دقیقاً با مدل خودرو یکی باشد؛
 * ردیف برندی فقط وقتی برنده می‌شود که همان سرویس برای این مدل
 * ردیف اختصاصی نداشته باشد.
 *
 * @param {Array<object>} rows
 * @param {string} model  مدل نرمال‌شدهٔ خودرو (ممکن است خالی باشد)
 * @returns {Array<object>}
 */
function dedupePreferExactModel(rows, model) {
  const chosen = new Map();

  rows.forEach((row) => {
    const key = normalizeServiceTitle(row?.service_name);

    if (!key) {
      return;
    }

    const isExact = Boolean(model) && normalizeLabel(row?.model) === model;
    const existing = chosen.get(key);

    if (!existing || (isExact && !existing.isExact)) {
      chosen.set(key, { row, isExact });
    }
  });

  return Array.from(chosen.values()).map((entry) => entry.row);
}

/**
 * افزودن ردیف‌های عمومی‌ای که در فهرستِ برند/مدل نیستند.
 *
 * ردیف عمومی = template با brand خالی (قرارداد migration 016).
 * هر جا ردیف خاص همان سرویس را داشته باشیم، ردیف عمومی
 * اضافه نمی‌شود تا اینترکولِ درستِ همان خودرو برنده شود.
 *
 * @param {Array<object>} specific
 * @param {Array<object>} universal
 * @returns {Array<object>}
 */
function mergeUniversalTemplates(specific, universal) {
  if (!Array.isArray(universal) || universal.length === 0) {
    return specific;
  }

  const taken = new Set(
    specific.map((row) => normalizeServiceTitle(row?.service_name))
  );

  const extra = universal.filter(
    (row) => !taken.has(normalizeServiceTitle(row?.service_name))
  );

  return extra.length > 0 ? [...specific, ...extra] : specific;
}

/**
 * جدا کردن template های متعلق به یک خودروی مشخص.
 *
 * جدول مرجع `service_templates` «مدل‌محور» است، نه برند‌محور.
 * برای نمونه هم «پژو / 206 تیپ 2» و هم «لکسوس / ls460L»
 * ردیف جدا دارند و اینترکول‌هایشان متفاوت است.
 *
 * داشبورد چند خودرو را با هم نشان می‌دهد و template های
 * همهٔ آن‌ها در یک آرایه جمع می‌شوند. بدون این فیلتر،
 * اینترکول لکسوس روی پژو هم اعمال می‌شود.
 *
 * سلسله‌مراتب نزولی (هر مرحله فقط وقتی قبلی خالی بود):
 *   ۱) برند + مدل دقیق  + ردیف‌های بدون مدلِ همان برند
 *      (اگر یک سرویس در هر دو لایه باشد، ردیفِ مدلِ دقیق برنده
 *       است — رجوع کن به dedupePreferExactModel)
 *   ۲) ردیف‌های بدون مدلِ همان برند، وگرنه کلِ ردیف‌های برند
 *      (fallback: مدل ثبت‌شده هنوز در جدول نیست)
 *   ۳) فقط ردیف‌های عمومی (برند ناشناخته)
 *   ۴) همهٔ ردیف‌ها اگر خودرو brand نداشته باشد (رفتار قبلی)
 *
 * در همهٔ شاخه‌ها، ردیف‌های عمومیِ جدول (brand خالی) پایانِ
 * کار اضافه می‌شوند مگر همان سرویس با اینترکول خاص آمده باشد.
 *
 * @param {Array<object>} templates
 * @param {object | null | undefined} vehicle
 * @returns {Array<object>}
 */
export function filterTemplatesForVehicle(templates, vehicle) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return [];
  }

  const brand = normalizeLabel(vehicle?.brand);
  const model = normalizeLabel(vehicle?.model);

  if (!brand) {
    return templates;
  }

  const universal = templates.filter(
    (template) => !normalizeLabel(template?.brand)
  );

  const sameBrand = templates.filter(
    (template) => normalizeLabel(template?.brand) === brand
  );

  // برند ناشناخته: حداقل برنامهٔ نگهداری عمومی داشته باشیم
  if (sameBrand.length === 0) {
    return universal;
  }

  const generic = sameBrand.filter(
    (template) => !normalizeLabel(template?.model)
  );

  if (!model) {
    const base =
      generic.length > 0
        ? dedupePreferExactModel(generic, model)
        : dedupeByServiceName(sameBrand);

    return mergeUniversalTemplates(base, universal);
  }

  const exact = sameBrand.filter(
    (template) =>
      normalizeLabel(template?.model) === model ||
      !normalizeLabel(template?.model)
  );

  const scoped =
    exact.length > 0
      ? dedupePreferExactModel(exact, model)
      : dedupeByServiceName(sameBrand);

  return mergeUniversalTemplates(scoped, universal);
}

/**
 * امتیاز سلامت کلی خودرو.
 *
 * میانگین فقط از وضعیت‌های امتیازدار گرفته می‌شود؛
 * سرویس ثبت‌نشده (score = null) وزنی ندارد.
 *
 * @param {object}   params
 * @param {Array}    params.templates
 * @param {Array}    params.services
 * @param {number}   params.currentMileage
 * @param {object}  [params.vehicle]      خودرو؛ برای فیلتر مدل‌محور
 * @param {Date | string | number} [params.currentDate] فعال‌کردن مبناِ زمان
 * @param {Function} [params.formatNumber]
 * @returns {{ label: string, score: number | null, className: string }}
 */
export function getOverallHealth({
  templates = [],
  services = [],
  currentMileage = 0,
  vehicle = null,
  currentDate = null,
  formatNumber = defaultFormatNumber,
}) {
  const scoped = filterTemplatesForVehicle(templates, vehicle);

  if (scoped.length === 0) {
    return unknownHealth();
  }

  const statuses = scoped.map((template) =>
    getTemplateStatus({
      template,
      services,
      currentMileage,
      currentDate,
      formatNumber,
    }),
  );

  const scored = statuses.filter((item) => item.score !== null);

  if (scored.length === 0) {
    return unknownHealth();
  }

  const averageScore = Math.round(
    scored.reduce((sum, item) => sum + item.score, 0) / scored.length,
  );

  if (scored.some((item) => item.status === "danger")) {
    return {
      label: "نیاز به سرویس",
      score: averageScore,
      className: "danger",
    };
  }

  if (scored.some((item) => item.status === "warning")) {
    return {
      label: "نیاز به توجه",
      score: averageScore,
      className: "warning",
    };
  }

  return {
    label: "عالی",
    score: averageScore,
    className: "good",
  };
}

/**
 * سرویس‌های پیش‌رو، نزدیک‌ترین اول.
 *
 * سرویسی «پیش‌رو» است که هنوز عقب نیفتاده باشد و لااقل یک مبنا
 * (کیلومتر یا روز) برایش ماندهٔ مثبت داشته باشد.
 *
 * @param {object} params
 * @param {Array} params.templates
 * @param {Array} params.services
 * @param {number} params.currentMileage
 * @param {object} [params.vehicle]   خودرو؛ برای فیلتر مدل‌محور
 * @param {Date | string | number} [params.currentDate]
 * @param {Function} [params.formatNumber]
 * @returns {Array<{ template: object, status: object }>}
 */
export function getUpcomingServices({
  templates = [],
  services = [],
  currentMileage = 0,
  vehicle = null,
  currentDate = null,
  formatNumber = defaultFormatNumber,
}) {
  return filterTemplatesForVehicle(templates, vehicle)
    .map((template) => ({
      template,
      status: getTemplateStatus({
        template,
        services,
        currentMileage,
        currentDate,
        formatNumber,
      }),
    }))
    .filter((item) => isStillDue(item.status))
    .sort((a, b) => urgencyOf(a) - urgencyOf(b));
}

/**
 * سرویس‌های عقب‌افتاده یا نزدیک‌به‌موعد — مبنای بخش «یادآوری‌ها».
 *
 * فوری‌ترین اول مرتب می‌شود: اول danger، بعد warning.
 *
 * @param {object} params
 * @param {Array} params.templates
 * @param {Array} params.services
 * @param {number} params.currentMileage
 * @param {object} [params.vehicle]
 * @param {Date | string | number} [params.currentDate]
 * @param {Function} [params.formatNumber]
 * @returns {Array<{ template: object, status: object }>}
 */
export function getDueServices({
  templates = [],
  services = [],
  currentMileage = 0,
  vehicle = null,
  currentDate = null,
  formatNumber = defaultFormatNumber,
}) {
  return filterTemplatesForVehicle(templates, vehicle)
    .map((template) => ({
      template,
      status: getTemplateStatus({
        template,
        services,
        currentMileage,
        currentDate,
        formatNumber,
      }),
    }))
    .filter(
      (item) =>
        item.status.status === "danger" || item.status.status === "warning",
    )
    .sort(
      (a, b) =>
        SEVERITY[b.status.status] - SEVERITY[a.status.status] ||
        urgencyOf(a) - urgencyOf(b),
    );
}

/**
 * آیا هنوز برای این سرویس مانده‌ای باقی مانده؟
 *
 * @param {object} status
 * @returns {boolean}
 */
function isStillDue(status) {
  // عقب‌افتاده، پیش‌رو نیست — حتی اگر مبنای دیگر هنوز مهلت داشته باشد.
  if (status.status === "danger") {
    return false;
  }

  const byKm =
    typeof status.remaining === "number" && status.remaining >= 0;
  const byDays =
    typeof status.daysLeft === "number" && status.daysLeft >= 0;

  return byKm || byDays;
}

/**
 * آخرین سرویس ثبت‌شدهٔ خودرو، صرفاً بر اساس کیلومتر/تاریخ
 * و بدون نیاز به template.
 *
 * برای نمایش «آخرین سرویس» در پروفایل و داشبورد.
 *
 * @param {Array<object>} services
 * @returns {object | null}
 */
export function getLatestService(services) {
  if (!Array.isArray(services) || services.length === 0) {
    return null;
  }

  const sorted = [...services].sort((a, b) => {
    const mileageA = toNumber(a?.mileage);
    const mileageB = toNumber(b?.mileage);

    if (mileageA !== mileageB) {
      return mileageB - mileageA;
    }

    return serviceTimestamp(b) - serviceTimestamp(a);
  });

  return sorted[0];
}

/**
 * قانون کیلومتر خودرو (Regression-sensitive).
 *
 * کیلومتر خودرو هرگز نباید خودکار پایین بیاید.
 * فقط وقتی کیلومتر جدید بیشتر باشد اعمال می‌شود.
 *
 * @param {unknown} currentMileage
 * @param {unknown} newMileage
 * @returns {number | null} مقدار جدید، یا null اگر نباید اعمال شود
 */
export function resolveNextVehicleMileage(currentMileage, newMileage) {
  const current = toNumber(currentMileage);
  const next = Number(newMileage);

  if (newMileage === null || newMileage === undefined || newMileage === "" || Number.isNaN(next)) {
    return null;
  }

  if (next > current) {
    return next;
  }

  return null;
}

/**
 * فرمت پیش‌فرض عدد بدون وابستگی به locale مرورگر.
 * لایهٔ UI می‌تواند فرمت دلخواه خود را پاس بدهد.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function defaultFormatNumber(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return String(value);
}

function unknownHealth() {
  return {
    label: "نامشخص",
    score: null,
    className: "unknown",
  };
}