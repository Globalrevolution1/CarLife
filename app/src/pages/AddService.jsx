import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toPersianError } from "../lib/errorMessage";
import AppHeader from "../components/AppHeader";
import {
  filterTemplatesForVehicle,
  getLastServiceForTemplate as engineGetLastServiceForTemplate,
  getNextDueMileage,
  resolveNextVehicleMileage,
} from "../utils/vehicleHealthEngine";

// bucket تصویر فاکتور (migration 015). خصوصی است؛
// نمایش در پرونده با createSignedUrl انجام می‌شود.
const INVOICE_BUCKET = "service-invoices";

const MAX_INVOICE_BYTES = 5 * 1024 * 1024;

const INVOICE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function todayLocal() {
  const t = new Date();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${mm}-${dd}`;
}

/**
 * پسوند فایل عکس، فقط از روی نام فایل.
 *
 * هر کاراکتر غیر حروف/اعداد حذف می‌شود تا نام فایل
 * نتواند مسیر را بشکند (مثلاً «..» یا «/»).
 *
 * @param {string} filename
 * @returns {string}
 */
function invoiceExtension(filename) {
  const dot = String(filename || "").lastIndexOf(".");

  if (dot < 0) {
    return "jpg";
  }

  const ext = String(filename)
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return ext || "jpg";
}

function AddService() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [services, setServices] = useState([]);

  const [selectedTemplateId, setSelectedTemplateId] =
    useState("");

  const [mileage, setMileage] = useState("");

  const [cost, setCost] = useState("");

  const [serviceDate, setServiceDate] =
    useState(() => {
      const t = new Date();
      const mm = String(t.getMonth() + 1).padStart(2, "0");
      const dd = String(t.getDate()).padStart(2, "0");
      return `${t.getFullYear()}-${mm}-${dd}`;
    });
  const [description, setDescription] = useState("");

  const [centers, setCenters] = useState([]);

  const [selectedCenterId, setSelectedCenterId] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // =========================================================
  // INVOICE IMAGE  (PRD ← ثبت سرویس ← تصویر فاکتور)
  // =========================================================

  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const invoiceUrlRef = useRef("");

  // آدرس‌های blob در پاک‌سازی صفحه آزاد می‌شوند
  useEffect(() => {
    return () => {
      if (invoiceUrlRef.current) {
        URL.revokeObjectURL(invoiceUrlRef.current);
      }
    };
  }, []);

  function clearInvoice() {
    if (invoiceUrlRef.current) {
      URL.revokeObjectURL(invoiceUrlRef.current);
      invoiceUrlRef.current = "";
    }

    setInvoicePreview("");
    setInvoiceFile(null);
    setInvoiceError("");
  }

  function handleInvoiceChange(event) {
    const file =
      event.target.files && event.target.files[0]
        ? event.target.files[0]
        : null;

    clearInvoice();
    setInvoiceError("");

    if (!file) {
      return;
    }

    if (
      !file.type ||
      INVOICE_TYPES.indexOf(file.type) === -1
    ) {
      setInvoiceFile(null);
      setInvoiceError(
        "فرمت تصویر پشتیبانی نمی‌شود. (JPG، PNG، WEBP یا HEIC)"
      );
      event.target.value = "";
      return;
    }

    if (file.size > MAX_INVOICE_BYTES) {
      setInvoiceFile(null);
      setInvoiceError(
        "حجم تصویر نباید بیشتر از ۵ مگابایت باشد."
      );
      event.target.value = "";
      return;
    }

    const url = URL.createObjectURL(file);

    invoiceUrlRef.current = url;
    setInvoiceFile(file);
    setInvoicePreview(url);
  }

  // =========================================================
  // LOAD PAGE
  //
  // با useCallback اینجا تعریف می‌شود تا هم اشکال
  // react-hooks/immutability رفع شود و هم effect
  // به آخرین نسخهٔ تابع وصل بماند.
  // =========================================================

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      // -----------------------------------------------------
      // USER
      // -----------------------------------------------------

      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!userData?.user) {
        setError("کاربر وارد حساب نشده است.");
        setLoading(false);
        return;
      }

      setUser(userData.user);

      // -----------------------------------------------------
      // VEHICLE
      // -----------------------------------------------------

      const {
        data: vehicleData,
        error: vehicleError,
      } = await supabase
        .from("vehicles")
        .select(`
          id,
          brand,
          model,
          current_mileage
        `)
        .eq("id", id)
        .single();

      if (vehicleError) {
        throw vehicleError;
      }

      setVehicle(vehicleData);

      // مقدار پیش‌فرض کیلومتر
      setMileage(
        vehicleData.current_mileage !== null &&
        vehicleData.current_mileage !== undefined
          ? String(vehicleData.current_mileage)
          : ""
      );

      // -----------------------------------------------------
      // SERVICE TEMPLATES
      // -----------------------------------------------------

      // -----------------------------------------------
      // همهٔ template ها؛ فیلتر خودرو با
      // filterTemplatesForVehicle (شامل ردیف‌های عمومی و
      // fallback به ردیف‌های برند برای مدل‌های ثبت‌نشده)
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
        .order("service_name", {
          ascending: true,
        });

      if (templateError) {
        throw templateError;
      }

      setTemplates(templateData || []);

      // -----------------------------------------------------
      // SERVICE CENTERS
      //
      // فهرست مراکز خدمات برای انتخاب هنگام ثبت سرویس.
      // اگر دسترسی نبود (مثلاً migration 013 اجرا نشده) خطا
      // نمی‌دهیم تا ثبت سرویس بدون مرکز هم کار کند.
      // -----------------------------------------------------

      const {
        data: centerData,
      } = await supabase
        .from("service_centers")
        .select("id, name, city")
        .order("name", {
          ascending: true,
        });

      setCenters(centerData || []);

      // -----------------------------------------------------
      // EXISTING SERVICES
      // -----------------------------------------------------

      const {
        data: serviceData,
        error: serviceError,
      } = await supabase
        .from("services")
        .select(`
          id,
          vehicle_id,
          title,
          mileage,
          service_date,
          created_at
        `)
        .eq("vehicle_id", id)
        .order("mileage", {
          ascending: false,
        })
        .order("service_date", {
          ascending: false,
        });

      if (serviceError) {
        throw serviceError;
      }

      setServices(serviceData || []);
    } catch (err) {
      console.error(
        "LOAD PAGE ERROR:",
        err
      );

      setError(
        err?.message ||
          "خطا در دریافت اطلاعات"
      );
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    // fetch-on-mount؛ setState ها بعد از await هستند.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPage();
  }, [loadPage]);

// =========================================================
  // SERVICE MATCHING
  //
  // منطق در src/utils/vehicleHealthEngine.js است.
  // =========================================================

function getLastService(template) {
    return engineGetLastServiceForTemplate(
      template,
      services,
    );
  }
  // =========================================================
  // SELECTED TEMPLATE
  // =========================================================

  // template های قابل انتخاب برای همین خودرو
  const vehicleTemplates = vehicle
    ? filterTemplatesForVehicle(
        templates,
        vehicle
      )
    : [];

  const selectedTemplate =
    vehicleTemplates.find(
      (template) =>
        template.id ===
        selectedTemplateId
    ) || null;

  const lastService =
    getLastService(
      selectedTemplate
    );

  // =========================================================
  // NEXT MILEAGE
  // =========================================================

  const intervalKm =
    selectedTemplate
      ? Number(
          selectedTemplate.interval_km ||
            0
        )
      : 0;

  const nextMileage =
    getNextDueMileage(
      lastService,
      intervalKm
    );

  // =========================================================
  // FORMAT NUMBER
  // =========================================================

  function formatNumber(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    return Number(value).toLocaleString(
      "en-US"
    );
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

  // =========================================================
  // HANDLE SUBMIT
  // =========================================================

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setMessage("");

    // -------------------------------------------------------
    // BASIC VALIDATION
    // -------------------------------------------------------

    if (!user) {
      setError(
        "کاربر وارد حساب نشده است."
      );
      return;
    }

    if (!vehicle) {
      setError(
        "اطلاعات خودرو پیدا نشد."
      );
      return;
    }

    if (!selectedTemplate) {
      setError(
        "لطفاً نوع سرویس را انتخاب کنید."
      );
      return;
    }

    const mileageNumber =
      Number(mileage);

    if (
      !mileage ||
      Number.isNaN(
        mileageNumber
      )
    ) {
      setError(
        "لطفاً کیلومتر خودرو را وارد کنید."
      );
      return;
    }

    if (mileageNumber < 0) {
      setError(
        "کیلومتر نمی‌تواند منفی باشد."
      );
      return;
    }

    // -------------------------------------------------------
    // COST (اختیاری)
    // -------------------------------------------------------

    let costNumber = null;

    if (cost.trim() !== "") {

      costNumber = Number(cost);

      if (
        Number.isNaN(costNumber) ||
        costNumber < 0
      ) {
        setError(
          "هزینه باید عددی بزرگ‌تر یا مساوی صفر باشد."
        );
        return;
      }

    }

    // -------------------------------------------------------
    // SERVICE DATE
    // -------------------------------------------------------

    if (!serviceDate) {
      setError(
        "لطفاً تاریخ سرویس را وارد کنید."
      );
      return;
    }

    if (serviceDate > todayLocal()) {
      setError(
        "تاریخ سرویس نمی‌تواند در آینده باشد."
      );
      return;
    }

    // -------------------------------------------------------
    // SERVICE DATA
    // -------------------------------------------------------

    const serviceData = {
      vehicle_id: vehicle.id,
      created_by: user.id,
      title:
        selectedTemplate.service_name,
      description:
        description.trim() ||
        null,
      mileage:
        mileageNumber,
      service_date:
        serviceDate,
      cost:
        costNumber,
      service_center_id:
        selectedCenterId || null,
      verification_status:
        "owner_reported",
    };

    setSaving(true);

    // تصویر فاکتور قبل از ثبت سرویس بارگذاری می‌شود تا اگر
    // آپلود خطا داد، سرویس ناقص ثبت نشود.
    let invoicePath = null;

    try {
      // -----------------------------------------------------
      // UPLOAD INVOICE IMAGE (اختیاری)
      //
      // مسیر: <vehicle_id>/<uuid>.<ext>
      // policy استوریج (015) روی مالکیتِ فعالِ همان خودرو
      // ساخته شده، پس بعد از انتقال مالکیت، عکس هم مثل
      // بقیهٔ پرونده به خریدار منتقل می‌شود.
      // -----------------------------------------------------

      if (invoiceFile) {
        invoicePath = `${vehicle.id}/${crypto.randomUUID()}.${invoiceExtension(invoiceFile.name)}`;

        const {
          error: uploadError,
        } = await supabase.storage
          .from(INVOICE_BUCKET)
          .upload(invoicePath, invoiceFile, {
            contentType: invoiceFile.type,
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        serviceData.image = invoicePath;
      }

      // -----------------------------------------------------
      // INSERT SERVICE
      // -----------------------------------------------------

      const {
        error: insertError,
      } = await supabase
        .from("services")
        .insert(
          serviceData
        )
        .select()
        .single();

      if (insertError) {
        // عکسی که تازه بارگذاری شده و سرویس ثبت نشد
        // یتیم می‌ماند؛ در حد تلاش حذف می‌کنیم.
        if (invoicePath) {
          await supabase.storage
            .from(INVOICE_BUCKET)
            .remove([invoicePath]);
        }

        console.error(
          "ERROR CODE:",
          insertError.code
        );

        console.error(
          "ERROR MESSAGE:",
          insertError.message
        );

        console.error(
          "ERROR DETAILS:",
          insertError.details
        );

        console.error(
          "ERROR HINT:",
          insertError.hint
        );

        throw insertError;
      }

      // -----------------------------------------------------
      // UPDATE VEHICLE MILEAGE
      //
      // قانون: کیلومتر خودرو هرگز خودکار پایین نمی‌آید.
      // resolveNextVehicleMileage فقط وقتی مقدار جدید
      // را برمی‌گرداند که از مقدار فعلی بیشتر باشد.
      // -----------------------------------------------------

      const nextVehicleMileage =
        resolveNextVehicleMileage(
          vehicle.current_mileage,
          mileageNumber
        );

      if (
        nextVehicleMileage !== null
      ) {
        const {
          error:
            updateVehicleError,
        } = await supabase
          .from("vehicles")
          .update({
            current_mileage:
              nextVehicleMileage,
          })
          .eq(
            "id",
            vehicle.id
          )
          .select()
          .single();

        if (
          updateVehicleError
        ) {
          /*
            سرویس ثبت شده،
            ولی بروزرسانی کیلومتر خودرو
            خطا داده است.
          */

          console.error(
            "MILEAGE UPDATE FAILED:",
            updateVehicleError
          );

          setMessage(
            "سرویس با موفقیت ثبت شد، اما بروزرسانی کیلومتر خودرو انجام نشد."
          );

          setSaving(false);

          setTimeout(() => {
            navigate(
              `/car-profile/${vehicle.id}`
            );
          }, 1500);

          return;
        }
      }

      // -----------------------------------------------------
      // SUCCESS
      // -----------------------------------------------------

      setMessage(
        "سرویس با موفقیت ثبت شد."
      );

      // -----------------------------------------------------
      // GO BACK TO CAR PROFILE
      // -----------------------------------------------------

      setTimeout(() => {
        navigate(
          `/car-profile/${vehicle.id}`
        );
      }, 1000);
    } catch (err) {
      console.error(
        "FINAL ADD SERVICE ERROR:",
        err
      );

      setError(toPersianError(err?.message));
    }

    setSaving(false);
  }

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div
        style={{
          maxWidth: "600px",
          margin: "40px auto",
          padding: "20px",
          direction: "rtl",
          textAlign: "right",
        }}
      >
        <h2>
          در حال دریافت اطلاعات...
        </h2>
      </div>
    );
  }

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "30px auto",
        padding: "20px",
        direction: "rtl",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          padding: "24px",
          boxShadow:
            "0 4px 20px rgba(0,0,0,0.08)",
        }}
      >

        <AppHeader />

        {/* =============================================== */}
        {/* HEADER */}
        {/* =============================================== */}

        <div
          style={{
            marginBottom: "24px",
          }}
        >

          <h1
            style={{
              margin: 0,
              fontSize: "26px",
            }}
          >
            ثبت سرویس خودرو
          </h1>

          {vehicle && (
            <div
              style={{
                marginTop: "10px",
                color: "#555",
              }}
            >
              {vehicle.brand}{" "}
              {vehicle.model}
            </div>
          )}
        </div>

        {/* =============================================== */}
        {/* ERROR */}
        {/* =============================================== */}

        {error && (
          <div
            style={{
              background:
                "#fee2e2",
              color: "#b91c1c",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "18px",
              lineHeight: "1.8",
            }}
          >
            {error}
          </div>
        )}

        {/* =============================================== */}
        {/* SUCCESS */}
        {/* =============================================== */}

        {message && (
          <div
            style={{
              background:
                "#dcfce7",
              color: "#166534",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "18px",
              lineHeight: "1.8",
            }}
          >
            {message}
          </div>
        )}

        {/* =============================================== */}
        {/* FORM */}
        {/* =============================================== */}

        <form
          onSubmit={
            handleSubmit
          }
        >

          {/* ============================================= */}
          {/* SERVICE TYPE */}
          {/* ============================================= */}

          <div
            style={{
              marginBottom: "20px",
            }}
          >

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              نوع سرویس
            </label>

            <select
              value={
                selectedTemplateId
              }
              onChange={(e) =>
                setSelectedTemplateId(
                  e.target.value
                )
              }
              style={{
                width: "100%",
                padding: "13px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "16px",
                background:
                  "#ffffff",
              }}
            >

              <option value="">
                انتخاب نوع سرویس
              </option>

              {vehicleTemplates.map(
                (template) => (
                  <option
                    key={
                      template.id
                    }
                    value={
                      template.id
                    }
                  >
                    {
                      template.service_name
                    }
                  </option>
                )
              )}

            </select>

          </div>

          {/* ============================================= */}
          {/* SELECTED TEMPLATE INFO */}
          {/* ============================================= */}

          {selectedTemplate && (
            <div
              style={{
                background:
                  "#f8fafc",
                border:
                  "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "15px",
                marginBottom: "20px",
                lineHeight: "2",
              }}
            >

              <div>
                فاصله سرویس:{" "}
                <strong>
                  {formatInterval(selectedTemplate)}
                </strong>
              </div>

              <div>
                آخرین سرویس:{" "}
                <strong>
                  {lastService ? (
                    <bdi>
                      {formatNumber(
                        lastService.mileage
                      )}{" "}
                      km
                    </bdi>
                  ) : (
                    "هنوز ثبت نشده"
                  )}
                </strong>
              </div>

              {nextMileage !==
                null && (
                <div>
                  موعد بعدی:{" "}
                  <strong>
                    <bdi>
                      {formatNumber(
                        nextMileage
                      )}{" "}
                      km
                    </bdi>
                  </strong>
                </div>
              )}

            </div>
          )}

          {/* ============================================= */}
          {/* MILEAGE */}
          {/* ============================================= */}

          <div
            style={{
              marginBottom: "20px",
            }}
          >

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              کیلومتر خودرو
            </label>

            <input
              type="number"
              min="0"
              value={mileage}
              onChange={(e) =>
                setMileage(
                  e.target.value
                )
              }
              placeholder="مثلاً 90000"
              style={{
                width: "100%",
                boxSizing:
                  "border-box",
                padding: "13px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "16px",
                direction: "ltr",
                textAlign: "left",
              }}
            />

            {vehicle && (
              <div
                style={{
                  fontSize: "13px",
                  color: "#777",
                  marginTop: "7px",
                }}
              >
                کیلومتر فعلی ثبت‌شده:{" "}
                <bdi>
                  {formatNumber(
                    vehicle.current_mileage
                  )}{" "}
                  km
                </bdi>
              </div>
            )}

          </div>

          {/* ============================================= */}
          {/* SERVICE DATE */}
          {/* ============================================= */}

          <div
            style={{
              marginBottom: "24px",
            }}
          >

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              تاریخ سرویس
            </label>

            <input
              type="date"
              value={
                serviceDate
              }
              max={
                todayLocal()
              }
              onChange={(e) =>
                setServiceDate(
                  e.target.value
                )
              }
              style={{
                width: "100%",
                boxSizing:
                  "border-box",
                padding: "13px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "16px",
                direction: "ltr",
                textAlign: "left",
              }}
            />

          </div>

          {/* ============================================= */}
          {/* COST */}
          {/* ============================================= */}

          <div
            style={{
              marginBottom: "24px",
            }}
          >

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              هزینه (تومان)
            </label>

            <input
              type="number"
              min="0"
              value={
                cost
              }
              onChange={(e) =>
                setCost(
                  e.target.value
                )
              }
              placeholder="مثلاً 950000"
              style={{
                width: "100%",
                boxSizing:
                  "border-box",
                padding: "13px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "16px",
                direction: "ltr",
                textAlign: "left",
              }}
            />

            <div
              style={{
                fontSize: "13px",
                color: "#777",
                marginTop: "7px",
              }}
            >
              اختیاری است؛ اگر فاکتور ندارید خالی بگذارید.
            </div>

          </div>

          {/* ============================================= */}
          {/* SERVICE CENTER */}
          {/* ============================================= */}

          <div
            style={{
              marginBottom: "24px",
            }}
          >

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              مرکز خدمات
            </label>

            <select
              value={
                selectedCenterId
              }
              onChange={(e) =>
                setSelectedCenterId(
                  e.target.value
                )
              }
              disabled={
                centers.length === 0
              }
              style={{
                width: "100%",
                boxSizing:
                  "border-box",
                padding: "13px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "16px",
              }}
            >
              <option value="">
                {centers.length === 0
                  ? "هنوز مرکزی ثبت نشده است"
                  : "بدون مرکز (اختیاری)"}
              </option>

              {centers.map((center) => (
                <option
                  key={center.id}
                  value={center.id}
                >
                  {center.name}
                  {center.city
                    ? ` — ${center.city}`
                    : ""}
                </option>
              ))}
            </select>

            <div
              style={{
                fontSize: "13px",
                color: "#777",
                marginTop: "7px",
              }}
            >
              با انتخاب مرکز، آن مرکز می‌تواند این سرویس را تأیید کند.
            </div>

          </div>

          {/* ============================================= */}
          {/* DESCRIPTION */}
          {/* ============================================= */}

          <div
            style={{
              marginBottom: "24px",
            }}
          >

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              توضیحات
            </label>

            <textarea
              value={
                description
              }
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
              placeholder="مثلاً روغن موتور و فیلتر تعویض شد"
              rows="4"
              style={{
                width: "100%",
                boxSizing:
                  "border-box",
                padding: "13px",
                border:
                  "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "16px",
                resize: "vertical",
                direction: "rtl",
              }}
            />

          </div>

          {/* ============================================= */}
          {/* INVOICE IMAGE  (PRD ← ثبت سرویس ← تصویر فاکتور) */}
          {/* ============================================= */}

          <div className="form-group">

            <label
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              تصویر فاکتور (اختیاری)
            </label>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={handleInvoiceChange}
              style={{
                width: "100%",
                padding: "11px",
                border: "1px dashed #cbd5e1",
                borderRadius: "10px",
                background: "#f8fafc",
                fontSize: "15px",
              }}
            />

            <p
              style={{
                marginTop: "8px",
                fontSize: "13px",
                color: "#6b7280",
                lineHeight: "1.7",
              }}
            >
              حداکثر ۵ مگابایت؛ JPG، PNG، WEBP یا HEIC.
              عکس فاکتور در پروندهٔ خودرو نمایش داده می‌شود
              و با انتقال پرونده به خریدار، همراه بقیهٔ
              سوابق منتقل می‌شود.
            </p>

            {invoiceError && (
              <p
                style={{
                  marginTop: "8px",
                  fontSize: "14px",
                  color: "#dc2626",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "8px 10px",
                }}
              >
                {invoiceError}
              </p>
            )}

            {invoicePreview && (
              <div style={{ marginTop: "12px" }}>

                <img
                  src={invoicePreview}
                  alt="پیش‌نمایش تصویر فاکتور"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: "240px",
                    objectFit: "contain",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    background: "#ffffff",
                  }}
                />

                <button
                  type="button"
                  onClick={clearInvoice}
                  style={{
                    marginTop: "8px",
                    padding: "7px 14px",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    background: "#ffffff",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  ✕ حذف تصویر
                </button>

              </div>
            )}

          </div>

          {/* ============================================= */}
          {/* SUBMIT */}
          {/* ============================================= */}

          <button
            type="submit"
            disabled={
              saving ||
              !selectedTemplateId
            }
            style={{
              width: "100%",
              padding: "14px",
              border: "none",
              borderRadius: "10px",
              background:
                saving ||
                !selectedTemplateId
                  ? "#9ca3af"
                  : "#111827",
              color: "#ffffff",
              fontSize: "17px",
              fontWeight: "600",
              cursor:
                saving ||
                !selectedTemplateId
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving
              ? "در حال ثبت..."
              : "ثبت سرویس"}
          </button>

        </form>

        {/* =============================================== */}
        {/* BACK */}
        {/* =============================================== */}

        <button
          type="button"
          onClick={() =>
            navigate(
              `/car-profile/${id}`
            )
          }
          style={{
            width: "100%",
            marginTop: "12px",
            padding: "12px",
            border:
              "1px solid #d1d5db",
            borderRadius: "10px",
            background:
              "#ffffff",
            color: "#374151",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          بازگشت به پرونده خودرو
        </button>

      </div>
    </div>
  );
}

export default AddService;