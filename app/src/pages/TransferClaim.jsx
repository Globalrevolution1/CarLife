import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toPersianError } from "../lib/errorMessage";
import AppHeader from "../components/AppHeader";
import "./../styles/OwnerRegister.css";

function TransferClaim() {
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  // ---------------------------------------------------------
  // دریافت پروندهٔ خودرو با کد انتقال
  //
  // سمت سرور:
  //   * مالکیت قبلی بسته می‌شود
  //   * مالکیت جدید برای همین کاربر ثبت می‌شود
  //   * کد مصرف می‌شود و دیگر قابل استفاده نیست
  // ---------------------------------------------------------
  async function handleClaim(event) {
    event.preventDefault();

    if (!code.trim()) {
      setError("کد انتقال را وارد کنید.");
      return;
    }

    setClaiming(true);
    setError("");

    try {
      const { data: vehicleId, error: rpcError } = await supabase.rpc(
        "claim_transfer_code",
        { p_code: code.trim() }
      );

      if (rpcError) {
        setError(toPersianError(rpcError.message));
        setClaiming(false);
        return;
      }

      if (!vehicleId) {
        setError("کد انتقال پذیرفته نشد. لطفاً دوباره تلاش کنید.");
        setClaiming(false);
        return;
      }

      navigate(`/car-profile/${vehicleId}`);
    } catch (unexpected) {
      setError(toPersianError(unexpected && unexpected.message));
      setClaiming(false);
    }
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div className="register-page">
      <div className="register-card">
        <AppHeader />

        <h2 className="register-title">دریافت پروندهٔ خودرو</h2>

        <p className="register-subtitle">
          کدی را که فروشندهٔ خودرو به شما داده وارد کنید تا کل پروندهٔ سلامت و تاریخچهٔ سرویس‌های آن به حساب شما منتقل شود.
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

        <form onSubmit={handleClaim}>
          <div className="form-group">
            <label>کد انتقال</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="مثلاً 3F9A2C71"
              maxLength={8}
              style={{
                direction: "ltr",
                textAlign: "center",
                letterSpacing: "3px",
                fontWeight: "700",
              }}
            />

            <p
              style={{
                color: "#667085",
                fontSize: "13px",
                lineHeight: "1.9",
                marginTop: "6px",
              }}
            >
              کد ۸ کاراکتری است و ۷۲ ساعت اعتبار دارد.
            </p>
          </div>

          <button
            className="continue-btn"
            type="submit"
            disabled={claiming}
          >
            {claiming ? "در حال دریافت..." : "دریافت پرونده"}
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
      </div>
    </div>
  );
}

export default TransferClaim;
