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
      data:{user}
    } = await supabase.auth.getUser();



    if(!user){

      navigate("/");
      return;

    }



    const {data,error}=await supabase
    .from("vehicle_ownerships")
    .select(`
      vehicles(
        id,
        brand,
        model,
        production_year_solar,
        color,
        current_mileage,
        services(
          id,
          title,
          service_date,
          mileage,
          description,
          verification_status
        )
      )
    `)
    .eq("owner_id",user.id);



    if(error){

      console.log(error);

    }else{


      setVehicles(
        data.map(item=>item.vehicles)
      );

    }



    setLoading(false);

  }





  function getLastService(car){

    if(!car.services || car.services.length===0)
      return null;


    return [...car.services]
    .sort(
      (a,b)=>
      new Date(b.service_date)-new Date(a.service_date)
    )[0];

  }





  function getHealth(car){


    const last=getLastService(car);



    if(!last){

      return {

        percent:70,

        text:"🟡 اطلاعات سرویس کافی نیست"

      };

    }



    const current =
    car.current_mileage || 0;


    const lastKm =
    last.mileage || 0;


    const distance =
    current-lastKm;



    if(distance >= 9000){

      return {

        percent:65,

        text:"🔴 نیاز به سرویس"

      };

    }



    if(distance >= 7000){

      return {

        percent:80,

        text:"🟡 سرویس نزدیک است"

      };

    }



    return {

      percent:95,

      text:"🟢 عالی"

    };


  }







  function getNextService(car){


    const last=getLastService(car);


    if(!last || !last.mileage)
      return "ثبت نشده";



    const next =
    last.mileage + 10000;



    const remain =
    next-(car.current_mileage || 0);



    if(remain<=0)

      return "نیاز به سرویس";


    return remain.toLocaleString()+" km دیگر";


  }






  if(loading){

    return(

      <div className="dashboard-page">

        <div className="dashboard-card">

          <h2>
            در حال بارگذاری...
          </h2>

        </div>

      </div>

    );

  }






  return(


    <div className="dashboard-page">


      <div className="dashboard-card">



        <div className="dashboard-header">


          <h1>
            کارنگار
          </h1>


          <p>
            وضعیت خودروهای من
          </p>


        </div>





        {

        vehicles.map((car)=>{


          const health=getHealth(car);

          const last=getLastService(car);



          return(


          <div

          key={car.id}

          className="vehicle-box"

          onClick={()=>navigate(`/car-profile/${car.id}`)}

          >





            <div className="vehicle-top">


              <div className="vehicle-icon">

                🚗

              </div>



              <div>

                <h3>

                  {car.brand}

                </h3>


                <h4>

                  {car.model}

                </h4>


              </div>


            </div>






            <div className="health-box">


              <span>
                وضعیت خودرو
              </span>


              <strong>

                {health.text}

              </strong>


              <small>

                سلامت خودرو {health.percent}%

              </small>


            </div>







            <div className="service-box">


              <span>
                آخرین سرویس
              </span>


              <strong>

                {
                  last
                  ?
                  last.title
                  :
                  "ثبت نشده"

                }

              </strong>



              {

                last &&

                <small>

                  {last.mileage?.toLocaleString()} km

                </small>

              }


            </div>






            <div className="service-box">


              <span>
                سرویس بعدی
              </span>


              <strong>

                {getNextService(car)}

              </strong>


            </div>








            <div className="vehicle-details">


              <div>

                <span>
                  کیلومتر فعلی
                </span>


                <strong>

                  {(car.current_mileage || 0)
                  .toLocaleString()} km

                </strong>


              </div>





              <div>

                <span>
                  سال
                </span>


                <strong>

                  {car.production_year_solar}

                </strong>


              </div>



            </div>





          </div>


          );


        })

        }







        <button

        className="continue-btn"

        onClick={()=>navigate("/car-register")}

        >

        + ثبت خودروی جدید

        </button>




      </div>


    </div>


  );


}


export default OwnerDashboard;