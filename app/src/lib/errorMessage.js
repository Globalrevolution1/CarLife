// =========================================================
// ترجمهٔ پیام‌های رایج Supabase/PostgREST به فارسی
//
// پیام‌هایی که خودمان با raise exception فارسی می‌دهیم
// (مانند «کد انتقال معتبر نیست») دست‌نخورده برمی‌گردند؛
// فقط پیام‌های فنیِ سرور ترجمه می‌شوند.
// =========================================================

export function toPersianError(message) {
  if (!message) {
    return "خطای ناشناخته‌ای رخ داد. لطفاً دوباره تلاش کنید.";
  }

  const text = String(message);

  if (text.indexOf("Could not find the function") >= 0) {
    return "این قابلیت هنوز روی سرور فعال نشده است. لطفاً بعداً دوباره تلاش کنید.";
  }

  if (text.indexOf("permission denied") >= 0) {
    return "شما اجازهٔ انجام این کار را ندارید.";
  }

  if (text.indexOf("JWT") >= 0 || text.indexOf("refresh_token") >= 0) {
    return "نشست شما منقضی شده است؛ لطفاً دوباره وارد شوید.";
  }

  if (
    text.indexOf("Failed to fetch") >= 0 ||
    text.indexOf("NetworkError") >= 0 ||
    text.indexOf("Failed to send request") >= 0
  ) {
    return "اتصال به اینترنت برقرار نیست. لطفاً دوباره تلاش کنید.";
  }

  if (text.indexOf("duplicate key") >= 0) {
    return "این رکورد قبلاً ثبت شده است.";
  }

  if (text.indexOf("Payload too large") >= 0 || text.indexOf("exceeded") >= 0) {
    return "حجم فایل بیشتر از حد مجاز است.";
  }

  if (text.indexOf("Bucket not found") >= 0) {
    return "بارگذاری فایل روی سرور در دسترس نیست. لطفاً بعداً تلاش کنید.";
  }

  if (text.indexOf("mime type") >= 0 || text.indexOf("not allowed") >= 0) {
    return "نوع فایل انتخابی مجاز نیست.";
  }

  if (text.indexOf("row is missing") >= 0) {
    return "رکورد موردنظر یافت نشد؛ ممکن است حذف شده باشد.";
  }

  // پیام فارسیِ تابع سمت سرور، یا هر خطای دیگری که ترجمهٔ دقیقی ندارد.
  return text;
}
