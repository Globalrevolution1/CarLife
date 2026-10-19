import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AppHeader from "../components/AppHeader";
import "./../styles/OwnerRegister.css";

function CenterRegister() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState(null);

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    city: "",
    address: "",
  });

  // ---------------------------------------------------------
  // آیا این کاربر قبلاً مرکز خدمات ثبت کرده است؟
  // ---------------------------------------------------------
  const loadCenter = useCallback(async () => {
    setLoading(true);
    setError("");

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
        .select("id, name, mobile, city, address, is_verified")
        .eq("owner_id", userData.user.id)
        .maybeSingle();

      if (centerError) {
        throw centerError;
      }

      setExisting(centerData || null);
    } catch (err) {
      setError(
        err?.message || "خطا در دریافت اطلاعات مرکز خدمات."
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    // fetch-on-mount؛ همهٔ setState ها بعد از await هستند.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCenter();
  }, [loadCenter]);

  // ---------------------------------------------------------
  // ثبت مرکز خدمات
  // ---------------------------------------------------------
  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("نام مجموعه را وارد کنید.");
      return;
    }

    if (!form.mobile.trim()) {
      setError("شماره تماس را وارد کنید.");
      return;
    }

    setSaving(true);
    setError("");

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

      const { error: insertError } = await supabase
        .from("service_centers")
        .insert({
          owner_id: userData.user.id,
          name: form.name.trim(),
          mobile: form.mobile.trim(),
          city: form.city.trim() || null,
          address: form.address.trim() || null,
        });

      if (insertError) {
        throw insertError;
      }

      navigate("/center-panel");
    } catch (err) {
      setError(err?.message || "ثبت مرکز خدمات انجام نشد.");
      setSaving(false);
    }
  }

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div className="register-page">
      <div className="register-card">

        <AppHeader />

        {loading && (
          <p className="register-subtitle">
            در حال دریافت اطلاعات...
          </p>
        )}

        {!loading && existing && (
          <>
            <h2 className="register-title">
              مرکز خدمات شما ثبت شده است
            </h2>

            <p className="register-subtitle">
              {existing.name}
              {existing.city ? ` — ${existing.city}` : ""}
              <br />
              {existing.mobile}
            </p>

            <button
              className="continue-btn"
              onClick={() => navigate("/center-panel")}
              type="button"
            >
              ورود به پنل مرکز خدمات
            </button>

            <button
              className="continue-btn"
              onClick={() => navigate("/dashboard")}
              type="button"
              style={{ marginTop: "10px", background: "#071a33" }}
            >
              بازگشت به داشبورد
            </button>
          </>
        )}

        {!loading && !existing && (
          <>
            <h2 className="register-title">
              ثبت مرکز خدمات
            </h2>

            <p className="register-subtitle">
              تعویض روغنی، تعمیرگاه یا مرکز خدمات خود را ثبت کنید تا بتوانید سرویس‌های مشتریان را تأیید کنید.
            </p>

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

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>نام مجموعه</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="مثلاً تعویض روغنی برادران"
                />
              </div>

              <div className="form-group">
                <label>شماره تماس</label>
                <input
                  type="tel"
                  value={form.mobile}
                  onChange={(e) => updateField("mobile", e.target.value)}
                  placeholder="021xxxxxxxx"
                  style={{ direction: "ltr", textAlign: "right" }}
                />
              </div>

              <div className="form-group">
                <label>شهر</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="مثلاً تهران"
                />
              </div>

              <div className="form-group">
                <label>آدرس</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="نشانی مجموعه"
                />
              </div>

              <button
                className="continue-btn"
                type="submit"
                disabled={saving}
              >
                {saving ? "در حال ثبت..." : "ثبت مرکز خدمات"}
              </button>
            </form>

            <button
              className="continue-btn"
              onClick={() => navigate("/dashboard")}
              type="button"
              style={{ marginTop: "10px", background: "#071a33" }}
            >
              بازگشت به داشبورد
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default CenterRegister;
