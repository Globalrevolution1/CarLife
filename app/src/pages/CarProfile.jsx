import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toPersianError } from "../lib/errorMessage";
import AppHeader from "../components/AppHeader";
import {
  filterTemplatesForVehicle,
  getLatestService,
  getOverallHealth as engineGetOverallHealth,
  getTemplateStatus as engineGetTemplateStatus,
  getUpcomingServices as engineGetUpcomingServices,
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
          current_mileage
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
          interval_km
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

function getTemplateStatus(
    template,
  ) {
    return engineGetTemplateStatus({
      template,
      services,
      currentMileage:
        car?.current_mileage || 0,
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

              {health.score !==
              null
                ? `${health.score}%`
                : "—"}

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
                        هر{" "}
                        {formatNumber(
                          template.interval_km
                        )}{" "}
                        کیلومتر
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

                        {status.label}

                      </span>

                      {status.nextMileage !==
                        null && (
                        <small>
                          سرویس بعدی:{" "}
                          {formatNumber(
                            status.nextMileage
                          )}{" "}
                          km
                        </small>
                      )}

                      {status.lastService && (
                        <small>
                          آخرین سرویس:{" "}
                          {formatNumber(
                            status.lastService
                              .mileage
                          )}{" "}
                          km
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

            {formatNumber(
              car.current_mileage
            )}{" "}
            km
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

                  {service.description && (
                    <p>
                      {
                        service.description
                      }
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