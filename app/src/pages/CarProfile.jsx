import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toPersianError } from "../lib/errorMessage";
import AppHeader from "../components/AppHeader";
import SmartLabel from "../components/SmartLabel";
import ShareQr from "../components/ShareQr";
import {
  SHARE_WINDOWS_DAYS,
  buildShareLink,
  expiryFromDays,
  shareState,
} from "../utils/share";
import {
  filterTemplatesForVehicle,
  getLatestService,
  getOverallHealth as engineGetOverallHealth,
  getTemplateStatus as engineGetTemplateStatus,
  getUpcomingServices as engineGetUpcomingServices,
  getDueServices as engineGetDueServices,
} from "../utils/vehicleHealthEngine";
import "./../styles/CarProfile.css";

// bucket تصویر فاکتور (migration 015). خصوصی است،
// پس نمایش فقط با لینک امضاشده (۱ ساعته) ممکن است.
const INVOICE_BUCKET = "service-invoices";

const INVOICE_URL_TTL = 3600;

/**
 * برای هر سرویسِ دارای تصویر، یک لینک امضاشده می‌گیرد.
 *
 * اگر سرویس تصویر نداشته باشد یا ساخت لینک خطا بدهد،
 * invoiceUrl برابر null می‌ماند و رندر پیام «در دسترس نیست»
 * می‌دهد؛ یعنی خواندنِ عکسِ بقیهٔ سرویس‌ها متوقف نمی‌شود.
 *
 * @param {Array<object>} services
 * @returns {Promise<Array<object>>}
 */
async function attachInvoiceUrls(services) {
  return Promise.all(
    services.map(async (service) => {
      if (!service.image) {
        return { ...service, invoiceUrl: null };
      }

      const { data, error } = await supabase.storage
        .from(INVOICE_BUCKET)
        .createSignedUrl(service.image, INVOICE_URL_TTL);

      return {
        ...service,
        invoiceUrl:
          !error && data && data.signedUrl
            ? data.signedUrl
            : null,
      };
    })
  );
}

function CarProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [car, setCar] = useState(null);
  const [services, setServices] = useState([]);
  const [serviceTemplates, setServiceTemplates] = useState([]);
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  // انتقال پرونده به خریدار (بخش ۲ PRD)
  const [transferCode, setTransferCode] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");

  // اشتراک‌گذاری لینک گزارش (فاز ۸)
  const [shareDays, setShareDays] = useState(30);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  // =========================================================
  // LOAD CAR
  //
  // با useCallback تعریف می‌شود تا effect به آخرین نسخه
  // تابع وصل بماند و اشکال react-hooks/immutability رفع شود.
  // =========================================================

  const loadCar = useCallback(async () => {
    setLoading(true);

    try {
      // ==========================================
      // VEHICLE
      // ==========================================

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
        console.error("CAR ERROR:", carError);
        setCar(null);
        setLoading(false);
        return;
      }

      setCar(carData);

      // ==========================================
      // SERVICES
      // ==========================================

      const {
        data: servicesData,
        error: servicesError,
      } = await supabase
        .from("services")
        .select(`
          id,
          vehicle_id,
          title,
          description,
          service_date,
          mileage,
          cost,
          image,
          service_center_id,
          verification_status,
          created_at,
          created_by
        `)
        .eq("vehicle_id", id)
        .order("mileage", {
          ascending: false,
        })
        .order("service_date", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        });

      if (servicesError) {
        console.error("SERVICES ERROR:", servicesError);
        setServices([]);
      } else {
        setServices(
          await attachInvoiceUrls(servicesData || [])
        );
      }

      // ==========================================
      // SERVICE CENTERS (برای نمایش «مرکز انجام‌دهنده»)
      // ==========================================

      const { data: centersData } = await supabase
        .from("service_centers")
        .select("id, name")
        .order("name", { ascending: true });

      setCenters(centersData || []);

      // ==========================================
      // SERVICE TEMPLATES
      // ==========================================

      // -----------------------------------------------
      // همهٔ template ها را می‌گیریم، نه فقط جفت (brand, model).
      //
      // دلیل: جدول ردیف‌های «عمومی» دارد (brand خالی = برای همه)
      // و برای مدل‌هایی که هنوز ردیف اختصاصی ندارند باید به
      // ردیف‌های برند برگردیم. فیلتر نهایی با
      // filterTemplatesForVehicle انجام می‌شود.
      // -----------------------------------------------

      const {
        data: templateData,
        error: templateError,
      } = await supabase
        .from("service_templates")
        .select(`
          id,
          brand,
          model,
          service_name,
          interval_km,
          interval_months
        `)
        .order("interval_km", {
          ascending: true,
        });

      if (templateError) {
        console.error("TEMPLATE ERROR:", templateError);
        setServiceTemplates([]);
      } else {
        setServiceTemplates(templateData || []);
      }
    } catch (error) {
      console.error("LOAD CAR ERROR:", error);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    // fetch-on-mount؛ setState ها بعد از await هستند.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCar();
  }, [loadCar]);

  // ==========================================
  // FORMAT NUMBER
  // ==========================================

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
      : "فاصلهٔ سرویس مشخص نیست";
  }

  // نام مرکز خدماتِ انجام‌دهندهٔ سرویس
  // (PRD ← تاریخچه خودرو ← مرکز خدمات انجام‌دهنده)
  function getCenterName(centerId) {
    if (!centerId) {
      return "";
    }

    const center = centers.find(
      (item) => item.id === centerId
    );

    return center ? center.name : "";
  }

  // ==========================================
  // FORMAT DATE
  // ==========================================

  function formatDate(dateString) {
    if (!dateString) {
      return "ثبت نشده";
    }

    return new Date(dateString).toLocaleDateString("fa-IR");
  }

