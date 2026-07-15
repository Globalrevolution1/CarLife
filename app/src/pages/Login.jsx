import "./../styles/Login.css";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../lib/supabase";

function Login() {

  const navigate = useNavigate();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");



  async function handleLogin() {

    setLoading(true);

    setError("");



    const { error } = await supabase.auth.signInWithPassword({

      email,

      password,

    });



    if (error) {

      setError("ایمیل یا رمز عبور صحیح نیست.");

      setLoading(false);

      return;

    }



    navigate("/dashboard");

  }



  return (

    <div className="login-page">

      <div className="login-card">

        <div className="brand">

          <div className="brand-icon">

            🚗

          </div>

          <h1>

            کارنگار

          </h1>

          <p>

            پرونده دیجیتال مادام العمر خودرو

          </p>

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

            placeholder="رمز عبور"

            value={password}

            onChange={(e)=>setPassword(e.target.value)}

          />

        </div>



        {

          error && (

            <p className="error-message">

              {error}

            </p>

          )

        }



        <button

          className="login-btn"

          onClick={handleLogin}

          disabled={loading}

        >

          {

            loading

            ?

            "در حال ورود..."

            :

            "ورود"

          }

        </button>



        <div className="divider">

          <span>

            یا

          </span>

        </div>



        <Link

          to="/owner-register"

          className="register-link"

        >

          اولین باره؟

          ایجاد حساب کاربری

        </Link>

      </div>

    </div>

  );

}

export default Login;