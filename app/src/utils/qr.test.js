import { describe, expect, it } from "vitest";

import { buildQr, isDarkAt } from "./qr";

const LINK = "https://example.com/v/11111111-2222-3333-4444-555555555555";


describe("buildQr", () => {
  it("ورودی خالی یا غیررشته‌ای null می‌دهد", () => {
    expect(buildQr("")).toBeNull();
    expect(buildQr("   ")).toBeNull();
    expect(buildQr(null)).toBeNull();
    expect(buildQr(12345)).toBeNull();
  });

  it("برای لینک اشتراک ماتریس مربعی می‌سازد", () => {
    const qr = buildQr(LINK);

    expect(qr).not.toBeNull();
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.size % 2).toBe(1); // اندازهٔ QR همیشه فرد است
    expect(qr.modules).toHaveLength(qr.size * qr.size);
  });

  it("الگوی یابندهٔ بالا-چپ سالم است (گوشه تیره، جداکننده روشن)", () => {
    const qr = buildQr(LINK);

    expect(isDarkAt(qr, 0, 0)).toBe(true); // گوشهٔ حلقه
    expect(isDarkAt(qr, 3, 3)).toBe(true); // مرکز ۳×۳
    expect(isDarkAt(qr, 1, 1)).toBe(false); // حلقهٔ داخلی خالی
    expect(isDarkAt(qr, 7, 7)).toBe(false); // جداکننده
  });

  it("دسترسی بیرون از ماتریس false می‌دهد (نه خطا)", () => {
    const qr = buildQr(LINK);

    expect(isDarkAt(qr, -1, 0)).toBe(false);
    expect(isDarkAt(qr, 0, qr.size)).toBe(false);
    expect(isDarkAt(null, 0, 0)).toBe(false);
  });

  it("دو متن متفاوت ماتریس متفاوت می‌دهند", () => {
    const a = buildQr(LINK);
    const b = buildQr(`${LINK}x`);

    const differs =
      a.size !== b.size ||
      a.modules.some((value, index) => value !== b.modules[index]);

    expect(differs).toBe(true);
  });

  it("متن فراتر از ظرفیت، به‌جای crash، null برمی‌گرداند", () => {
    expect(buildQr("x".repeat(6000))).toBeNull();
  });
});
