import { useEffect, useState } from "react";
import "./../styles/CarProfile.css";

function CarProfile() {

  const [car, setCar] = useState(null);


  useEffect(() => {

    const savedCar = localStorage.getItem("carProfile");

    if (savedCar) {
      setCar(JSON.parse(savedCar));
    }

  }, []);



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
            <span>سال تولید:</span>
            {car.year}
          </div>


          <div>
            <span>کیلومتر:</span>
            {car.mileage}
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