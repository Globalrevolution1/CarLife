import "./../styles/OwnerRegister.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";


function OwnerRegister() {

  const navigate = useNavigate();


  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");


  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");



  async function handleRegister() {

    setLoading(true);
    setError("");


    try {


      const {
        data,
        error
      } = await supabase.auth.signUp({

        email,
        password,

        options: {

          data: {

            full_name: fullName,
            mobile: mobile,
            role: "owner"

          }

        }

      });



      if (error) {

        setError(error.message);
        setLoading(false);
        return;

      }



      if (!data.session) {

        setError(
          "ثبت نام انجام شد. لطفاً تنظیمات تایید ایمیل Supabase را بررسی کنید."
        );

        setLoading(false);
        return;

      }



      navigate("/car-register");



    } catch (err) {

      console.log(err);
      setError("خطایی در ثبت نام رخ داد.");

    }



    setLoading(false);

  }




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
          برای ساخت پرونده دیجیتال خودرو ابتدا حساب خود را بسازید.
        </p>



        <div className="form-group">

          <label>
            نام و نام خانوادگی
          </label>

          <input

            type="text"
            placeholder="مثلاً علی احمدی"
            value={fullName}
            onChange={(e)=>setFullName(e.target.value)}

          />

        </div>




        <div className="form-group">

          <label>
            شماره موبایل
          </label>

          <input

            type="tel"
            placeholder="09xxxxxxxxx"
            value={mobile}
            onChange={(e)=>setMobile(e.target.value)}

          />

        </div>




        <div className="form-group">

          <label>
            ایمیل
          </label>

          <input

            type="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}

          />

        </div>




        <div className="form-group">

          <label>
            رمز عبور
          </label>

          <input

            type="password"
            placeholder="حداقل ۶ کاراکتر"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}

          />

        </div>




        {error && (

          <p className="error-message">
            {error}
          </p>

        )}




        <button

          className="continue-btn"
          onClick={handleRegister}
          disabled={loading}

        >

          {loading
            ? "در حال ساخت حساب..."
            : "ساخت حساب و ادامه"
          }


        </button>



      </div>

    </div>

  );

}


export default OwnerRegister;