import { useMemo } from "react";

import { buildQr } from "../utils/qr";

// =============================================================
// ShareQr — نمایش SVG کد QR لینک اشتراک پرونده (فاز ۸)
//
// ماژول‌های تیره در یک <path> واحد جمع می‌شوند: هم سبک‌تر از
// صدها <rect> است، هم بدون dangerouslySetInnerHTML می‌سازیم
// (خروجی کتابخانه صرفاً اعداد است).
//
// shapeRendering: crispEdges → لبهٔ ماژول‌ها در چاپ تیز می‌ماند.
// =============================================================

function buildPath(qr) {
  const parts = [];

  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (qr.modules[row * qr.size + col]) {
        // هر ماژول یک مربع ۱×۱ در دستگاه مختصات viewBox
        parts.push(`M${col} ${row}h1v1h-1z`);
      }
    }
  }

  return parts.join("");
}


function ShareQr({ value, size = 132, label = "کد QR لینک گزارش" }) {
  const qr = useMemo(
    () => (value ? buildQr(value) : null),
    [value]
  );

  if (!qr) {
    return null;
  }

  return (
    <svg
      className="share-qr"
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      data-size={qr.size}
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />

      <path d={buildPath(qr)} fill="#071a33" />
    </svg>
  );
}

export default ShareQr;
