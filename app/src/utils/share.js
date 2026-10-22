// =============================================================
// منطق لینک اشتراک پرونده (فاز ۸ — Trust & Resale)
//
// قواعد محصول:
//   * توکنِ جدا از شناسهٔ خودرو ساخته می‌شود تا شناسه‌ای که
//     در پرس‌وجوها می‌چرخد هرگز کلید دسترسی نشود.
//   * لینک «قابل لغو» است: با صفر کردن share_expires_at از
//     بین می‌رود (مسیر اصلی لغو).
//   * فعال‌سازی دوباره توکن را عوض می‌کند تا لینک‌های قبلیِ
//     چاپ‌شده بی‌اثر شوند؛ «تمدید» اما توکن را نگه می‌دارد چون
//     ممکن است QR آن قبلاً چاپ شده باشد.
// =============================================================

export const SHARE_WINDOWS_DAYS = [7, 30, 90];

const MS_PER_DAY = 24 * 60 * 60 * 1000;


/**
 * لینک عمومی گزارش را می‌سازد.
 *
 * @param {string} token
 * @param {string} [origin] پیش‌فرض: originِ فعلی صفحه
 * @returns {string} خالی اگر توکن نباشد
 */
export function buildShareLink(token, origin) {
  if (!token) {
    return "";
  }

  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");

  return `${base.replace(/\/+$/, "")}/v/${token}`;
}


/**
 * وضعیت لینک اشتراک.
 *
 * @param {string | null} expiresAt تاریخ انقضای ISO یا null
 * @param {Date} [now]
 * @returns {{
 *   active: boolean,
 *   expired: boolean,
 *   invalid: boolean,
 *   daysLeft: number,
 *   endsAt: Date | null
 * }}
 */
export function shareState(expiresAt, now = new Date()) {
  const idle = {
    active: false,
    expired: false,
    invalid: false,
    daysLeft: 0,
    endsAt: null,
  };

  if (!expiresAt) {
    return idle;
  }

  const endsAt = new Date(expiresAt);

  if (Number.isNaN(endsAt.getTime())) {
    // مقدار خراب از سمت دیتابیس → مثل «غیرفعال» رفتار می‌کنیم،
    // نه مثل «فعال». جهت خطا باید به سمت امن باشد.
    return { ...idle, invalid: true };
  }

  const remaining = endsAt.getTime() - now.getTime();

  if (remaining <= 0) {
    return { ...idle, expired: true, endsAt };
  }

  return {
    active: true,
    expired: false,
    invalid: false,
    daysLeft: Math.ceil(remaining / MS_PER_DAY),
    endsAt,
  };
}


/**
 * تاریخ انقضای ISO برای N روز آینده (UTC).
 *
 * @param {number} days
 * @param {Date} [now]
 * @returns {string}
 */
export function expiryFromDays(days, now = new Date()) {
  return new Date(now.getTime() + Number(days) * MS_PER_DAY).toISOString();
}


/**
 * تأیید شده توسط مرکز خدمات؟
 *
 * @param {{verification_status?: string}} service
 * @returns {boolean}
 */
export function isVerified(service) {
  return (
    service?.verification_status === "service_center_verified"
  );
}

export default buildShareLink;
