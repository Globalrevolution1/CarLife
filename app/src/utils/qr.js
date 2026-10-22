import qrcode from "qrcode-generator";

// =============================================================
// تولید کد QR به‌صورت محلی — بدون هیچ درخواست به سرور بیرونی.
//
// کتابخانهٔ qrcode-generator خالص و بدون وابستگی جانبی است و
// همان چیزی را که لازم داریم می‌دهد: ماتریس ماژول‌ها. رندر
// نهایی با <svg> در ShareQr انجام می‌شود تا نیازی به
// dangerouslySetInnerHTML یا canvas نباشد.
//
// typeNumber 0 یعنی تشخیص خودکارِ کوچک‌ترین نسخهٔ مناسب؛
// سطح تصحیح خطا M استانداردِ چاپی است (تا حدود ۱۵٪ خطا را
// تحمل می‌کند) و برای روی کاغذ کافی است.
// =============================================================

const DEFAULT_ERROR_CORRECTION = "M";

/**
 * ماتریس QR را می‌سازد.
 *
 * @param {string} text متن لینک (فقط آسکی/URL)
 * @param {string} [errorCorrection] سطح تصحیح خطا
 * @returns {{size: number, modules: boolean[]} | null}
 *          خالی/نامعتبر → null
 */
export function buildQr(text, errorCorrection = DEFAULT_ERROR_CORRECTION) {
  if (typeof text !== "string" || text.trim() === "") {
    return null;
  }

  try {
    const qr = qrcode(0, errorCorrection);
    qr.addData(text);
    qr.make();

    const size = qr.getModuleCount();
    const modules = [];

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        modules.push(Boolean(qr.isDark(row, col)));
      }
    }

    return { size, modules };
  } catch {
    // متن خارج از ظرفیت نسخه‌ها → به‌جای crash، بدون QR ادامه می‌دهیم
    return null;
  }
}

/**
 * خواندن یک ماژول از ماتریس (row/col از بالا-چپ).
 */
export function isDarkAt(qr, row, col) {
  if (!qr || row < 0 || col < 0 || row >= qr.size || col >= qr.size) {
    return false;
  }

  return Boolean(qr.modules[row * qr.size + col]);
}

export default buildQr;
