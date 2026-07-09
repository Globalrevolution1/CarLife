import "./../styles/OwnerRegister.css";
import { useNavigate } from "react-router-dom";
function OwnerRegister() {

  const navigate = useNavigate();

  return (
    <div className="register-page">
      <div className="register-card">

        <h1 className="register-logo">
          کارنگار
        </h1>

        <h2 className="register-title">
          ثبت اطلاعات مالک خودرو
        </h2>

        <p className="register-subtitle">
          برای شروع اطلاعات اولیه خود را وارد کنید.
        </p>

        <div className="form-group">
          <label>نام و نام خانوادگی</label>
          <input type="text" placeholder="نام خود را وارد کنید" />
        </div>

        <div className="form-group">
          <label>شماره موبایل</label>
          <input type="tel" placeholder="09xxxxxxxxx" />
        </div>

        <div className="form-group">
          <label>پلاک خودرو</label>
          <input type="text" placeholder="پلاک خودرو" />
        </div>

        <button
  className="continue-btn"
  onClick={() => navigate("/car-register")}
>
  ادامه
</button>

      </div>
    </div>
  );
}

export default OwnerRegister;