import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./../styles/CarRegister.css";

function CarRegister() {

  const navigate = useNavigate();

  const [car, setCar] = useState({
    brand: "",
    model: "",
    year: "",
    mileage: "",
  });


  function handleChange(e) {
    setCar({
      ...car,
      [e.target.name]: e.target.value,
    });
  }


  function handleSubmit() {

    localStorage.setItem(
      "carProfile",
      JSON.stringify(car)
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
          ثبت خودرو
        </h2>

        <p className="register-subtitle">
          اطلاعات خودرو را وارد کنید تا پرونده دیجیتال ساخته شود.
        </p>


        <div className="form-group">
          <label>برند خودرو</label>
          <input
            name="brand"
            value={car.brand}
            onChange={handleChange}
            placeholder="مثلاً پژو"
          />
        </div>


        <div className="form-group">
          <label>مدل خودرو</label>
          <input
            name="model"
            value={car.model}
            onChange={handleChange}
            placeholder="مثلاً 206 تیپ 2"
          />
        </div>


        <div className="form-group">
          <label>سال تولید</label>
          <input
            name="year"
            value={car.year}
            onChange={handleChange}
            placeholder="مثلاً 1400"
          />
        </div>


        <div className="form-group">
          <label>کیلومتر فعلی</label>
          <input
            name="mileage"
            value={car.mileage}
            onChange={handleChange}
            placeholder="مثلاً 85000"
          />
        </div>


        <button
          className="continue-btn"
          onClick={handleSubmit}
        >
          ساخت پرونده خودرو
        </button>


      </div>

    </div>
  );
}

export default CarRegister;