// ==========================================
  // MAINTENANCE / HEALTH LOGIC
  //
  // منطق اصلی در src/utils/vehicleHealthEngine.js است
  // تا فقط یک پیاده‌سازی وجود داشته باشد.
  // این توابع صرفاً wrapper هستند و context محلی
  // (services و car) را به Engine می‌دهند.
  // ==========================================

  // امروز — مبنای سنجش «ماه» در موتور سلامت.
  // هر بار رندر محاسبه می‌شود تا صفحهٔ بازمانده از دیروز،
  // انتظارِ اشتباه نشان ندهد.
  const TODAY = new Date();

  function getTemplateStatus(
    template,
  ) {
    return engineGetTemplateStatus({
      template,
      services,
      currentMileage:
        car?.current_mileage || 0,
      currentDate: TODAY,
      formatNumber,
    });
  }

  function getOverallHealth() {
    return engineGetOverallHealth({
      templates: filterTemplatesForVehicle(
        serviceTemplates,
        car
      ),
      services,
      currentMileage:
        car?.current_mileage || 0,
      vehicle: car,
      currentDate: TODAY,
      formatNumber,
    });
  }
  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <h2>
            در حال آماده سازی پرونده...
          </h2>
        </div>
      </div>
    );
  }

  // ==========================================
  // CAR NOT FOUND
  // ==========================================

  if (!car) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <h2>
            پرونده خودرو پیدا نشد.
          </h2>
        </div>
      </div>
    );
  }

  // ==========================================
  // LAST SERVICE
  // ==========================================

  const lastService =
    getLatestService(services);

  // ==========================================
  // HEALTH
  // ==========================================

  // فقط template های همین خودرو: جفت (brand, model) دقیق،
  // و اگر نبود ردیف‌های همان برند، و در نهایت ردیف‌های عمومی
  const scopedTemplates =
    filterTemplatesForVehicle(
      serviceTemplates,
      car
    );

  const health =
    getOverallHealth();

  // ==========================================
  // UPCOMING SERVICES
  // ==========================================

  const upcomingServices =
    engineGetUpcomingServices({
      templates: scopedTemplates,
      services,
      currentMileage:
        car?.current_mileage || 0,
      currentDate: TODAY,
      formatNumber,
    });

  // سرویس‌های عقب‌افتاده / نزدیک‌موعد — بخش «یادآوری‌ها»
  const dueServices =
    engineGetDueServices({
      templates: scopedTemplates,
      services,
      currentMileage:
        car?.current_mileage || 0,
      currentDate: TODAY,
      formatNumber,
    });

  const nextService =
    upcomingServices.length > 0
      ? upcomingServices[0]
      : null;

  // =========================================================
  // انتقال پرونده: ساخت کد (بخش ۲ PRD)
  //
  // تابع سمت سرور SECURITY DEFINER است و فقط مالکِ فعال
  // خودرو می‌تواند کد بسازد.
  // =========================================================
  async function handleCreateTransfer() {
    setTransferBusy(true);
    setTransferError("");
    setTransferCode("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "create_transfer_code",
        { p_vehicle_id: id }
      );

      if (rpcError) {
        setTransferError(toPersianError(rpcError.message));
        setTransferBusy(false);
        return;
      }

      setTransferCode(data);
      setTransferBusy(false);
    } catch (unexpected) {
      setTransferError(toPersianError(unexpected && unexpected.message));
      setTransferBusy(false);
    }
  }

  // =========================================================
  // اشتراک‌گذاری لینک عمومی گزارش (فاز ۸ — Trust & Resale)
  //
  // نوشتن روی vehicles فقط برای مالکِ فعال مجاز است
  // (policy «Owners can update their vehicles» از 012).
  //
  // «فعال‌سازی» توکن را عوض می‌کند تا لینک‌های قبلیِ احتمالی
  // (چاپ‌شده یا فرستاده‌شده) بی‌اثر شوند؛ «تمدید» اما توکن را
  // نگه می‌دارد چون ممکن است QR آن قبلاً چاپ شده باشد.
  // «لغو» فقط مهلت را صفر می‌کند و تابع دیتابیس دیگر چیزی
  // برنمی‌گرداند.
  // =========================================================

  const shareStatus = car
    ? shareState(car.share_expires_at)
    : shareState(null);

  const shareLink =
    shareStatus.active && car && car.share_token
      ? buildShareLink(car.share_token)
      : "";


  async function handleShare(mode) {
    setShareBusy(true);
    setShareError("");
    setShareCopied(false);

    try {
      let payload;

      if (mode === "revoke") {
        payload = { share_expires_at: null };
      } else if (mode === "extend") {
        // تمدید از لحظهٔ انقضای فعلی ادامه پیدا می‌کند تا کاربر
        // روزهای خریداری‌شده را از دست ندهد.
        payload = {
          share_expires_at: shareStatus.active
            ? new Date(
                shareStatus.endsAt.getTime() +
                  shareDays * 86400000
              ).toISOString()
            : expiryFromDays(shareDays),
        };
      } else {
        // چرخش توکن فقط در context امن ممکن است؛ در غیر این صورت
        // توکن فعلی حفظ می‌شود (link همچنان کار می‌کند).
        const rotated =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : car.share_token;

        if (!rotated) {
          setShareError(
            "توکن اشتراک برای این خودرو ساخته نشده است؛ صفحه را تازه‌سازی کنید."
          );
          setShareBusy(false);
          return;
        }

        payload = {
          share_token: rotated,
          share_expires_at: expiryFromDays(shareDays),
        };
      }

      const { error } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", car.id);

      if (error) {
        throw error;
      }

      await loadCar();
    } catch (unexpected) {
      setShareError(
        toPersianError(unexpected && unexpected.message)
      );
    } finally {
      setShareBusy(false);
    }
  }


  async function handleCopyShareLink() {
    setShareError("");
    setShareCopied(false);

    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
    } catch {
      setShareError(
        "کپی خودکار ممکن نبود؛ لینک را دستی انتخاب و کپی کنید."
      );
    }
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="profile-page">

      <div className="profile-card">

        {/* ================================= */}
        {/* HEADER */}
        {/* ================================= */}

        <AppHeader />

        {/* ================================= */}
        {/* VEHICLE */}
        {/* ================================= */}

        <div className="vehicle-hero">

          <div className="car-icon">
            🚗
          </div>

          <h1>
            {car.brand}
          </h1>

          <h2>
            {car.model}
          </h2>

          <div className="vehicle-meta">

            <span>
              {car.production_year_solar}
            </span>

            <span>
              {car.color}
            </span>

          </div>

          <div className="active-badge">
            ✓ پرونده فعال
          </div>

        </div>

        {/* ================================= */}
        {/* HEALTH */}
        {/* ================================= */}

        <div className="summary-card">

          <h3>
            وضعیت خودرو
          </h3>

          <div className="summary-item">

            <span>
              سلامت خودرو
            </span>

            <strong>

              {health.className ===
                "good" &&
                "🟢 "}

              {health.className ===
                "warning" &&
                "🟡 "}

              {health.className ===
                "danger" &&
                "🔴 "}

              {health.className ===
                "unknown" &&
                "⚪ "}

              {health.label}

            </strong>

          </div>

          <div className="summary-item">

            <span>
              امتیاز سلامت
            </span>

            <strong>
              {health.score !== null ? (
                <bdi>{health.score}%</bdi>
              ) : (
                "—"
              )}
            </strong>

          </div>

          <div className="summary-item">

            <span>
              تعداد سرویس‌ها
            </span>

            <strong>
              {services.length}
            </strong>

          </div>

          <div className="summary-item">

            <span>
              آخرین سرویس
            </span>

            <strong>

              {lastService
                ? lastService.title
                : "ثبت نشده"}

            </strong>

          </div>

          <div className="summary-item">

            <span>
              سرویس بعدی
            </span>

            <strong>

              {nextService
                ? nextService.status
                    .label
                : "ثبت نشده"}

            </strong>

          </div>

        </div>

        {/* ================================= */}
        {/* MAINTENANCE PLAN */}
        {/* ================================= */}

        <div className="service-template-card">

          <h3>
            🔔 برنامه نگهداری پیشنهادی
          </h3>

          {scopedTemplates.length ===
          0 ? (

            <p>
              برای این خودرو برنامه
              سرویس ثبت نشده است.
            </p>

          ) : (

            scopedTemplates.map(
              (template) => {

                const status =
                  getTemplateStatus(
                    template
                  );

                return (
                  <div
                    key={template.id}
                    className="template-item"
                  >

                    <div>

                      <span>
                        {
                          template.service_name
                        }
                      </span>

                      <strong>
                        {formatInterval(
                          template
                        )}
                      </strong>

                    </div>

                    <div>

                      <span>

                        {status.status ===
                          "good" &&
                          "🟢"}

                        {status.status ===
                          "warning" &&
                          "🟡"}

                        {status.status ===
                          "danger" &&
                          "🔴"}

                        {status.status ===
                          "unknown" &&
                          "⚪"}

                        {" "}

                        <SmartLabel>
                          {status.label}
                        </SmartLabel>

                      </span>

                      {status.nextMileage !==
                        null && (
                        <small>
                          سرویس بعدی:{" "}
                          <bdi>
                            {formatNumber(
                              status.nextMileage
                            )}{" "}
                            km
                          </bdi>
                        </small>
                      )}

                      {status.nextDate && (
                        <small>
                          از نظر زمانی:{" "}
                          <bdi>
                            {formatDate(
                              status.nextDate
                            )}
                          </bdi>
                        </small>
                      )}

                      {status.lastService && (
                        <small>
                          آخرین سرویس:{" "}
                          <bdi>
                            {formatNumber(
                              status.lastService
                                .mileage
                            )}{" "}
                            km
                          </bdi>
                        </small>
                      )}

                    </div>

                  </div>
                );
              }
            )

          )}

        </div>

        {/* ================================= */}
        {/* REMINDERS — PRD Phase 5           */}
        {/* عقب‌افتاده‌ها و نزدیک‌موعدها       */}
        {/* ================================= */}

        {dueServices.length > 0 && (
          <div className="reminder-card">

            <h3>
              ⏰ یادآوری‌ها
            </h3>

            <p className="reminder-count">
              {formatNumber(dueServices.length)} مورد نیاز به توجه
            </p>

            {dueServices.map((item) => (
              <div
                key={item.template.id}
                className={`template-item ${
                  item.status.status === "danger"
                    ? "is-overdue"
                    : "is-soon"
                }`}
              >

                <div>

                  <span>
                    {item.template.service_name}
                  </span>

                  <strong>
                    <SmartLabel>
                      {item.status.label}
                    </SmartLabel>
                  </strong>

                </div>

                <div>

                  <span>
                    {item.status.status === "danger"
                      ? "🔴 عقب‌افتاده"
                      : "🟡 نزدیک موعد"}
                  </span>

                  {item.status.nextDate && (
                    <small>
                      موعد زمانی:{" "}
                      {formatDate(item.status.nextDate)}
                    </small>
                  )}

                  {item.status.nextMileage !==
                    null && (
                    <small>
                      موعد کیلومتری:{" "}
                      <bdi>
                        {formatNumber(
                          item.status.nextMileage
                        )}{" "}
                        km
                      </bdi>
                    </small>
                  )}

                </div>

              </div>
            ))}

          </div>
        )}

        {/* ================================= */}
        {/* CAR INFORMATION */}
        {/* ================================= */}

        <div className="car-info">

          <h3>
            اطلاعات خودرو
          </h3>

          <div>
            <span>
              برند:
            </span>

            {car.brand}
          </div>

          <div>
            <span>
              مدل:
            </span>

            {car.model}
          </div>

          <div>
            <span>
              سال تولید:
            </span>

            {car.production_year_solar}
          </div>

          <div>
            <span>
              رنگ:
            </span>

            {car.color}
          </div>

          <div>
            <span>
              کیلومتر فعلی:
            </span>

            <bdi>
              {formatNumber(
                car.current_mileage
              )}{" "}
              km
            </bdi>
          </div>

          <div>
            <span>
              VIN:
            </span>

            {car.vin}
          </div>

        </div>

        <button
          className="continue-btn"
          onClick={() =>
            navigate(`/car-edit/${car.id}`)
          }
          type="button"
        >
          ✏️ ویرایش اطلاعات خودرو
        </button>

        <button
          className="continue-btn"
          onClick={() =>
            navigate(`/report/${car.id}`)
          }
          type="button"
          style={{ marginTop: "10px", background: "#071a33" }}
        >
          📄 خروجی گزارش خودرو (چاپ / PDF)
        </button>

        {/* ================================= */}
        {/* SHARE PUBLIC REPORT — فاز ۸      */}
        {/* ================================= */}

        <div className="car-info share-box">

          <h3>
            🔗 اشتراک گزارش با خریدار
          </h3>

          <p className="share-lead">
            لینک عمومی، گزارش کامل (تاریخچهٔ سرویس، سلامت،
            کیلومتر و VIN) را بدون ورود نشان می‌دهد. تا وقتی
            فعال است قابل استفاده است و هر زمان بخواهید با یک
            دکمه باطل می‌شود.
          </p>

          <div className="share-row">
            <label htmlFor="share-days">
              مدت اعتبار
            </label>

            <select
              id="share-days"
              value={shareDays}
              disabled={shareBusy}
              onChange={(event) =>
                setShareDays(Number(event.target.value))
              }
            >
              {SHARE_WINDOWS_DAYS.map((days) => (
                <option key={days} value={days}>
                  {days} روز
                </option>
              ))}
            </select>
          </div>

          {shareError && (
            <div className="share-error">
              {shareError}
            </div>
          )}

          {shareStatus.active && shareLink ? (
            <div className="share-on">

              <div
                className={`share-status ${
                  shareStatus.daysLeft <= 3
                    ? "is-soon"
                    : "is-ok"
                }`}
              >
                🟢 لینک فعال — تا{" "}
                {formatDate(shareStatus.endsAt)} (
                {formatNumber(shareStatus.daysLeft)} روز مانده)
              </div>

              <input
                className="share-link ltr"
                readOnly
                value={shareLink}
                onFocus={(event) => event.target.select()}
              />

              <div className="share-actions">
                <button
                  type="button"
                  className="share-btn primary"
                  onClick={handleCopyShareLink}
                  disabled={shareBusy}
                >
                  {shareCopied ? "✓ کپی شد" : "کپی لینک"}
                </button>

                <button
                  type="button"
                  className="share-btn"
                  onClick={() => handleShare("extend")}
                  disabled={shareBusy}
                >
                  ⏳ تمدید {shareDays} روز
                </button>

                <button
                  type="button"
                  className="share-btn danger"
                  onClick={() => handleShare("revoke")}
                  disabled={shareBusy}
                >
                  ✕ لغو لینک
                </button>
              </div>

              <div className="share-qr-wrap">
                <ShareQr value={shareLink} size={126} />

                <small>
                  کد QR همین لینک است؛ در نسخهٔ چاپیِ گزارش هم
                  چاپ می‌شود تا خریدار با موبایل اسکن کند.
                </small>
              </div>

            </div>
          ) : (
            <div className="share-off">

              <div className="share-status is-off">
                ⚪ لینک عمومی غیرفعال است
                {shareStatus.expired
                  ? " (لینک قبلی منقضی شده)"
                  : ""}
              </div>

              <div className="share-actions">
                <button
                  type="button"
                  className="share-btn primary"
                  onClick={() => handleShare("activate")}
                  disabled={shareBusy}
                >
                  🔗 فعال‌سازی لینک {shareDays} روزه
                </button>
              </div>

            </div>
          )}

        </div>

        {/* ================================= */}
        {/* TRANSFER TO NEXT OWNER */}
        {/* ================================= */}

        <div
          className="car-info"
          style={{ marginTop: "20px" }}
        >
          <h3>
            انتقال پرونده به خریدار
          </h3>

          <p
            style={{
              color: "#667085",
              fontSize: "13px",
              lineHeight: "2",
            }}
          >
            برای فروش خودرو یک کد بسازید و به خریدار بدهید. خریدار آن را در بخش «دریافت پرونده» وارد می‌کند و کل تاریخچهٔ سلامت به حساب او منتقل می‌شود. دسترسی شما بعد از انتقال بسته می‌شود.
          </p>

          {transferError && (
            <div
              style={{
                background: "#fee2e2",
                color: "#b91c1c",
                padding: "12px",
                borderRadius: "10px",
                margin: "12px 0",
                lineHeight: "1.9",
                fontSize: "14px",
              }}
            >
              {transferError}
            </div>
          )}

          {transferCode ? (
            <div
              style={{
                background: "#071a33",
                color: "#f5d97b",
                padding: "18px",
                borderRadius: "14px",
                textAlign: "center",
                margin: "12px 0",
              }}
            >
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: "800",
                  letterSpacing: "6px",
                  direction: "ltr",
                }}
              >
                {transferCode}
              </div>

              <div
                style={{
                  color: "#d8dee8",
                  fontSize: "12px",
                  marginTop: "8px",
                  lineHeight: "1.9",
                }}
              >
                این کد تا ۷۲ ساعت معتبر است و فقط یک بار قابل استفاده است.
              </div>
            </div>
          ) : (
            <button
              className="continue-btn"
              onClick={handleCreateTransfer}
              disabled={transferBusy}
              type="button"
            >
              {transferBusy
                ? "در حال ساخت کد..."
                : "🔑 ساخت کد انتقال پرونده"}
            </button>
          )}

          {transferCode && (
            <button
              className="continue-btn"
              onClick={handleCreateTransfer}
              disabled={transferBusy}
              type="button"
              style={{ marginTop: "10px", background: "#071a33" }}
            >
              ساخت کد جدید (کد قبلی باطل می‌شود)
            </button>
          )}
        </div>

        {/* ================================= */}
        {/* SERVICE HISTORY */}
        {/* ================================= */}

        <div className="service-history">

          <h3>
            تاریخچه سرویس‌ها
          </h3>

          {services.length === 0 ? (

            <p>
              هنوز سرویسی ثبت نشده است.
            </p>

          ) : (

            services.map(
              (service) => (

                <div
                  key={service.id}
                  className="service-box"
                >

                  <strong>
                    🔧 {service.title}
                  </strong>

                  <p>
                    تاریخ:{" "}
                    {formatDate(
                      service.service_date
                    )}
                  </p>

                  <p>
                    کیلومتر:{" "}
                    {formatNumber(
                      service.mileage
                    )}
                  </p>

                  {service.cost != null && (
                    <p>
                      هزینه:{" "}
                      {formatNumber(
                        service.cost
                      )}{" "}
                      تومان
                    </p>
                  )}

                  {/* اگر شرح عیناً عنوان باشد (دادهٔ پایهٔ 011)
                      نمایشش فقط ظاهر را خراب می‌کند */}
                  {service.description &&
                    service.description.trim() !==
                      service.title.trim() && (
                    <p>
                      {service.description}
                    </p>
                  )}

                  {getCenterName(
                    service.service_center_id
                  ) && (
                    <p>
                      مرکز خدمات:{" "}
                      {getCenterName(
                        service.service_center_id
                      )}
                    </p>
                  )}

                  {service.image && (
                    <div>
                      {service.invoiceUrl ? (
                        <a
                          href={
                            service.invoiceUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="invoice-link"
                        >
                          <img
                            src={
                              service.invoiceUrl
                            }
                            alt="تصویر فاکتور سرویس"
                            className="invoice-thumb"
                          />
                        </a>
                      ) : (
                        <p className="invoice-missing">
                          تصویر فاکتور در دسترس نیست.
                        </p>
                      )}
                    </div>
                  )}

                  <small>

                    وضعیت:{" "}

                    {service.verification_status ===
                    "service_center_verified"
                      ? "تایید شده توسط مرکز"
                      : "ثبت مالک"}

                  </small>

                </div>

              )
            )

          )}

        </div>

        {/* ================================= */}
        {/* ADD SERVICE */}
        {/* ================================= */}

        <button
          className="continue-btn"
          onClick={() =>
            navigate(
              `/add-service/${car.id}`
            )
          }
        >
          + ثبت سرویس جدید
        </button>

      </div>

    </div>
  );
}

export default CarProfile;