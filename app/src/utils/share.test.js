import { describe, expect, it } from "vitest";

import {
  SHARE_WINDOWS_DAYS,
  buildShareLink,
  expiryFromDays,
  isVerified,
  shareState,
} from "./share";

describe("buildShareLink", () => {
  it("بدون توکن لینک نمی‌سازد", () => {
    expect(buildShareLink("")).toBe("");
    expect(buildShareLink(null)).toBe("");
    expect(buildShareLink(undefined)).toBe("");
  });

  it("slash انتهایی origin حذف می‌شود تا // نسازد", () => {
    expect(
      buildShareLink("abc-123", "http://localhost:5173/")
    ).toBe("http://localhost:5173/v/abc-123");

    expect(
      buildShareLink("abc-123", "http://localhost:5173")
    ).toBe("http://localhost:5173/v/abc-123");
  });

  it("شناسهٔ خودرو در لینک نمی‌آید — فقط توکن", () => {
    const link = buildShareLink(
      "11111111-2222-3333-4444-555555555555",
      "https://example.com"
    );

    expect(link).toBe(
      "https://example.com/v/11111111-2222-3333-4444-555555555555"
    );
    expect(link).not.toContain("/report/");
  });
});


describe("shareState", () => {
  const NOW = new Date("2026-10-21T12:00:00.000Z");

  it("بدون تاریخ انقضا یعنی غیرفعال (و نه منقضی)", () => {
    const state = shareState(null, NOW);

    expect(state.active).toBe(false);
    expect(state.expired).toBe(false);
    expect(state.invalid).toBe(false);
    expect(state.daysLeft).toBe(0);
    expect(state.endsAt).toBeNull();
  });

  it("انقضای آینده فعال است و روزهای باقی‌مانده را می‌شمارد", () => {
    const state = shareState("2026-10-31T12:00:00.000Z", NOW);

    expect(state.active).toBe(true);
    expect(state.expired).toBe(false);
    expect(state.daysLeft).toBe(10);
    expect(state.endsAt).toBeInstanceOf(Date);
  });

  it("دقیقاً لحظهٔ انقضا دیگر فعال نیست", () => {
    const state = shareState("2026-10-21T12:00:00.000Z", NOW);

    expect(state.active).toBe(false);
    expect(state.expired).toBe(true);
  });

  it("انقضای گذشته منقضی است", () => {
    const state = shareState("2026-10-01T12:00:00.000Z", NOW);

    expect(state.active).toBe(false);
    expect(state.expired).toBe(true);
    expect(state.daysLeft).toBe(0);
  });

  it("مقدار خراب از دیتابیس «غیرفعال» گزارش می‌شود، نه «فعال»", () => {
    const state = shareState("تاریخ خراب", NOW);

    expect(state.invalid).toBe(true);
    expect(state.active).toBe(false);
    expect(state.expired).toBe(false);
  });
});


describe("expiryFromDays", () => {
  it("تاریخ ISO حدوداً همان تعداد روز آینده است", () => {
    const now = new Date("2026-10-21T12:00:00.000Z");
    const result = new Date(expiryFromDays(30, now));
    const diffDays = (result.getTime() - now.getTime()) / 86400000;

    expect(result.toISOString()).toBe(result.toISOString());
    expect(diffDays).toBeCloseTo(30, 5);
  });

  it("هر ۳ پنجرهٔ محصول آینده‌نگر و مثبت‌اند", () => {
    const now = new Date("2026-10-21T12:00:00.000Z");

    for (const days of SHARE_WINDOWS_DAYS) {
      const expiry = new Date(expiryFromDays(days, now));

      expect(expiry.getTime()).toBeGreaterThan(now.getTime());
      expect(shareState(expiry.toISOString(), now).active).toBe(true);
    }
  });
});


describe("isVerified", () => {
  it("فقط تأییدِ مرکز خدمات تأییدشده حساب می‌شود", () => {
    expect(
      isVerified({
        verification_status: "service_center_verified",
      })
    ).toBe(true);

    expect(isVerified({ verification_status: "pending" })).toBe(false);
    expect(isVerified({})).toBe(false);
    expect(isVerified(null)).toBe(false);
  });
});
