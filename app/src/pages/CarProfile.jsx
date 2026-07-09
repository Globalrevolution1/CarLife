import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./../styles/CarProfile.css";


function CarProfile() {


  const { id } = useParams();

  const navigate = useNavigate();


  const [car, setCar] = useState(null);

  const [services, setServices] = useState([]);

  const [loading, setLoading] = useState(true);





  useEffect(() => {

    loadCar();

  }, []);





  async function loadCar() {


    const {

      data,

      error

    } = await supabase

      .from("vehicles")

      .select(`

        id,

        brand,

        model,

        production_year_solar,

        production_year_gregorian,

        color,

        vin

      `)

      .eq("id", id)

      .single();





    if (error) {

      console.log(error);

      setLoading(false);

      return;

    }





    setCar(data);





    const {

      data: servicesData,

      error: servicesError

    } = await supabase

      .from("vehicle_services")

      .select("*")

      .eq(

        "vehicle_id",

        id

      )

      .order(

        "created_at",

        {

          ascending: false

        }

      );





    if (!servicesError) {

      setServices(

        servicesData

      );

    }





    setLoading(false);


  }







  if (loading) {


    return (

      <div className="profile-page">

        <div className="profile-card">

          <h2>
            در حال آماده سازی پرونده...
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
            پرونده خودرو پیدا نشد.
          </h2>

        </div>

      </div>

    );


  }







  const lastService = services.length > 0

    ? services[0]

    : null;







  return (


    <div className="profile-page">


      <div className="profile-card">





        <div className="profile-logo">

          کارنگار

        </div>







        <div className="vehicle-hero">



          <div className="car-icon">

            🚗

          </div>



          <h1>

            {car.brand}

          </h1>



          <h2>

            {car.model}

          </h2>




          <div className="vehicle-meta">


            <span>

              {car.production_year_solar}

            </span>



            <span>

              {car.color}

            </span>



          </div>




          <div className="active-badge">

            ✓ پرونده فعال

          </div>



        </div>









        <div className="summary-card">


          <h3>

            وضعیت خودرو

          </h3>




          <div className="summary-item">


            <span>
              تعداد سرویس‌ها
            </span>


            <strong>

              {services.length}

            </strong>


          </div>






          <div className="summary-item">


            <span>
              آخرین سرویس
            </span>



            <strong>


              {

                lastService

                ?

                lastService.service_type

                :

                "ثبت نشده"

              }


            </strong>


          </div>





        </div>









        <div className="car-info">


          <h3>

            اطلاعات خودرو

          </h3>



          <div>

            <span>
              برند:
            </span>

            {car.brand}

          </div>




          <div>

            <span>
              مدل:
            </span>

            {car.model}

          </div>





          <div>

            <span>
              سال تولید:
            </span>

            {car.production_year_solar}

          </div>





          <div>

            <span>
              رنگ:
            </span>

            {car.color}

          </div>





          <div>

            <span>
              VIN:
            </span>

            {car.vin}

          </div>



        </div>









        <div className="service-history">


          <h3>

            تاریخچه سرویس‌ها

          </h3>





          {

            services.length === 0 ?


            (

              <p>

                هنوز سرویسی ثبت نشده است.

              </p>


            )


            :


            (

              services.map((service)=>(


                <div

                  key={service.id}

                  className="service-box"


                >



                  <strong>

                    🔧 {service.service_type}

                  </strong>




                  <p>

                    کیلومتر:

                    {" "}

                    {service.mileage}

                  </p>





                  <p>

                    {service.description}

                  </p>



                </div>


              ))


            )


          }



        </div>








        <button

          className="continue-btn"

          onClick={() =>

            navigate(`/add-service/${car.id}`)

          }

        >

          + ثبت سرویس جدید

        </button>






      </div>


    </div>


  );


}


export default CarProfile;