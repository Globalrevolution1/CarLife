import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { solarToGregorianYear } from "../utils/dateConverter";
import "./../styles/CarRegister.css";


function CarRegister() {

  const navigate = useNavigate();


  const [car, setCar] = useState({
    brand: "",
    model: "",
    production_year_solar: "",
    vin: "",
    color: "",
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
        data: sessionData
      } = await supabase.auth.getSession();


      console.log(
        "SESSION:",
        sessionData.session
      );



      const {
        data: {
          user
        },
        error: userError
      } = await supabase.auth.getUser();



      console.log(
        "USER:",
        user
      );



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
        data: vehicle,
        error: vehicleError
      } = await supabase
        .from("vehicles")
        .insert({

          vin: car.vin,

          brand: car.brand,

          model: car.model,

          production_year_solar:
            Number(car.production_year_solar),

          production_year_gregorian:
            gregorianYear,

          color: car.color,

        })
        .select()
        .single();




      if (vehicleError) {

        console.log(
          "VEHICLE ERROR:",
          vehicleError
        );


        alert(
          vehicleError.message
        );


        setLoading(false);
        return;

      }




      console.log(
        "CREATED VEHICLE:",
        vehicle
      );





      const {
        error: ownershipError
      } = await supabase
        .from("vehicle_ownerships")
        .insert({

          vehicle_id: vehicle.id,

          owner_id: user.id,

        });





      if (ownershipError) {


        console.log(
          "OWNERSHIP ERROR:",
          ownershipError
        );


        alert(
          ownershipError.message
        );


        setLoading(false);
        return;

      }





      navigate("/car-profile");



    } catch (error) {


      console.log(
        "GENERAL ERROR:",
        error
      );


      alert(
        "خطایی در ثبت خودرو رخ داد."
      );


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