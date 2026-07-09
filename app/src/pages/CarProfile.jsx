import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import "./../styles/CarProfile.css";


function CarProfile() {


  const [car, setCar] = useState(null);

  const [loading, setLoading] = useState(true);



  useEffect(() => {

    loadCar();

  }, []);




  async function loadCar() {


    try {


      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();




      if (!user) {

        setLoading(false);
        return;

      }





      const {
        data,
        error
      } = await supabase
        .from("vehicle_ownerships")
        .select(`
          vehicle_id,
          vehicles (
            id,
            brand,
            model,
            production_year_solar,
            production_year_gregorian,
            color,
            vin
          )
        `)
        .eq(
          "owner_id",
          user.id
        )
        .single();





      if (error) {

        console.log(
          "PROFILE ERROR:",
          error
        );

        setLoading(false);
        return;

      }





      setCar(
        data.vehicles
      );



    } catch(error) {


      console.log(error);


    }


    setLoading(false);


  }





  if (loading) {

    return (

      <div className="profile-page">

        <div className="profile-card">

          <h2>
            در حال ساخت پرونده...
          </h2>

        </div>

      </div>

    );

  }






  if (!car) {

    return (

      <div className="profile-page">

        <div className="profile-card">

          <h2>
            هنوز پرونده‌ای ثبت نشده است.
          </h2>

        </div>

      </div>

    );

  }





  return (

    <div className="profile-page">


      <div className="profile-card">



        <h1 className="profile-logo">
          کارنگار
        </h1>



        <h2>
          پرونده دیجیتال خودرو
        </h2>





        <div className="car-info">


          <div>
            <span>برند:</span>
            {car.brand}
          </div>



          <div>
            <span>مدل:</span>
            {car.model}
          </div>




          <div>
            <span>سال تولید شمسی:</span>
            {car.production_year_solar}
          </div>




          <div>
            <span>سال تولید میلادی:</span>
            {car.production_year_gregorian}
          </div>




          <div>
            <span>رنگ:</span>
            {car.color}
          </div>




          <div>
            <span>شماره شاسی:</span>
            {car.vin}
          </div>



        </div>





        <div className="status">

          ✅ پرونده خودرو فعال است

        </div>




      </div>


    </div>

  );


}


export default CarProfile;