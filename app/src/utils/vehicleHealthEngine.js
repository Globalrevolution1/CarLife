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

  value = value.replace(MOTOR_SUFFIX_PATTERN, "");

  return value.trim();
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
 * وضعیت یک template در برابر کیلومتر فعلی خودرو.
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
 * @param {Function} [params.formatNumber]
 * @returns {{
 *   status: string,
 *   label: string,
 *   nextMileage: number | null,
 *   remaining: number | null,
 *   overdueBy: number | null,
 *   lastService: object | null,
 *   score: number | null,
 * }}
 */
export function getTemplateStatus({
  template,
  services = [],
  currentMileage = 0,
  formatNumber = defaultFormatNumber,
}) {
  const odometer = toNumber(currentMileage);
  const interval = toNumber(template?.interval_km);

  const lastService = getLastServiceForTemplate(template, services);

  // ---- NO HISTORY → «هنوز ثبت نشده»، نه Overdue ----

  if (!lastService) {
    return {
      status: "unknown",
      label: "هنوز ثبت نشده",
      nextMileage: null,
      remaining: null,
      overdueBy: null,
      lastService: null,
      score: null,
    };
  }

  // ---- INVALID INTERVAL ----

  if (interval <= 0) {
    return {
      status: "unknown",
      label: "فاصله سرویس مشخص نیست",
      nextMileage: null,
      remaining: null,
      overdueBy: null,
      lastService,
      score: null,
    };
  }

  const lastMileage = toNumber(lastService?.mileage);
  const nextMileage = lastMileage + interval;
  const remaining = nextMileage - odometer;

  // ---- OVERDUE ----

  if (remaining < 0) {
    const overdueBy = Math.abs(remaining);

    return {
      status: "danger",
      label: `${formatNumber(overdueBy)} km عقب‌افتاده`,
      nextMileage,
      remaining,
      overdueBy,
      lastService,
      score: 50,
    };
  }

  // ---- EXACT DUE ----

  if (remaining === 0) {
    return {
      status: "danger",
      label: "موعد سرویس رسیده",
      nextMileage,
      remaining,
      overdueBy: 0,
      lastService,
      score: 50,
    };
  }

  // ---- NEAR DUE ----

  if (remaining <= NEAR_DUE_THRESHOLD_KM) {
    return {
      status: "warning",
      label: `${formatNumber(remaining)} km دیگر`,
      nextMileage,
      remaining,
      overdueBy: 0,
      lastService,
      score: 80,
    };
  }

  // ---- GOOD ----

  return {
    status: "good",
    label: `${formatNumber(remaining)} km دیگر`,
    nextMileage,
    remaining,
    overdueBy: 0,
    lastService,
    score: 100,
  };
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
 * @param {Function} [params.formatNumber]
 * @returns {{ label: string, score: number | null, className: string }}
 */
export function getOverallHealth({
  templates = [],
  services = [],
  currentMileage = 0,
  vehicle = null,
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
 * فقط وضعیت‌هایی که remaining دارند و منفی نیستند.
 *
 * @param {object} params
 * @param {Array} params.templates
 * @param {Array} params.services
 * @param {number} params.currentMileage
 * @param {object} [params.vehicle]   خودرو؛ برای فیلتر مدل‌محور
 * @param {Function} [params.formatNumber]
 * @returns {Array<{ template: object, status: object }>}
 */
export function getUpcomingServices({
  templates = [],
  services = [],
  currentMileage = 0,
  vehicle = null,
  formatNumber = defaultFormatNumber,
}) {
  return filterTemplatesForVehicle(templates, vehicle)
    .map((template) => ({
      template,
      status: getTemplateStatus({
        template,
        services,
        currentMileage,
        formatNumber,
      }),
    }))
    .filter(
      (item) =>
        item.status.remaining !== null && item.status.remaining >= 0,
    )
    .sort((a, b) => a.status.remaining - b.status.remaining);
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