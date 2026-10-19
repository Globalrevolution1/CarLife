import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AppHeader from "../components/AppHeader";
import {
  getLatestService as engineGetLatestService,
  getOverallHealth as engineGetOverallHealth,
  getUpcomingServices as engineGetUpcomingServices,
} from "../utils/vehicleHealthEngine";
import "./../styles/OwnerDashboard.css";


const HEALTH_ICON = {
  good: "🟢",
  warning: "🟡",
  danger: "🔴",
  unknown: "⚪",
};


function formatNumber(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "—";

  }


  return Number(value).toLocaleString(
    "en-US"
  );

}


function OwnerDashboard() {

  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState([]);
  const [serviceTemplates, setServiceTemplates] = useState([]);
  const [loading, setLoading] = useState(true);


  // =========================================================
  // LOAD VEHICLES
  //
  // با useCallback تعریف می‌شود تا useEffect به یک مرجع
  // پایدار وصل بماند (رفع react-hooks/immutability).
  // =========================================================

  const loadVehicles = useCallback(async () => {

    try {

      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();


      if (!user) {

        navigate("/");

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
            color,
            current_mileage,
            services (
              id,
              title,
              service_date,
              mileage,
              description,
              verification_status
            )
          )
        `)

        .eq("owner_id", user.id);


      let validVehicles = [];


      if (error) {

        setVehicles([]);

      } else {

        validVehicles = data
          .map(function (item) {
            return item.vehicles;
          })
          .filter(function (vehicle) {
            return vehicle !== null;
          });


        setVehicles(validVehicles);

      }


      // -----------------------------------------------------
      // SERVICE TEMPLATES
      //
      // برای اینکه Health و «سرویس بعدی» در داشبورد
      // از همان template های پروندهٔ خودرو استفاده کنند
      // و از آستانه‌های هاردکد خارج شوند.
      //
      // نکتهٔ مهم: یک کوئری برای کل جدول می‌زنیم، نه یک کوئری
      // به ازای هر جفت (brand, model). دو دلیل:
      //   ۱) ردیف‌های «عمومی» (brand خالی) باید بیایند
      //   ۲) filterTemplatesForVehicle فیلتر دقیق مدل را با
      //      fallback به برند انجام می‌دهد؛ سمت سرور نباید
      //      مدلی را که هنوز ردیف اختصاصی ندارد حذف کند
      //      (وگرنه سلامتِ مدل‌های ثبت‌نشده خالی می‌ماند)
      // -----------------------------------------------------

      const {
        data: templateData,
      } = await supabase

        .from("service_templates")

        .select(`
          id,
          brand,
          model,
          service_name,
          interval_km
        `)

        .order("interval_km", {
          ascending: true,
        });


      setServiceTemplates(
        templateData || []
      );

    } catch {

      setVehicles([]);

    } finally {

      setLoading(false);

    }

  }, [navigate]);


  useEffect(() => {

    // fetch-on-mount است و setState ها همگی بعد از await
    // اتفاق می‌افتند؛ قاعدهٔ set-state-in-effect این را
    // به‌صورت محافظه‌کارانه خطا می‌گیرد.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadVehicles();

  }, [loadVehicles]);


  function getLastService(car) {

    return engineGetLatestService(
      car?.services
    );

  }


  function getHealth(car) {

const health =
      engineGetOverallHealth({
        templates: serviceTemplates,
        services: car?.services || [],
        currentMileage:
          car?.current_mileage || 0,
        vehicle: car,
        formatNumber,
      });


    if (
      health.score === null
    ) {

      return {
        percent: null,
        text:
          `⚪ ${health.label}`,
        className: health.className,
      };

    }


    return {
      percent: health.score,
      text:
        `${HEALTH_ICON[health.className]} ${health.label}`,
      className: health.className,
    };

  }


  function getNextService(car) {

const upcoming =
      engineGetUpcomingServices({
        templates: serviceTemplates,
        services: car?.services || [],
        currentMileage:
          car?.current_mileage || 0,
        vehicle: car,
        formatNumber,
      });


    if (
      upcoming.length === 0
    ) {

      const hasHistory =
        engineGetLatestService(
          car?.services
        ) !== null;


      return hasHistory
        ? "نیاز به سرویس"
        : "ثبت نشده";

    }


    return (
      formatNumber(
        upcoming[0].status.remaining
      ) + " km دیگر"
    );

  }

  function openCarProfile(carId) {

    navigate(
      "/car-profile/" + carId
    );

  }


  if (loading) {

    return (

      <div className="dashboard-page">

        <div className="dashboard-card">

          <h2>
            در حال بارگذاری...
          </h2>

        </div>

      </div>

    );

  }


  return (

    <div className="dashboard-page">

      <div className="dashboard-card">


        <AppHeader />


        <div className="dashboard-header">

          <p>
            وضعیت خودروهای من
          </p>

        </div>


        {
          vehicles.length === 0 ? (

            <div className="empty-box">

              <div className="empty-icon">
                🚗
              </div>

              <h3>
                هنوز خودرویی ثبت نشده است
              </h3>

              <p>
                اولین خودرو را ثبت کنید تا پرونده دیجیتال آن ساخته شود.
              </p>

            </div>

          ) : (

            vehicles.map(function (car) {

              const health =
                getHealth(car);

              const lastService =
                getLastService(car);


              return (

                <div
                  key={car.id}
                  className="vehicle-box"
                  onClick={function () {
                    openCarProfile(car.id);
                  }}
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

                      {
                        health.percent !== null
                          ? `سلامت خودرو ${health.percent}%`
                          : "سلامت خودرو نامشخص"
                      }

                    </small>

                  </div>


                  <div className="service-box">

                    <span>
                      آخرین سرویس
                    </span>

                    <strong>

                      {
                        lastService
                          ? lastService.title
                          : "ثبت نشده"
                      }

                    </strong>


                    {
                      lastService && (

                        <small>

                          {
                            lastService.mileage
                              ? Number(
                                  lastService.mileage
                                ).toLocaleString() + " km"
                              : "کیلومتر ثبت نشده"
                          }

                        </small>

                      )
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

                        {
                          Number(
                            car.current_mileage || 0
                          ).toLocaleString()
                        }

                        {" km"}

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


                    <div>

                      <span>
                        رنگ
                      </span>

                      <strong>
                        {car.color}
                      </strong>

                    </div>


                  </div>


                </div>

              );

            })

          )
        }


        <button
          className="continue-btn"
          onClick={function () {
            navigate("/car-register");
          }}
        >
          + ثبت خودروی جدید
        </button>


        <button
          className="continue-btn"
          onClick={function () {
            navigate("/center-register");
          }}
          style={{
            marginTop: "12px",
            background: "#071a33",
          }}
        >
          🔧 مرکز خدمات
        </button>


        <button
          className="continue-btn"
          onClick={function () {
            navigate("/transfer");
          }}
          style={{
            marginTop: "12px",
            background: "#071a33",
          }}
        >
          🔑 دریافت پرونده با کد انتقال
        </button>


      </div>

    </div>

  );

}


export default OwnerDashboard;