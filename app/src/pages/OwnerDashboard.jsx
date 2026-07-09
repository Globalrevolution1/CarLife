import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./../styles/OwnerDashboard.css";


function OwnerDashboard() {


  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState([]);

  const [loading, setLoading] = useState(true);




  useEffect(() => {

    loadVehicles();

  }, []);





  async function loadVehicles() {


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
        vehicles (
          id,
          brand,
          model,
          production_year_solar,
          color
        )
      `)
      .eq(
        "owner_id",
        user.id
      );




    if (error) {

      console.log(error);

    } 
    else {

      setVehicles(
        data.map(item => item.vehicles)
      );

    }



    setLoading(false);

  }





  if (loading) {

    return (

      <div className="dashboard-page">

        <div className="dashboard-card">

          در حال بارگذاری...

        </div>

      </div>

    );

  }





  return (

    <div className="dashboard-page">


      <div className="dashboard-card">


        <h1>
          کارنگار
        </h1>


        <h2>
          خودروهای من
        </h2>



        {
          vehicles.length === 0 ? (

            <p>
              هنوز خودرویی ثبت نکرده‌اید.
            </p>

          ) : (


            vehicles.map((car)=>(

              <div
                className="vehicle-box"
                key={car.id}
              >

                <h3>
                  {car.brand} {car.model}
                </h3>


                <p>
                  سال:
                  {" "}
                  {car.production_year_solar}
                </p>


                <p>
                  رنگ:
                  {" "}
                  {car.color}
                </p>



                <button

                  onClick={() =>
                    navigate(`/car-profile/${car.id}`)
                  }

                >

                  مشاهده پرونده

                </button>


              </div>

            ))

          )
        }




        <button

          className="continue-btn"

          onClick={() =>
            navigate("/car-register")
          }

        >

          افزودن خودرو جدید

        </button>



      </div>


    </div>

  );

}


export default OwnerDashboard;