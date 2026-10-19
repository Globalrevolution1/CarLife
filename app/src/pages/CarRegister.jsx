import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { solarToGregorianYear } from "../utils/dateConverter";
import AppHeader from "../components/AppHeader";


function CarRegister() {

  const navigate = useNavigate();


  const [car, setCar] = useState({
    brand: "",
    model: "",
    production_year_solar: "",
    vin: "",
    color: "",
    current_mileage: "",
  });


  const [loading, setLoading] = useState(false);



  function handleChange(e) {

    setCar({
      ...car,
      [e.target.name]: e.target.value,
    });

  }



  async function handleSubmit() {

    setLoading(true);


    try {




      const {
        data: {
          user
        },
        error: userError
      } = await supabase.auth.getUser();



      if (userError || !user) {

        alert(
          "کاربر وارد نشده است. لطفاً دوباره وارد شوید."
        );

        setLoading(false);
        return;

      }



      const gregorianYear =
        solarToGregorianYear(
          car.production_year_solar
        );



      const {
        data: vehicleId,
        error: vehicleError
      } = await supabase.rpc(
        "register_vehicle",
        {
          p_vin: car.vin,
          p_brand: car.brand,
          p_model: car.model,
          p_production_year_solar:
            Number(car.production_year_solar),
          p_production_year_gregorian:
            gregorianYear,
          p_color: car.color,
          p_current_mileage:
            Number(car.current_mileage),
        }
      );





      if (vehicleError) {

        alert(
          vehicleError.message
        );


        setLoading(false);
        return;

      }











      // مالکیت اینجا ثبت نمی‌شود: تابع register_vehicle خودش
      // ردیف مالکیت را با owner_id = auth.uid() می‌سازد.












      navigate(`/car-profile/${vehicleId}`);




    } catch {

      alert(
        "خطایی در ثبت خودرو رخ داد."
      );


    }



    setLoading(false);

  }







  return (

    <div className="register-page">

      <div className="register-card">


        <AppHeader />



        <h2 className="register-title">
          ثبت خودرو
        </h2>



        <p className="register-subtitle">
          اطلاعات خودرو را وارد کنید تا پرونده دیجیتال ساخته شود.
        </p>






        <div className="form-group">

          <label>
            برند خودرو
          </label>

          <input

            name="brand"

            value={car.brand}

            onChange={handleChange}

            placeholder="مثلاً پژو"

          />

        </div>







        <div className="form-group">

          <label>
            مدل خودرو
          </label>

          <input

            name="model"

            value={car.model}

            onChange={handleChange}

            placeholder="مثلاً 206 تیپ 2"

          />

        </div>







        <div className="form-group">

          <label>
            سال مدل (شمسی)
          </label>

          <input

            name="production_year_solar"

            value={car.production_year_solar}

            onChange={handleChange}

            placeholder="مثلاً 1402"

          />

        </div>







        <div className="form-group">

          <label>
            شماره شاسی (VIN)
          </label>

          <input

            name="vin"

            value={car.vin}

            onChange={handleChange}

            placeholder="شماره شاسی خودرو"

          />

        </div>







        <div className="form-group">

          <label>
            رنگ خودرو
          </label>

          <input

            name="color"

            value={car.color}

            onChange={handleChange}

            placeholder="مثلاً سفید"

          />

        </div>







        <div className="form-group">

          <label>
            کیلومتر فعلی خودرو
          </label>

          <input

            name="current_mileage"

            value={car.current_mileage}

            onChange={handleChange}

            placeholder="مثلاً 85000"

          />

        </div>







        <button

          className="continue-btn"

          onClick={handleSubmit}

          disabled={loading}

        >

          {loading
            ? "در حال ساخت پرونده..."
            : "ساخت پرونده خودرو"
          }


        </button>



      </div>

    </div>

  );

}


export default CarRegister;