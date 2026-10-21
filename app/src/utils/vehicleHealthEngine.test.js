import { describe, test, expect } from "vitest";

import {
  NEAR_DUE_THRESHOLD_KM,
  filterTemplatesForVehicle,
  getLastServiceForTemplate,
  getLatestService,
  getNextDueMileage,
  getOverallHealth,
  getTemplateStatus,
  getUpcomingServices,
  normalizeLabel,
  normalizeServiceTitle,
  resolveNextVehicleMileage,
  serviceTitleMatches,
} from "./vehicleHealthEngine.js";

// =============================================================
// FIXTURES
// =============================================================

const TEMPLATE_OIL = {
  id: "t1",
  service_name: "تعویض روغن",
  interval_km: 10000,
};

const TEMPLATE_GEARBOX = {
  id: "t2",
  service_name: "تعویض روغن گیربکس",
  interval_km: 5000,
};

const TEMPLATE_AIR = {
  id: "t3",
  service_name: "تعویض فیلتر هوا",
  interval_km: 20000,
};

const TEMPLATES = [TEMPLATE_GEARBOX, TEMPLATE_OIL, TEMPLATE_AIR];

const LEXUS_SERVICES = [
  {
    id: "s1",
    title: "تعویض روغن موتور",
    mileage: 90000,
    service_date: "2026-01-10",
    created_at: "2026-01-10",
  },
  {
    id: "s2",
    title: "تعویض روغن گیربکس",
    mileage: 90000,
    service_date: "2026-01-10",
    created_at: "2026-01-10",
  },
  {
    id: "s3",
    title: "تعویض روغن",
    mileage: 85000,
    service_date: "2025-06-01",
    created_at: "2025-06-01",
  },
  {
    id: "s4",
    title: "تعویض روغن گیربکس",
    mileage: 80000,
    service_date: "2024-06-01",
    created_at: "2024-06-01",
  },
];

// =============================================================
// SCENARIO F — نرمال‌سازی عنوان
// (سند بخش 19 و 42)
// =============================================================

describe("normalization — Scenario F", () => {
  test("«تعویض روغن موتور» با «تعویض روغن» یکی می‌شود", () => {
    expect(normalizeServiceTitle("تعویض روغن موتور")).toBe(
      normalizeServiceTitle("تعویض روغن"),
    );
  });

  test("پسوند «موتور» فقط در انتهای عنوان حذف می‌شود", () => {
    expect(normalizeServiceTitle("موتور تعویض روغن")).toBe(
      "موتور تعویض روغن",
    );
  });

  test("«تعویض روغن گیربکس» با «روغن گیربکس» یکی می‌شود", () => {
    expect(normalizeServiceTitle("تعویض روغن گیربکس")).toBe(
      normalizeServiceTitle("روغن گیربکس"),
    );
  });

  test("ZWNJ حذف می‌شود", () => {
    expect(normalizeServiceTitle("تعویض‌روغن")).toBe(
      normalizeServiceTitle("تعویض روغن"),
    );
  });

  test("فاصله‌های اضافه فشرده می‌شوند", () => {
    expect(normalizeServiceTitle("  تعویض    روغن  ")).toBe(
      "تعویض روغن",
    );
  });

  test("حروف بزرگ/کوچک یکسان می‌شوند", () => {
    expect(normalizeServiceTitle("Oil Change")).toBe(
      normalizeServiceTitle("oil change"),
    );
  });

  test("مقدار خالی و null ورودی امن هستند", () => {
    expect(normalizeServiceTitle("")).toBe("");
    expect(normalizeServiceTitle(null)).toBe("");
    expect(normalizeServiceTitle(undefined)).toBe("");
  });
});

describe("matching — equality, نه includes", () => {
  test("«تعویض روغن» با «تعویض روغن» تطبیق دارد", () => {
    expect(
      serviceTitleMatches("تعویض روغن", "تعویض روغن"),
    ).toBe(true);
  });

  test("«تعویض روغن» با «تعویض روغن گیربکس» تطبیق ندارد", () => {
    expect(
      serviceTitleMatches("تعویض روغن", "تعویض روغن گیربکس"),
    ).toBe(false);
  });

  test("«تعویض روغن موتور» با «تعویض روغن» تطبیق دارد", () => {
    expect(
      serviceTitleMatches("تعویض روغن موتور", "تعویض روغن"),
    ).toBe(true);
  });

  test("ورودی خالی هرگز تطبیق نمی‌دهد", () => {
    expect(serviceTitleMatches("", "تعویض روغن")).toBe(false);
    expect(serviceTitleMatches("تعویض روغن", "")).toBe(false);
    expect(serviceTitleMatches(null, null)).toBe(false);
  });
});

