import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./../styles/AddService.css";


function AddService() {


  const { id } = useParams();

  const navigate = useNavigate();



  const [service, setService] = useState({

    service_type: "",
    mileage: "",
    description: ""

  });



  const [loading, setLoading] = useState(false);





  function handleChange(e) {

    setService({

      ...service,

      [e.target.name]: e.target.value

    });

  }






  async function handleSubmit() {


    setLoading(true);



    const {

      error

    } = await supabase

      .from("vehicle_services")

      .insert({

        vehicle_id: id,

        service_type: service.service_type,

        mileage: Number(service.mileage),

        description: service.description

      });





    if (error) {


      console.log(error);

      alert(error.message);

      setLoading(false);

      return;

    }





    navigate(`/car-profile/${id}`);


    setLoading(false);


  }







  return (

    <div className="register-page">


      <div className="register-card">


        <h1 className="register-logo">
          کارنگار
        </h1>



        <h2 className="register-title">
          ثبت سرویس خودرو
        </h2>



        <p className="register-subtitle">
          اطلاعات سرویس انجام شده را وارد کنید.
        </p>





        <div className="form-group">

          <label>
            نوع سرویس
          </label>


          <input

            name="service_type"

            value={service.service_type}

            onChange={handleChange}

            placeholder="مثلاً تعویض روغن"

          />


        </div>






        <div className="form-group">

          <label>
            کیلومتر خودرو
          </label>


          <input

            name="mileage"

            value={service.mileage}

            onChange={handleChange}

            placeholder="مثلاً 85000"

          />


        </div>







        <div className="form-group">

          <label>
            توضیحات
          </label>


          <textarea

            name="description"

            value={service.description}

            onChange={handleChange}

            placeholder="مثلاً روغن موتور و فیلتر تعویض شد"

          />


        </div>







        <button

          className="continue-btn"

          onClick={handleSubmit}

          disabled={loading}

        >

          {

            loading

            ? "در حال ثبت..."

            : "ثبت سرویس"

          }


        </button>




      </div>


    </div>

  );


}


export default AddService;