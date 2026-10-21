import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AppHeader from "../components/AppHeader";
import "./../styles/OwnerRegister.css";

function CenterPanel() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [centers, setCenters] = useState([]);
  const [services, setServices] = useState([]);
  const [verifyingId, setVerifyingId] = useState(null);

  // ---------------------------------------------------------
  // مرکز خدمات خودم + سرویس‌های نسبت‌داده‌شده به آن
  // ---------------------------------------------------------
  const loadPanel = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!userData?.user) {
        navigate("/");
        return;
      }

      const {
        data: centerData,
        error: centerError,
      } = await supabase
        .from("service_centers")
        .select("id, name, city, mobile")
        .eq("owner_id", userData.user.id)
        .order("created_at", { ascending: true });

      if (centerError) {
        throw centerError;
      }

      const myCenters = centerData || [];
      setCenters(myCenters);

      if (myCenters.length === 0) {
        setServices([]);
        return;
      }

      const centerIds = myCenters.map((center) => center.id);

      const {
        data: serviceData,
        error: serviceError,
      } = await supabase
        .from("services")
        .select(
          "id, title, description, mileage, service_date, cost, verification_status, service_center_id"
        )
        .in("service_center_id", centerIds)
        .order("service_date", {
          ascending: false,
          nullsFirst: false,
        });

      if (serviceError) {
        throw serviceError;
      }

      setServices(serviceData || []);
    } catch (err) {
      setError(err?.message || "خطا در بارگذاری پنل مرکز خدمات.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    // fetch-on-mount؛ همهٔ setState ها بعد از await هستند.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPanel();
  }, [loadPanel]);

  // ---------------------------------------------------------
  // تأیید سرویس توسط مرکز خدمات
  // ---------------------------------------------------------
  async function handleVerify(serviceId) {
    setVerifyingId(serviceId);
    setError("");
    setMessage("");

    const { error: rpcError } = await supabase.rpc("verify_service", {
      p_service_id: serviceId,
    });

    if (rpcError) {
      setError(rpcError.message || "تأیید سرویس انجام نشد.");
      setVerifyingId(null);
      return;
    }

    setServices((previous) =>
      previous.map((service) =>
        service.id === serviceId
          ? { ...service, verification_status: "service_center_verified" }
          : service
      )
    );

    setMessage("سرویس با موفقیت تأیید شد.");
    setVerifyingId(null);
  }

  function formatDate(value) {
    if (!value) return "—";

    try {
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function formatNumber(value) {
    if (value === null || value === undefined) return "—";
    return Number(value).toLocaleString("en-US");
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div className="register-page">
      <div
        className="register-card"
        style={{ maxWidth: "600px", textAlign: "right" }}
      >
        <AppHeader />

        <h2 className="register-title">پنل مرکز خدمات</h2>

        {centers.length > 0 && (
          <p className="register-subtitle">
            {centers[0].name}
            {centers[0].city ? ` — ${centers[0].city}` : ""}
          </p>
        )}

        {error && (
          <div
            style={{
              background: "#fee2e2",
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

        {message && (
          <div
            style={{
              background: "#dcfce7",
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

        {loading && (
          <p className="register-subtitle">در حال بارگذاری...</p>
        )}

        {!loading && centers.length === 0 && (
          <>
            <p className="register-subtitle">
              هنوز مرکز خدماتی ثبت نکرده‌اید. ابتدا مشخصات مجموعه خود را ثبت کنید تا بتوانید سرویس‌های مشتریان را ببینید و تأیید کنید.
            </p>

            <button
              className="continue-btn"
              onClick={() => navigate("/center-register")}
              type="button"
            >
              ثبت مرکز خدمات
            </button>
          </>
        )}

        {!loading && centers.length > 0 && (
          <>
            <h3
              style={{
                color: "#071a33",
                fontSize: "17px",
                margin: "18px 0 12px",
              }}
            >
              سرویس‌های نسبت‌داده‌شده به این مرکز ({services.length})
            </h3>

            <p
              style={{
                color: "#667085",
                fontSize: "13px",
                lineHeight: "1.9",
                marginBottom: "14px",
              }}
            >
              مشتری هنگام ثبت سرویس، نام مرکز شما را انتخاب می‌کند. سپس از همین‌جا می‌توانید آن سرویس را تأیید کنید.
            </p>

            {services.length === 0 && (
              <div
                style={{
                  background: "#f5f7fa",
                  padding: "18px",
                  borderRadius: "12px",
                  color: "#667085",
                  lineHeight: "1.9",
                }}
              >
                هنوز سرویسی به این مرکز نسبت داده نشده است.
              </div>
            )}

            {services.map((service) => {
              const isVerified =
                service.verification_status === "service_center_verified";

              return (
                <div
                  key={service.id}
                  style={{
                    border: "1px solid #e6e8ec",
                    borderRadius: "12px",
                    padding: "14px",
                    marginBottom: "12px",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "8px",
                    }}
                  >
                    <strong style={{ color: "#071a33" }}>
                      🔧 {service.title}
                    </strong>

                    <span
                      style={{
                        fontSize: "12px",
                        padding: "4px 8px",
                        borderRadius: "999px",
                        background: isVerified ? "#dcfce7" : "#fef3c7",
                        color: isVerified ? "#166534" : "#92400e",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isVerified ? "تأیید شده" : "در انتظار تأیید"}
                    </span>
                  </div>

                  <p
                    style={{
                      color: "#667085",
                      fontSize: "13px",
                      lineHeight: "1.9",
                      margin: 0,
                    }}
                  >
                    تاریخ: {formatDate(service.service_date)} — کیلومتر:{" "}
                    <bdi>{formatNumber(service.mileage)} km</bdi>
                    {service.cost != null && (
                      <> — هزینه: {formatNumber(service.cost)} تومان</>
                    )}
                  </p>

                  {service.description && (
                    <p
                      style={{
                        color: "#667085",
                        fontSize: "13px",
                        lineHeight: "1.9",
                        margin: "6px 0 0",
                      }}
                    >
                      {service.description}
                    </p>
                  )}

                  {!isVerified && (
                    <button
                      className="continue-btn"
                      onClick={() => handleVerify(service.id)}
                      disabled={verifyingId === service.id}
                      type="button"
                      style={{ marginTop: "12px" }}
                    >
                      {verifyingId === service.id
                        ? "در حال تأیید..."
                        : "تأیید این سرویس"}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        <button
          className="continue-btn"
          onClick={() => navigate("/dashboard")}
          type="button"
          style={{ marginTop: "12px", background: "#071a33" }}
        >
          بازگشت به داشبورد
        </button>
      </div>
    </div>
  );
}

export default CenterPanel;