// =============================================================
// SCENARIO F2 — هم‌معنی‌های «تعویض …»
//
// دادهٔ قدیمی و سرویس‌های ثبت‌شدهٔ کاربر با «تعویض …» نوشته شده‌اند
// ولی کاتالوگ بازار (migration 017) نام کوتاه استاندارد را دارد.
// بدون این هم‌پوشانی، هر خودرویی با سوابق قدیمی دو ردیف تکراری
// در برنامهٔ نگهداری و فرم ثبت سرویس می‌گرفت.
// =============================================================

describe("aliases — «تعویض …» با نام استاندارد یکی است", () => {
  test.each([
    ["تعویض روغن گیربکس", "روغن گیربکس"],
    ["تعویض روغن واسکازین", "روغن گیربکس"],
    ["واسکازین", "روغن گیربکس"],
    ["تعویض فیلتر هوا", "فیلتر هوا"],
    ["تعویض فیلتر روغن", "فیلتر روغن"],
    ["تعویض فیلتر کابین", "فیلتر کابین"],
    ["تعویض فیلتر بنزین", "فیلتر بنزین"],
    ["تعویض روغن ترمز", "روغن ترمز"],
    ["تعویض ضد یخ", "ضد یخ"],
    ["تعویض شمع", "شمع"],
    ["تعویض تسمه تایم", "تسمه تایم"],
    ["تسمه تایمینگ", "تسمه تایم"],
    ["تعویض لنت ترمز جلو", "لنت ترمز جلو"],
    ["تعویض لنت ترمز عقب", "لنت ترمز عقب"],
    ["تعویض باتری", "باتری"],
    ["باتری ماشین", "باتری"],
    ["لاستیک", "تعویض لاستیک"],
    ["تایر", "تعویض لاستیک"],
  ])("«%s» ≡ «%s»", (left, right) => {
    expect(normalizeServiceTitle(left)).toBe(normalizeServiceTitle(right));
  });

  test("هم‌پوشانی دوطرفه است", () => {
    expect(normalizeServiceTitle("روغن گیربکس")).toBe(
      normalizeServiceTitle("تعویض روغن گیربکس"),
    );
    expect(normalizeServiceTitle("فیلتر هوا")).toBe(
      normalizeServiceTitle("تعویض فیلتر هوا"),
    );
  });

  test("هیچ دو سرویس متفاوتی یکی نمی‌شوند", () => {
    const distinct = [
      "روغن گیربکس",
      "روغن ترمز",
      "تعویض روغن",
      "فیلتر هوا",
      "فیلتر روغن",
      "فیلتر کابین",
      "فیلتر بنزین",
      "ضد یخ",
      "شمع",
      "تسمه تایم",
      "لنت ترمز جلو",
      "لنت ترمز عقب",
      "باتری",
      "تعویض لاستیک",
    ].map((title) => normalizeServiceTitle(title));

    expect(new Set(distinct).size).toBe(distinct.length);
  });

  test("«تعویض روغن» همچنان با «روغن گیربکس» یکی نمی‌شود", () => {
    expect(serviceTitleMatches("تعویض روغن", "روغن گیربکس")).toBe(false);
    expect(serviceTitleMatches("تعویض روغن", "تعویض روغن گیربکس")).toBe(
      false,
    );
  });
});

// =============================================================
// انتخاب آخرین سرویس
// =============================================================

describe("getLastServiceForTemplate", () => {
  test("بیشترین کیلومتر برنده است", () => {
    const last = getLastServiceForTemplate(TEMPLATE_GEARBOX, LEXUS_SERVICES);
    expect(last.mileage).toBe(90000);
  });

  test("سرویس نامرتبط نادیده گرفته می‌شود", () => {
    const last = getLastServiceForTemplate(TEMPLATE_AIR, LEXUS_SERVICES);
    expect(last).toBeNull();
  });

  test("در تساوی کیلومتر، تاریخ جدیدتر برنده است", () => {
    const services = [
      { id: "a", title: "تعویض روغن", mileage: 90000, service_date: "2025-01-01" },
      { id: "b", title: "تعویض روغن", mileage: 90000, service_date: "2026-01-01" },
    ];
    expect(getLastServiceForTemplate(TEMPLATE_OIL, services).id).toBe("b");
  });

  test("آرایهٔ ورودی تغییر داده نمی‌شود", () => {
    const services = [...LEXUS_SERVICES];
    const before = services.map((s) => s.id);
    getLastServiceForTemplate(TEMPLATE_OIL, services);
    expect(services.map((s) => s.id)).toEqual(before);
  });

  test("ورودی‌های تهی امن هستند", () => {
    expect(getLastServiceForTemplate(null, LEXUS_SERVICES)).toBeNull();
    expect(getLastServiceForTemplate(TEMPLATE_OIL, [])).toBeNull();
    expect(getLastServiceForTemplate(TEMPLATE_OIL, null)).toBeNull();
  });
});

