import { Link } from "react-router-dom";
import Logo from "../components/Logo";

function Home() {
  return (
    <div className="home">

      <div className="home-card">

        <Logo />

        <h1>
          پرونده دیجیتال خودرو
        </h1>

        <p>
          سوابق خودرویت را ثبت کن،
          زمان سرویس‌ها را به موقع بدان
          و ارزش خودرو را حفظ کن.
        </p>


        <div className="actions">

          <Link 
            className="btn primary"
            to="/owner-register"
          >
            🚗 مالک خودرو هستم
          </Link>


          <Link
            className="btn secondary"
            to="/service-register"
          >
            🔧 مرکز خدمات هستم
          </Link>

        </div>

      </div>

    </div>
  );
}

export default Home;