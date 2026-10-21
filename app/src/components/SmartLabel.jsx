/**
 * SmartLabel — نمایش صحیح دنبالهٔ «عدد + km» در چیدمان راست‌چین.
 *
 * متن فارسی راست‌چین است؛ الگوریتم دوجهتهٔ مرورگر در این حالت «10,000 km»
 * را وارونه می‌چیند و «km 10,000» نشان می‌دهد. قرار دادن هر تکهٔ «عدد+واحد»
 * داخل یک <bdi> (isolate) جهتِ همان تکه را قاطع می‌کند، بدون آنکه ترتیبِ
 * کلِ جملهٔ فارسی به هم بخورد.
 *
 * کاربرد: متن‌های آمادهٔ موتور سلامت، مثل «10,000 km عقب‌افتاده» یا
 * «25 روز دیگر». مقادیر خام را می‌توان مستقیم در <bdi> پیچید.
 */

const KM_PATTERN = "\\d[\\d,]*\\s*km";

export function SmartLabel({ children }) {
  const text = typeof children === "string" ? children : "";

  if (!text) {
    return null;
  }

  // عبارت داخل تابع ساخته می‌شود تا روی state بیرونی اثری نگذارد.
  const kmRun = new RegExp(KM_PATTERN, "gi");
  const parts = [];
  let cursor = 0;
  let match;
  let key = 0;

  while ((match = kmRun.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }

    parts.push(
      <bdi key={`km-${key}`}>{match[0]}</bdi>
    );

    cursor = match.index + match[0].length;
    key += 1;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}

export default SmartLabel;