describe("getNextDueMileage", () => {
  test("nextDue = lastMileage + intervalKm", () => {
    const last = { mileage: 90000 };
    expect(getNextDueMileage(last, 10000)).toBe(100000);
  });

  test("بدون سابقه null است", () => {
    expect(getNextDueMileage(null, 10000)).toBeNull();
  });

  test("interval نامعتبر null است", () => {
    expect(getNextDueMileage({ mileage: 90000 }, 0)).toBeNull();
    expect(getNextDueMileage({ mileage: 90000 }, -5)).toBeNull();
  });
});

// =============================================================
// SCENARIO A — موعد بعدی
// =============================================================

describe("Scenario A — موعد سرویس بعدی", () => {
  test("تعارض گیربکس: 95000 و 5000 کیلومتر مانده", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_GEARBOX,
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(status.status).toBe("good");
    expect(status.nextMileage).toBe(95000);
    expect(status.remaining).toBe(5000);
    expect(status.score).toBe(100);
  });

  test("روغن موتور: 100000 و 10000 کیلومتر مانده", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_OIL,
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(status.nextMileage).toBe(100000);
    expect(status.remaining).toBe(10000);
    expect(status.status).toBe("good");
  });
});

// =============================================================
// SCENARIO B — موعد رسیده
// =============================================================

describe("Scenario B — موعد سرویس رسیده", () => {
  test("کیلومتر 95000 روی موعد گیربکس → «موعد سرویس رسیده»", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_GEARBOX,
      services: LEXUS_SERVICES,
      currentMileage: 95000,
    });

    expect(status.nextMileage).toBe(95000);
    expect(status.remaining).toBe(0);
    expect(status.status).toBe("danger");
    expect(status.label).toBe("موعد سرویس رسیده");
  });

  test("همان 95000 برای روغن هنوز سالم است (۵۰۰۰ مانده)", () => {
    // نکته: «موعد رسیده» به template بستگی دارد، نه فقط به کیلومتر خودرو.
    // سناریوی B سند مبهم بود و اینجا دقیق شد.
    const status = getTemplateStatus({
      template: TEMPLATE_OIL,
      services: LEXUS_SERVICES,
      currentMileage: 95000,
    });

    expect(status.nextMileage).toBe(100000);
    expect(status.remaining).toBe(5000);
    expect(status.status).toBe("good");
    expect(status.score).toBe(100);
  });

  test("عبور از موعد → overdue با قدرمطلق", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_OIL,
      services: LEXUS_SERVICES,
      currentMileage: 105000,
    });

    expect(status.status).toBe("danger");
    expect(status.remaining).toBe(-5000);
    expect(status.overdueBy).toBe(5000);
  });

  test("دقیقاً روی موعد → «موعد سرویس رسیده»", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_OIL,
      services: LEXUS_SERVICES,
      currentMileage: 100000,
    });

    expect(status.status).toBe("danger");
    expect(status.label).toBe("موعد سرویس رسیده");
    expect(status.overdueBy).toBe(0);
  });

  test("در مرز آستانهٔ warning", () => {
    const at = getTemplateStatus({
      template: TEMPLATE_OIL,
      services: LEXUS_SERVICES,
      currentMileage: 100000 - NEAR_DUE_THRESHOLD_KM,
    });
    expect(at.status).toBe("warning");

    const justOutside = getTemplateStatus({
      template: TEMPLATE_OIL,
      services: LEXUS_SERVICES,
      currentMileage: 100000 - NEAR_DUE_THRESHOLD_KM - 1,
    });
    expect(justOutside.status).toBe("good");
  });
});

