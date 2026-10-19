import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AppHeader from "../components/AppHeader";
import "./../styles/OwnerRegister.css";

function CarEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [originalMileage, setOriginalMileage] = useState(0);

  const [car, setCar] = useState({
    brand: "",
    model: "",
    production_year_solar: "",
    vin: "",
    color: "",
    current_mileage: "",
  });

  // ---------------------------------------------------------
  // دریافت اطلاعات فعلی خودرو
  // ---------------------------------------------------------
  const loadCar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: vehicleData,
        error: vehicleError,
      } = await supabase
        .from("vehicles")
        .select(
          "id, brand, model, production_year_solar, vin, color, current_mileage"
        )
        .eq("id", id)
        .single();

      if (vehicleError) {
        throw vehicleError;
      }

      setCar({
        brand: vehicleData.brand || "",
        model: vehicleData.model || "",
        production_year_solar:
          vehicleData.production_year_solar?.toString() || "",
        vin: vehicleData.vin || "",
        color: vehicleData.color || "",
        current_mileage: vehicleData.current_mileage?.toString() || "",
      });

      setOriginalMileage(vehicleData.current_mileage || 0);
    } catch (err) {
      setError(err?.message || "خطا در دریافت اطلاعات خودرو.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // fetch-on-mount؛ همهٔ setState ها بعد از await هستند.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCar();
  }, [loadCar]);

  function handleChange(event) {
    setCar((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  // ---------------------------------------------------------
  // ذخیره تغییرات
  //
  // قانون کیلومتر: هرگز پایین نمی‌آید. همین‌جا و در
  // AddService رعایت می‌شود تا تاریخچهٔ سرویس‌ها بی‌معنا نشود.
  // ---------------------------------------------------------
  async function handleSubmit(event) {
    event.preventDefault();

    if (!car.brand.trim() || !car.model.trim()) {
      setError("برند و مدل خودرو را وارد کنید.");
      return;
    }

    const yearNumber = Number(car.production_year_solar);

    if (
      car.production_year_solar &&
      (Number.isNaN(yearNumber) || yearNumber < 1300 || yearNumber > 1500)
    ) {
      setError("سال مدل شمسی باید بین ۱۳۰۰ تا ۱۵۰۰ باشد.");
      return;
    }

    const mileageNumber = Number(car.current_mileage);

    if (
      car.current_mileage === "" ||
      Number.isNaN(mileageNumber) ||
      mileageNumber < 0
    ) {
      setError("کیلومتر فعلی خودرو را به‌درستی وارد کنید.");
      return;
    }

    if (mileageNumber < originalMileage) {
      setError(
        `کیلومتر نمی‌تواند کمتر از مقدار ثبت‌شده (${originalMileage.toLocaleString(
          "en-US"
        )} km) باشد.`
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error: updateError } = await supabase
        .from("vehicles")
        .update({
          brand: car.brand.trim(),
          model: car.model.trim(),
          production_year_solar: car.production_year_solar ? yearNumber : null,
          vin: car.vin.trim() || null,
          color: car.color.trim() || null,
          current_mileage: mileageNumber,
        })
        .eq("id", id);

      if (updateError) {
        if (updateError.code === "23505") {
          throw new Error(
            "این شماره شاسی (VIN) برای خودروی دیگری ثبت شده است."
          );
        }
        throw updateError;
      }

      navigate(`/car-profile/${id}`);
    } catch (err) {
      setError(err?.message || "ذخیره تغییرات انجام نشد.");
      setSaving(false);
    }
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div className="register-page">
      <div className="register-card">
        <AppHeader />

        {loading && (
          <p className="register-subtitle">در حال دریافت اطلاعات...</p>
        )}

        {!loading && (
          <>
            <h2 className="register-title">ویرایش اطلاعات خودرو</h2>

            <p className="register-subtitle">
              {car.brand} {car.model}
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
                <label>برند خودرو</label>
                <input
                  type="text"
                  name="brand"
                  value={car.brand}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>مدل خودرو</label>
                <input
                  type="text"
                  name="model"
                  value={car.model}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>سال مدل (شمسی)</label>
                <input
                  type="number"
                  name="production_year_solar"
                  value={car.production_year_solar}
                  onChange={handleChange}
                  placeholder="مثلاً 1402"
                  style={{ direction: "ltr", textAlign: "right" }}
                />
              </div>

              <div className="form-group">
                <label>رنگ خودرو</label>
                <input
                  type="text"
                  name="color"
                  value={car.color}
                  onChange={handleChange}
                  placeholder="مثلاً سفید"
                />
              </div>

              <div className="form-group">
                <label>کیلومتر فعلی</label>
                <input
                  type="number"
                  name="current_mileage"
                  value={car.current_mileage}
                  onChange={handleChange}
                  style={{ direction: "ltr", textAlign: "right" }}
                />

                <p
                  style={{
                    color: "#667085",
                    fontSize: "13px",
                    lineHeight: "1.9",
                    marginTop: "6px",
                  }}
                >
                  کیلومتر هرگز پایین نمی‌آید؛ فقط می‌تواند بیشتر شود.
                </p>
              </div>

              <div className="form-group">
                <label>شماره شاسی (VIN)</label>
                <input
                  type="text"
                  name="vin"
                  value={car.vin}
                  onChange={handleChange}
                  placeholder="شماره شاسی"
                  style={{ direction: "ltr", textAlign: "right" }}
                />
              </div>

              <button
                className="continue-btn"
                type="submit"
                disabled={saving}
              >
                {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </button>
            </form>

            <button
              className="continue-btn"
              onClick={() => navigate(`/car-profile/${id}`)}
              type="button"
              style={{ marginTop: "10px", background: "#071a33" }}
            >
              انصراف
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default CarEdit;
