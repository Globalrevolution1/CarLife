import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../styles/AddService.css";

function AddService() {

  const navigate = useNavigate();

  const [service, setService] = useState({
    type: "",
    date: "",
    mileage: "",
    description: "",
  });


  function handleChange(e) {
    setService({
      ...service,
      [e.target.name]: e.target.value,
    });
  }


  function handleSubmit() {

    localStorage.setItem(
      "carService",
      JSON.stringify(service)
    );

    navigate("/car-profile");

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
          سابقه خدمات خودرو را ثبت کنید.
        </p>


        <div className="form-group">
          <label>
            نوع سرویس
          </label>

          <input
            name="type"
            value={service.type}
            onChange={handleChange}
            placeholder="مثلاً تعویض روغن"
          />
        </div>


        <div className="form-group">
          <label>
            تاریخ سرویس
          </label>

          <input
            name="date"
            value={service.date}
            onChange={handleChange}
            placeholder="مثلاً 1405/04/18"
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
            placeholder="توضیحات سرویس..."
          />
        </div>


        <button
          className="continue-btn"
          onClick={handleSubmit}
        >
          ثبت سرویس
        </button>


      </div>

    </div>
  );
}


export default AddService;