// =============================================================
// SCENARIO C — «ثبت نشده» با «عقب‌افتاده» فرق دارد
// (سند بخش 16 — قانون طلایی)
// =============================================================

describe("Scenario C — ثبت‌نشده ≠ عقب‌افتاده", () => {
  test("بدون سابقه → unknown با score null", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_AIR,
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(status.status).toBe("unknown");
    expect(status.label).toBe("هنوز ثبت نشده");
    expect(status.score).toBeNull();
    expect(status.remaining).toBeNull();
    expect(status.overdueBy).toBeNull();
  });

  test("سرویس ثبت‌نشده امتیاز سلامت را کم نمی‌کند", () => {
    const health = getOverallHealth({
      templates: TEMPLATES,
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    // گیربکس 100 + روغن 100 + فیلتر هوا نمره ندارد
    expect(health.score).toBe(100);
    expect(health.className).toBe("good");
  });

  test("کیلومتر خیلی بالا هم سرویس ثبت‌نشده را overdue نمی‌کند", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_AIR,
      services: LEXUS_SERVICES,
      currentMileage: 999999,
    });

    expect(status.status).toBe("unknown");
    expect(status.overdueBy).toBeNull();
  });

  test("interval نامعتبر → unknown با score null", () => {
    const status = getTemplateStatus({
      template: { id: "x", service_name: "تعویض روغن", interval_km: 0 },
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(status.status).toBe("unknown");
    expect(status.label).toBe("فاصله سرویس مشخص نیست");
    expect(status.score).toBeNull();
  });
});

// =============================================================
// SCENARIO D و E — قانون کیلومتر خودرو
// (سند بخش 21 و 38)
// =============================================================

describe("Scenario D/E — current_mileage هرگز پایین نمی‌آید", () => {
  test("کیلومتر بیشتر اعمال می‌شود", () => {
    expect(resolveNextVehicleMileage(90000, 92000)).toBe(92000);
  });

  test("کیلومتر کمتر نادیده گرفته می‌شود", () => {
    expect(resolveNextVehicleMileage(90000, 80000)).toBeNull();
  });

  test("کیلومتر برابر نادیده گرفته می‌شود", () => {
    expect(resolveNextVehicleMileage(90000, 90000)).toBeNull();
  });

  test("ورودی نامعتبر null برمی‌گرداند", () => {
    expect(resolveNextVehicleMileage(90000, null)).toBeNull();
    expect(resolveNextVehicleMileage(90000, undefined)).toBeNull();
    expect(resolveNextVehicleMileage(90000, "")).toBeNull();
    expect(resolveNextVehicleMileage(90000, "abc")).toBeNull();
  });

  test("خودروی بدون کیلومتر قبلی، اولین کیلومتر را می‌پذیرد", () => {
    expect(resolveNextVehicleMileage(null, 12000)).toBe(12000);
    expect(resolveNextVehicleMileage(0, 12000)).toBe(12000);
  });
});

// =============================================================
// HEALTH SCORE
// (سند بخش 17)
// =============================================================

