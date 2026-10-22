import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "../lib/supabase";
import {
  filterTemplatesForVehicle,
  getDueServices,
  getOverallHealth,
  getTemplateStatus,
} from "../utils/vehicleHealthEngine";

import "./../styles/VehicleReport.css";
import SmartLabel from "../components/SmartLabel";
import ShareQr from "../components/ShareQr";
import {
  buildShareLink,
  isVerified,
  shareState,
} from "../utils/share";

// =============================================================
// گزارش پروندهٔ دیجیتال خودرو — PRD Phase 7
//
// خروجی قابل چاپ / ذخیره به PDF (با window.print())؛
// نیازی به کتابخانهٔ جانبی ندارد و در همهٔ مرورگرها کار می‌کند.
//
// نکته: بخشِ ابزار (دکمه‌ها) با کلاس print-hide در چاپ
// حذف می‌شود.
// =============================================================

const HEALTH_TEXT = {
  good: "سالم",
  warning: "نیازمند توجه",
  danger: "عقب‌افتاده",
  unknown: "نامشخص",
};

// اولویت مرتب‌سازیِ برنامهٔ نگهداری در گزارش
const STATUS_RANK = {
  danger: 0,
  warning: 1,
  unknown: 2,
  good: 3,
};


function VehicleReport({ publicMode = false }) {

  const { id } = useParams();
  const navigate = useNavigate();

  const [car, setCar] = useState(null);
  const [services, setServices] = useState([]);
  const [centers, setCenters] = useState([]);
  const [serviceTemplates, setServiceTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  // فقط در حالت مالک: توکن و انقضای لینک اشتراک (برای نمایش QR)
  const [share, setShare] = useState(null);

  // فقط در حالت عمومی: تاریخ اعتبار لینکی که با آن آمده‌اند
  const [sharedUntil, setSharedUntil] = useState(null);


  // =========================================================
  // LOAD
  // =========================================================

  const loadReport = useCallback(async () => {
    setLoading(true);

    try {
      // -------------------------------------------------------
      // حالت عمومی (لینک اشتراک) — بدون ورود
      //
      // تنها دروازه، تابع دیتابیس است: شناسهٔ خودرو پذیرفته
      // نمی‌شود، فقط توکنِ منقضی‌نشده. RLS جدول vehicles برای
      // anon بسته است و عمداً هم باز نمی‌شود.
      // -------------------------------------------------------

      if (publicMode) {
        const { data, error } = await supabase.rpc(
          "get_shared_vehicle_report",
          { p_token: id },
        );

        if (error) {
          console.error("SHARED REPORT ERROR:", error);
          setCar(null);
          return;
        }

        if (!data || !data.vehicle) {
          setCar(null);
          return;
        }

        setCar(data.vehicle);
        setServices(
          (data.services || []).map((service) => ({
            ...service,
            // مرکز همراه با ردیف می‌آید؛ نیازی به جدول جدا نیست
            service_center_id: null,
          })),
        );
        setCenters([]);
        setSharedUntil(data.valid_until || null);
        setShare(null);
      } else {
        const {
          data: carData,
          error: carError,
        } = await supabase
          .from("vehicles")
          .select(`
            id,
            brand,
            model,
            production_year_solar,
            production_year_gregorian,
            color,
            vin,
            current_mileage,
            share_token,
            share_expires_at
          `)
          .eq("id", id)
          .single();

        if (carError) {
          console.error("REPORT VEHICLE ERROR:", carError);
          setCar(null);
          return;
        }

        setCar(carData);
        setShare(
          carData.share_token
            ? {
                token: carData.share_token,
                expiresAt: carData.share_expires_at,
              }
            : null,
        );
        setSharedUntil(null);

        const { data: servicesData } = await supabase
          .from("services")
          .select(`
            id,
            title,
            description,
            service_date,
            mileage,
            cost,
            verification_status,
            service_center_id
          `)
          .eq("vehicle_id", id)
          .order("service_date", { ascending: false })
          .order("created_at", { ascending: false });

        setServices(servicesData || []);

        const { data: centersData } = await supabase
          .from("service_centers")
          .select("id, name")
          .order("name", { ascending: true });

        setCenters(centersData || []);
      }

      const { data: templateData } = await supabase
        .from("service_templates")
        .select(`
          id,
          brand,
          model,
          service_name,
          interval_km,
          interval_months
        `)
        .order("interval_km", { ascending: true });

      setServiceTemplates(templateData || []);
    } catch (error) {
      console.error("REPORT LOAD ERROR:", error);
    } finally {
      setLoading(false);
    }
  }, [id, publicMode]);


  useEffect(() => {
    // fetch-on-mount؛ setState ها همگی بعد از await هستند.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReport();
  }, [loadReport]);


  // =========================================================
  // FORMAT
  // =========================================================

  function formatNumber(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    return Number(value).toLocaleString("en-US");
  }


  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("fa-IR");
  }


  // «هر ۱۰,۰۰۰ کیلومتر» / «هر ۶ ماه» / هر دو
  function formatInterval(template) {
    const parts = [];

    if (Number(template?.interval_km) > 0) {
      parts.push(
        `هر ${formatNumber(template.interval_km)} کیلومتر`
      );
    }

    if (Number(template?.interval_months) > 0) {
      parts.push(
        `هر ${formatNumber(template.interval_months)} ماه`
      );
    }

    return parts.length > 0
      ? parts.join(" یا ")
      : "مشخص نیست";
  }


  function getCenterName(service) {
    // در حالت عمومی، نام مرکز همراه خود سرویس می‌آید
    if (service.center_name) {
      return service.center_name;
    }

    if (!service.service_center_id) {
      return "";
    }

    const center = centers.find(
      (item) => item.id === service.service_center_id,
    );

    return center ? center.name : "";
  }


  // =========================================================
  // DERIVED
  // =========================================================

  const TODAY = new Date();

  const health =
    car && getOverallHealth({
      templates: serviceTemplates,
      services,
      currentMileage: car.current_mileage || 0,
      vehicle: car,
      currentDate: TODAY,
      formatNumber,
    });


  const plan =
    car
      ? filterTemplatesForVehicle(serviceTemplates, car)
          .map((template) => ({
            template,
            status: getTemplateStatus({
              template,
              services,
              currentMileage: car.current_mileage || 0,
              currentDate: TODAY,
              formatNumber,
            }),
          }))
          .sort(
            (a, b) =>
              STATUS_RANK[a.status.status] -
              STATUS_RANK[b.status.status],
          )
      : [];


  const reminders =
    car
      ? getDueServices({
          templates: serviceTemplates,
          services,
          currentMileage: car.current_mileage || 0,
          vehicle: car,
          currentDate: TODAY,
          formatNumber,
        })
      : [];


  const reportDate = new Date().toLocaleDateString("fa-IR");


  // =========================================================
  // فاز ۸ — Trust & Resale
  // =========================================================

  // سرویس‌هایی که مرکز خدمات تأیید کرده (Verified History)
  const verifiedCount = services.filter(isVerified).length;


  // وضعیت لینک اشتراک — فقط مالک توکن را دارد
  const shareStatus = share
    ? shareState(share.expiresAt, TODAY)
    : {
        active: false,
        expired: false,
        invalid: false,
        daysLeft: 0,
        endsAt: null,
      };


  const shareLink =
    shareStatus.active && share
      ? buildShareLink(share.token)
      : "";


  // =========================================================
  // STATES
  // =========================================================

  if (loading) {
    return (
      <div className="report-page">
        <div className="report-sheet">
          <p className="report-msg">
            در حال تهیهٔ گزارش...
          </p>
        </div>
      </div>
    );
  }


  if (!car || !health) {
    return (
      <div className="report-page">
        <div className="report-sheet">
          <p className="report-msg">
            {publicMode
              ? "این پرونده در دسترس نیست؛ لینک منقضی یا باطل شده است."
              : "خودرویی با این شناسه پیدا نشد."}
          </p>

          {publicMode ? (
            <p className="report-note">
              برای دریافت نسخهٔ تازه، از مالک خودرو بخواهید لینک
              اشتراک جدیدی بفرستد.
            </p>
          ) : (
            <button
              type="button"
              className="report-btn"
              onClick={() => navigate("/dashboard")}
            >
              بازگشت به داشبورد
            </button>
          )}
        </div>
      </div>
    );
  }


  // =========================================================
  // REPORT
  // =========================================================

  return (
    <div className="report-page">

      {/* ---------- TOOLBAR (در چاپ پنهان) ---------- */}

      <div className="report-toolbar print-hide">

        {publicMode ? (
          <span className="report-share-badge">
            🔗 پروندهٔ اشتراک‌گذاری‌شده
            {sharedUntil
              ? ` — معتبر تا ${formatDate(sharedUntil)}`
              : ""}
          </span>
        ) : (
          <button
            type="button"
            className="report-btn ghost"
            onClick={() => navigate(`/car-profile/${car.id}`)}
          >
            → بازگشت به پرونده
          </button>
        )}

        <button
          type="button"
          className="report-btn"
          onClick={() => window.print()}
        >
          🖨️ چاپ / ذخیره PDF
        </button>

      </div>


      {/* ---------- SHEET ---------- */}

      <div className="report-sheet">

        <header className="report-head">

          <div className="report-logo">
            کارنگار
          </div>

          <h1>
            گزارش پروندهٔ دیجیتال خودرو
          </h1>

          <p className="report-meta">
            تاریخ تهیه: {reportDate}
          </p>

          {publicMode && (
            <p className="report-meta">
              نسخهٔ اشتراکی — اعتبار لینک تا{" "}
              {formatDate(sharedUntil)}
            </p>
          )}

        </header>


        {/* ---------- 1. VEHICLE ---------- */}

        <section className="report-section">

          <h2>۱. اطلاعات خودرو</h2>

          <dl className="report-grid">

            <div>
              <dt>برند</dt>
              <dd>{car.brand || "—"}</dd>
            </div>

            <div>
              <dt>مدل</dt>
              <dd>{car.model || "—"}</dd>
            </div>

            <div>
              <dt>سال تولید</dt>
              <dd>
                {car.production_year_solar ||
                  car.production_year_gregorian ||
                  "—"}
              </dd>
            </div>

            <div>
              <dt>رنگ</dt>
              <dd>{car.color || "—"}</dd>
            </div>

            <div>
              <dt>شمارهٔ شاسی (VIN)</dt>
              <dd className="ltr">{car.vin || "—"}</dd>
            </div>

            <div>
              <dt>کیلومتر فعلی</dt>
              <dd>
                <bdi>
                  {formatNumber(car.current_mileage)} km
                </bdi>
              </dd>
            </div>

          </dl>

        </section>


        {/* ---------- 2. HEALTH ---------- */}

        <section className="report-section">

          <h2>۲. وضعیت سلامت</h2>

          <div className={`report-health ${health.className}`}>

            <strong>
              {health.score !== null ? (
                <bdi>{health.score}٪</bdi>
              ) : (
                "—"
              )}
            </strong>

            <span>
              {HEALTH_TEXT[health.className]}
            </span>

          </div>

          <p className="report-note">
            امتیاز بر اساس فاصلهٔ سرویس هر قلم (کیلومتر و زمان)
            نسبت به آخرین سرویس ثبت‌شده محاسبه می‌شود.
          </p>

        </section>


        {/* ---------- 3. REMINDERS ---------- */}

        {reminders.length > 0 && (

          <section className="report-section">

            <h2>۳. یادآوری‌ها</h2>

            <table className="report-table">

              <thead>
                <tr>
                  <th>سرویس</th>
                  <th>وضعیت</th>
                  <th>موعد</th>
                </tr>
              </thead>

              <tbody>
                {reminders.map((item) => (
                  <tr key={item.template.id}>

                    <td>{item.template.service_name}</td>

                    <td>
                      {item.status.status === "danger"
                        ? "عقب‌افتاده"
                        : "نزدیک موعد"}
                      {" — "}
                      <SmartLabel>
                        {item.status.label}
                      </SmartLabel>
                    </td>

                    <td>
                      {item.status.nextMileage !== null && (
                        <bdi>
                          {formatNumber(item.status.nextMileage)} km
                        </bdi>
                      )}
                      {item.status.nextMileage !== null &&
                        item.status.nextDate &&
                        " یا "}
                      {item.status.nextDate && (
                        <bdi>
                          {formatDate(item.status.nextDate)}
                        </bdi>
                      )}
                      {item.status.nextMileage === null &&
                        !item.status.nextDate &&
                        "—"}
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>

          </section>

        )}


        {/* ---------- MAINTENANCE PLAN ---------- */}

        <section className="report-section">

          <h2>
            {reminders.length > 0 ? "۴" : "۳"}. برنامهٔ نگهداری
          </h2>

          {plan.length === 0 ? (

            <p className="report-msg">
              برای این خودرو برنامهٔ سرویسی ثبت نشده است.
            </p>

          ) : (

            <table className="report-table">

              <thead>
                <tr>
                  <th>سرویس</th>
                  <th>فاصله</th>
                  <th>وضعیت</th>
                  <th>سرویس بعدی</th>
                </tr>
              </thead>

              <tbody>
                {plan.map(({ template, status }) => (
                  <tr key={template.id}>

                    <td>{template.service_name}</td>

                    <td>{formatInterval(template)}</td>

                    <td>
                      <SmartLabel>
                        {status.label}
                      </SmartLabel>
                    </td>

                    <td>
                      {status.nextMileage !== null && (
                        <bdi>
                          {formatNumber(status.nextMileage)} km
                        </bdi>
                      )}
                      {status.nextMileage !== null &&
                        status.nextDate &&
                        " یا "}
                      {status.nextDate && (
                        <bdi>
                          {formatDate(status.nextDate)}
                        </bdi>
                      )}
                      {status.nextMileage === null &&
                        !status.nextDate &&
                        "—"}
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>

          )}

        </section>


        {/* ---------- SERVICE HISTORY ---------- */}

        <section className="report-section">

          <h2>
            {reminders.length > 0 ? "۵" : "۴"}. تاریخچهٔ سرویس‌ها
          </h2>

          {verifiedCount > 0 && (
            <p className="report-verified-note">
              ✓ {formatNumber(verifiedCount)} از{" "}
              {formatNumber(services.length)} سرویس توسط مرکز
              خدمات تأیید شده است.
            </p>
          )}

          {services.length === 0 ? (

            <p className="report-msg">
              هنوز سرویسی ثبت نشده است.
            </p>

          ) : (

            <table className="report-table">

              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>کیلومتر</th>
                  <th>سرویس</th>
                  <th>هزینه (تومان)</th>
                  <th>مرکز خدمات</th>
                </tr>
              </thead>

              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>

                    <td>{formatDate(service.service_date)}</td>

                    <td>{formatNumber(service.mileage)}</td>

                    <td>
                      {service.title}

                      {/* اگر شرح عیناً عنوان باشد (دادهٔ پایهٔ 011)
                          نمایشش فقط ظاهر گزارش را خراب می‌کند */}
                      {service.description &&
                        service.description.trim() !==
                          service.title.trim() && (
                          <small className="report-desc">
                            {service.description}
                          </small>
                        )}

                      {isVerified(service) && (
                        <span className="report-verified">
                          ✓ تأیید مرکز خدمات
                        </span>
                      )}
                    </td>

                    <td>
                      {service.cost != null
                        ? formatNumber(service.cost)
                        : "—"}
                    </td>

                    <td>
                      {getCenterName(service) || "—"}
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>

          )}

        </section>


        {/* ---------- SHARE QR (فقط نسخهٔ مالک و لینک فعال) ---------- */}

        {!publicMode && shareLink && (
          <section className="report-section report-share-block">
            <h2>مشاهدهٔ آنلاین پرونده</h2>

            <div className="report-share-inner">
              <ShareQr value={shareLink} size={112} />

              <div>
                <p className="report-share-link ltr">
                  {shareLink}
                </p>

                <p className="report-note">
                  خریدار می‌تواند با اسکن این کد یا باز کردن لینک،
                  گزارش را بدون ورود ببیند. اعتبار تا{" "}
                  {formatDate(share.expiresAt)}؛ پس از آن یا با
                  لغو اشتراک، لینک از کار می‌افتد.
                </p>
              </div>
            </div>
          </section>
        )}


        {/* ---------- FOOTER ---------- */}

        <footer className="report-foot">

          <p>
            این گزارش از روی داده‌های ثبت‌شده در کارنگار تهیه شده است؛
            جایگزین رسید یا گواهی رسمی نیست.
          </p>

          <p className="ltr">
            karnegar — {car.brand} {car.model}
          </p>

        </footer>

      </div>

    </div>
  );

}


export default VehicleReport;