describe("Health Score", () => {
  test("همه به‌روز → 100%", () => {
    const health = getOverallHealth({
      templates: TEMPLATES,
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(health.score).toBe(100);
    expect(health.className).toBe("good");
    expect(health.label).toBe("عالی");
  });

  test("یکی عقب‌افتاده → میانگین وضعیت‌های امتیازدار", () => {
    const health = getOverallHealth({
      templates: TEMPLATES,
      services: LEXUS_SERVICES,
      currentMileage: 120000,
    });

    // هر سه امتیازدار و همه danger: (50+50+50)/3
    expect(health.className).toBe("danger");
    expect(health.score).toBe(50);
    expect(health.label).toBe("نیاز به سرویس");
  });

  test("ترکیبی → میانگین واقعی", () => {
    const health = getOverallHealth({
      templates: [TEMPLATE_GEARBOX, TEMPLATE_OIL],
      services: LEXUS_SERVICES,
      currentMileage: 98000,
    });

    // گیربکس: 95000-98000 = -3000 → danger 50
    // روغن:  100000-98000 = 2000 → good 100
    expect(health.className).toBe("danger");
    expect(health.score).toBe(75);
  });

  test("هیچ وضعیت امتیازداری → نامشخص", () => {
    const health = getOverallHealth({
      templates: TEMPLATES,
      services: [],
      currentMileage: 90000,
    });

    expect(health.score).toBeNull();
    expect(health.className).toBe("unknown");
    expect(health.label).toBe("نامشخص");
  });

  test("بدون template → نامشخص", () => {
    const health = getOverallHealth({
      templates: [],
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(health.score).toBeNull();
  });

  test("خودرو بدون کیلومتر، همه را warning می‌بیند نه سالم", () => {
    const status = getTemplateStatus({
      template: TEMPLATE_OIL,
      services: LEXUS_SERVICES,
      currentMileage: 0,
    });

    // next 100000 - 0 = 100000 → good. رفتار حفظ‌شده.
    expect(status.remaining).toBe(100000);
    expect(status.status).toBe("good");
  });
});

// =============================================================
// UPCOMING
// =============================================================

describe("getUpcomingServices", () => {
  test("نزدیک‌ترین موعد اول", () => {
    const upcoming = getUpcomingServices({
      templates: TEMPLATES,
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(upcoming.length).toBe(2);
    expect(upcoming[0].template.id).toBe("t2");
    expect(upcoming[1].template.id).toBe("t1");
  });

  test("وضعیت عقب‌افتاده در لیست پیش‌رو نمی‌آید", () => {
    const upcoming = getUpcomingServices({
      templates: TEMPLATES,
      services: LEXUS_SERVICES,
      currentMileage: 120000,
    });

    expect(upcoming.length).toBe(0);
  });

  test("ثبت‌نشده در لیست پیش‌رو نمی‌آید", () => {
    const upcoming = getUpcomingServices({
      templates: [TEMPLATE_AIR],
      services: LEXUS_SERVICES,
      currentMileage: 90000,
    });

    expect(upcoming.length).toBe(0);
  });
});

// =============================================================
// آخرین سرویس کلی
// =============================================================

describe("getLatestService", () => {
  test("بیشترین کیلومتر", () => {
    expect(getLatestService(LEXUS_SERVICES).mileage).toBe(90000);
  });

  test("ورودی خالی null می‌دهد", () => {
    expect(getLatestService([])).toBeNull();
    expect(getLatestService(null)).toBeNull();
  });

  test("میلومتر null به‌عنوان صفر در نظر گرفته می‌شود", () => {
    const services = [
      { id: "a", title: "الف", mileage: null, service_date: "2026-01-01" },
      { id: "b", title: "ب", mileage: 1200, service_date: "2025-01-01" },
    ];
    expect(getLatestService(services).id).toBe("b");
  });
});

// =============================================================
// سازگاری با رفتار قبلی (baseline قدیمی)
// =============================================================

describe("baseline از پیش موجود", () => {
  test("۴ رکورد سرویس دیده می‌شود (سند بخش 25)", () => {
    expect(LEXUS_SERVICES.length).toBe(4);
  });

  test("شمارش بر اساس کیلومتر و تاریخ", () => {
    const latest = getLatestService(LEXUS_SERVICES);
    expect(latest.mileage).toBe(90000);
  });
});

// =============================================================
// تفکیک مدل‌محور template ها
//
// جدول مرجع زنده برای هر «برند + مدل» ردیف جدا دارد:
//   پژو    / 206 تیپ 2  → روغن موتور ۱۰۰۰۰ ، گیربکس ۵۰۰۰۰
//   لکسوس  / ls460L      → روغن ۱۰۰۰۰ ، روغن گیربکس ۵۰۰۰
//
// اگر template ها فقط بر اساس brand فیلتر شوند، اینترکول
// لکسوس روی پژو هم اعمال می‌شود و Health اشتباه می‌شود.
// =============================================================

const REAL_TEMPLATES = [
  { id: "p1", brand: "پژو", model: "206 تیپ 2", service_name: "تعویض روغن موتور", interval_km: 10000 },
  { id: "p2", brand: "پژو", model: "206 تیپ 2", service_name: "روغن گیربکس", interval_km: 50000 },
  { id: "l1", brand: "لکسوس", model: "ls460L", service_name: "تعویض روغن", interval_km: 10000 },
  { id: "l2", brand: "لکسوس", model: "ls460L", service_name: "تعویض روغن گیربکس", interval_km: 5000 },
];

const PEUGEOT = { brand: "پژو", model: "206 تیپ 2", current_mileage: 100000 };
const LEXUS = { brand: "لکسوس", model: "ls460L", current_mileage: 100000 };

describe("تفکیک مدل‌محور template ها", () => {
  test("فیلتر، دو template هم‌مدل را برمی‌گرداند", () => {
    expect(filterTemplatesForVehicle(REAL_TEMPLATES, PEUGEOT).map((t) => t.id)).toEqual(["p1", "p2"]);
    expect(filterTemplatesForVehicle(REAL_TEMPLATES, LEXUS).map((t) => t.id)).toEqual(["l1", "l2"]);
  });

  test("خودروی بدون brand همهٔ template ها را می‌گیرد (رفتار قبلی)", () => {
    expect(filterTemplatesForVehicle(REAL_TEMPLATES, { model: "206 تیپ 2" }).length).toBe(4);
    expect(filterTemplatesForVehicle(REAL_TEMPLATES, null).length).toBe(4);
  });

  test("پژو ۱۰۰۰۰۰ کیلومتر: روغن موتور در موعد، گیربکس سبز", () => {
    const scoped = filterTemplatesForVehicle(REAL_TEMPLATES, PEUGEOT);
    const services = [{ id: "s1", title: "تعویض روغن موتور", mileage: 100000, service_date: "2026-06-01" }];

    const oil = getTemplateStatus({
      template: scoped.find((t) => t.id === "p1"),
      services,
      currentMileage: 100000,
    });
    const gearbox = getTemplateStatus({
      template: scoped.find((t) => t.id === "p2"),
      services,
      currentMileage: 100000,
    });

    expect(oil.status).toBe("good");
    expect(gearbox.status).toBe("unknown");
    expect(gearbox.label).toBe("هنوز ثبت نشده");
  });

  test("لکسوس ۱۰۰۰۰۰ کیلومتر: اینترکول ۵۰۰۰ اعمال می‌شود، نه ۵۰۰۰۰ پژو", () => {
    const scoped = filterTemplatesForVehicle(REAL_TEMPLATES, LEXUS);
    const services = [
      { id: "s1", title: "تعویض روغن", mileage: 100000, service_date: "2026-06-01" },
      { id: "s2", title: "تعویض روغن گیربکس", mileage: 100000, service_date: "2026-06-01" },
    ];

    const gearbox = getTemplateStatus({
      template: scoped.find((t) => t.id === "l2"),
      services,
      currentMileage: 100000,
    });

    // اگر template اشتباهی پژو (۵۰۰۰۰) انتخاب می‌شد، nextMileage می‌شد ۱۵۰۰۰۰
    expect(gearbox.nextMileage).toBe(105000);
    expect(gearbox.remaining).toBe(5000);
    expect(gearbox.status).toBe("good");
  });

  test("بدون vehicle، Health از همهٔ template ها ساخته می‌شود (سازگاری)", () => {
    const health = getOverallHealth({
      templates: REAL_TEMPLATES,
      services: [{ id: "s1", title: "تعویض روغن موتور", mileage: 100000 }],
      currentMileage: 100000,
    });
    expect(health.score).not.toBeNull();
  });

  test("با vehicle، Health فقط از template های همان مدل ساخته می‌شود", () => {
    const services = [{ id: "s1", title: "تعویض روغن موتور", mileage: 100000 }];

    // لکسوس هیچ سابقه‌ای ندارد و هیچ template ی هم ندارد → نامشخص
    const lexusHealth = getOverallHealth({
      templates: REAL_TEMPLATES,
      services: [],
      currentMileage: 100000,
      vehicle: LEXUS,
    });
    expect(lexusHealth.className).toBe("unknown");

    // پژو با یک سابقهٔ روغن، دو template دارد → یکی امتیازدار
    const peugeotHealth = getOverallHealth({
      templates: REAL_TEMPLATES,
      services,
      currentMileage: 100000,
      vehicle: PEUGEOT,
    });
    expect(peugeotHealth.score).toBe(100);
    expect(peugeotHealth.className).toBe("good");
  });

  test("سرویس پیش‌رو هم مدل‌محور است", () => {
    const peugeotUpcoming = getUpcomingServices({
      templates: REAL_TEMPLATES,
      services: [{ id: "s1", title: "تعویض روغن موتور", mileage: 100000 }],
      currentMileage: 100000,
      vehicle: PEUGEOT,
    });

    // فقط دو template پژو، و فقط گیربکس که سابقه ندارد remaining ندارد
    expect(peugeotUpcoming.every((item) => item.template.brand === "پژو")).toBe(true);
  });
});

// =============================================================
// پوشش template ها (migration 016)
//
// قرارداد: ردیف با brand خالی = برای همهٔ خودروها.
// هدف: هیچ خودرویی نباید بی‌برنامهٔ نگهداری بماند.
// =============================================================

const UNIVERSAL_TEMPLATES = [
  { id: "u1", brand: "", model: "", service_name: "تعویض روغن موتور", interval_km: 10000 },
  { id: "u2", brand: "", model: "", service_name: "فیلتر هوا", interval_km: 15000 },
];

const COVERAGE_TEMPLATES = [
  ...UNIVERSAL_TEMPLATES,
  { id: "p1", brand: "پژو", model: "206 تیپ 2", service_name: "تعویض روغن موتور", interval_km: 10000 },
  { id: "p2", brand: "پژو", model: "206 تیپ 2", service_name: "روغن گیربکس", interval_km: 50000 },
  { id: "p3", brand: "پژو", model: "پارس", service_name: "روغن گیربکس", interval_km: 50000 },
  { id: "p4", brand: "پژو", model: "پارس", service_name: "شمع", interval_km: 50000 },
];

const ids = (rows) => rows.map((row) => row.id);

describe("پوشش عمومی template ها", () => {
  test("نرمال‌سازی برند: حروف کوچک، فاصلهٔ اضافه و نیم‌فاصله", () => {
    expect(normalizeLabel(" پژو ")).toBe("پژو");
    expect(normalizeLabel("PEUGEOT")).toBe("peugeot");
    expect(normalizeLabel("ایران‌خودرو")).toBe("ایران خودرو");
    expect(normalizeLabel("ایران  خودرو")).toBe("ایران خودرو");
    expect(normalizeLabel("")).toBe("");
    expect(normalizeLabel(null)).toBe("");
  });

  test("برند ناشناخته ← فقط ردیف‌های عمومی (دیگر بی‌برنامه نیست)", () => {
    const scoped = filterTemplatesForVehicle(COVERAGE_TEMPLATES, {
      brand: "ب‌ام‌و",
      model: "سری 3",
    });

    expect(ids(scoped)).toEqual(["u1", "u2"]);
  });

  test("مدل ثبت‌نشدهٔ یک برندِ شناخته‌شده ← ردیف‌های همان برند، بدون تکرار", () => {
    const scoped = filterTemplatesForVehicle(COVERAGE_TEMPLATES, {
      brand: "پژو",
      model: "مدلی که هنوز نیست",
    });

    // «روغن گیربکس» برای پارس و ۲۰۶ هر دو هست؛ فقط یکی باید بیاید
    expect(ids(scoped)).toEqual(["p1", "p2", "p4", "u2"]);
    expect(scoped.filter((row) => row.service_name === "روغن گیربکس")).toHaveLength(1);
  });

  test("مدل دقیق ← ردیف‌های همان مدل + عمومی‌های جاافتاده", () => {
    const scoped = filterTemplatesForVehicle(COVERAGE_TEMPLATES, {
      brand: "پژو",
      model: "206 تیپ 2",
    });

    // p1 (تعویض روغن موتور) هست، پس u1 تکرار نمی‌شود؛ ولی u2 اضافه می‌شود
    expect(ids(scoped)).toEqual(["p1", "p2", "u2"]);
  });

  test("نحوهٔ تایپ برند فرقی نمی‌کند (پژو vs پژو با فاصله)", () => {
    const scoped = filterTemplatesForVehicle(COVERAGE_TEMPLATES, {
      brand: "  پژو ",
      model: "206 تیپ  2",
    });

    expect(ids(scoped)).toEqual(["p1", "p2", "u2"]);
  });

  test("بدون brand، رفتار قبلی حفظ می‌شود: همهٔ ردیف‌ها", () => {
    expect(filterTemplatesForVehicle(COVERAGE_TEMPLATES, null)).toHaveLength(6);
    expect(filterTemplatesForVehicle(COVERAGE_TEMPLATES, { model: "206 تیپ 2" })).toHaveLength(6);
  });

  test("ردیف عمومی باعث خراب شدن سلامت قبلی نمی‌شود", () => {
    const health = getOverallHealth({
      templates: COVERAGE_TEMPLATES,
      services: [{ id: "s1", title: "تعویض روغن موتور", mileage: 100000, service_date: "2026-06-01" }],
      currentMileage: 100000,
      vehicle: { brand: "پژو", model: "206 تیپ 2" },
    });

    expect(health.score).toBe(100);
    expect(health.className).toBe("good");
  });
});

// =============================================================
// لایهٔ برند (migration 017)
//
// قرارداد سه لایهٔ جدول:
//   عمومی (brand خالی)  → همهٔ خودروها
//   برند  (model خالی)  → هر مدلِ همان برند
//   مدل   (brand+model) → فقط همان خودرو
//
// وقتی یک سرویس در دو لایه باشد، ردیفِ مدلِ دقیق باید برنده
// شود؛ وگرنه هم در فرم ثبت سرویس دو بار نشان داده می‌شود و
// هم امتیاز سلامت دو بار حساب می‌شود.
// =============================================================

const LAYERED_TEMPLATES = [
  { id: "u1", brand: "", model: "", service_name: "تعویض روغن موتور", interval_km: 10000 },
  { id: "u2", brand: "", model: "", service_name: "شمع", interval_km: 50000 },
  { id: "b1", brand: "کیا", model: "", service_name: "شمع", interval_km: 80000 },
  { id: "b2", brand: "کیا", model: "", service_name: "روغن گیربکس", interval_km: 60000 },
  { id: "m1", brand: "کیا", model: "سراتو", service_name: "شمع", interval_km: 60000 },
  { id: "m2", brand: "کیا", model: "سراتو", service_name: "تسمه تایم", interval_km: 90000 },
];

describe("لایهٔ برند در template ها", () => {
  test("تداخل مدل و برند ← ردیف مدلِ دقیق برنده است", () => {
    const scoped = filterTemplatesForVehicle(LAYERED_TEMPLATES, {
      brand: "کیا",
      model: "سراتو",
    });

    const plugs = scoped.filter(
      (row) => normalizeServiceTitle(row.service_name) === "شمع"
    );

    expect(plugs).toHaveLength(1);
    expect(plugs[0].id).toBe("m1");
    expect(plugs[0].interval_km).toBe(60000);
  });

  test("سرویسِ فقط-برندی برای مدلِ دقیق هم می‌آید", () => {
    const scoped = filterTemplatesForVehicle(LAYERED_TEMPLATES, {
      brand: "کیا",
      model: "سراتو",
    });

    // شمع (مدل)، روغن گیربکس (برند)، تسمه تایم (مدل) + عمومی روغن موتور
    expect(ids(scoped).sort()).toEqual(["b2", "m1", "m2", "u1"]);
  });

  test("مدل ثبت‌نشدهٔ همان برند ← ردیف‌های برند با اینترکول برند", () => {
    const scoped = filterTemplatesForVehicle(LAYERED_TEMPLATES, {
      brand: "کیا",
      model: "سلتوس",
    });

    const plugs = scoped.filter(
      (row) => normalizeServiceTitle(row.service_name) === "شمع"
    );

    expect(plugs).toHaveLength(1);
    expect(plugs[0].id).toBe("b1");
    expect(plugs[0].interval_km).toBe(80000);
    // عمومی «شمع=۵۰,۰۰۰» نباید دوباره اضافه شود.
    expect(ids(scoped).sort()).toEqual(["b1", "b2", "u1"]);
  });

  test("هیچ عنوان سرویسی در خروجی تکرار نمی‌شود", () => {
    const scoped = filterTemplatesForVehicle(LAYERED_TEMPLATES, {
      brand: "کیا",
      model: "سراتو",
    });

    const titles = scoped.map((row) => normalizeServiceTitle(row.service_name));
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("امتیاز سلامت از اینترکولِ مدل استفاده می‌کند، نه برند", () => {
    const scoped = filterTemplatesForVehicle(LAYERED_TEMPLATES, {
      brand: "کیا",
      model: "سراتو",
    });

    // شمع (مدل) + روغن گیربکس (برند) + تسمه تایم (مدل) + عمومی روغن موتور
    expect(scoped).toHaveLength(4);

    const plugs = scoped.find(
      (row) => normalizeServiceTitle(row.service_name) === "شمع"
    );

    const status = getTemplateStatus({
      template: plugs,
      services: [{ id: "s1", title: "شمع", mileage: 10000, service_date: "2026-06-01" }],
      currentMileage: 61000,
    });

    // آخرین سرویس ۱۰,۰۰۰ + اینترکول مدل ۶۰,۰۰۰ = موعد ۷۰,۰۰۰ ← سالم.
    // اگر عمومی (۵۰,۰۰۰) برنده شده بود موعد ۶۰,۰۰۰ می‌شد و «عقب‌افتاده».
    expect(status.status).toBe("good");
    expect(status.remaining).toBe(9000);
  });
});