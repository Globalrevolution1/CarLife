import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AppHeader from "../components/AppHeader";
import SmartLabel from "../components/SmartLabel";
import {
  getLatestService as engineGetLatestService,
  getOverallHealth as engineGetOverallHealth,
  getUpcomingServices as engineGetUpcomingServices,
  getDueServices as engineGetDueServices,
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
          interval_km,
          interval_months
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


  // امروز — مبنای سنجش «ماه» (interval_months) در موتور سلامت.
  const TODAY = new Date();


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
        currentDate: TODAY,
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
        currentDate: TODAY,
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


    // label خودِ موتور، مبنای واقعاً تعیین‌کننده را می‌گوید:
    // «۵۰۰ km دیگر» یا «۱۲ روز دیگر»
    return upcoming[0].status.label;

  }


  // تعداد سرویس‌های عقب‌افتاده / نزدیک‌موعدِ این خودرو
  function getDueCount(car) {

    return engineGetDueServices({
      templates: serviceTemplates,
      services: car?.services || [],
      currentMileage:
        car?.current_mileage || 0,
      vehicle: car,
      currentDate: TODAY,
      formatNumber,
    }).length;

  }

  function openCarProfile(carId) {

    navigate(
      "/car-profile/" + carId
    );

  }


  // ==========================================
  // REMINDERS — PRD Phase 5
  // یادآوری‌های همهٔ خودروها در یک جا،
  // فوری‌ترین اول (عقب‌افتاده قبل از نزدیک‌موعد).
  // ==========================================

  const RANK = { danger: 2, warning: 1 };

  const allReminders = vehicles
    .flatMap(function (car) {
      return engineGetDueServices({
        templates: serviceTemplates,
        services: car?.services || [],
        currentMileage:
          car?.current_mileage || 0,
        vehicle: car,
        currentDate: TODAY,
        formatNumber,
      }).map(function (item) {
        return { ...item, car };
      });
    })
    .sort(function (a, b) {
      return (
        (RANK[b.status.status] || 0) -
        (RANK[a.status.status] || 0)
      );
    });


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


        {allReminders.length > 0 && (

          <div className="reminders-panel">

            <div className="reminders-title">

              <h3>
                ⏰ یادآوری‌ها
              </h3>

              <span>
                {allReminders.length} مورد نیاز به توجه
              </span>

            </div>

            {allReminders.map(function (item) {

              return (
                <div
                  key={`${item.car.id}-${item.template.id}`}
                  className={
                    item.status.status === "danger"
                      ? "reminder-row is-overdue"
                      : "reminder-row is-soon"
                  }
                  onClick={function () {
                    openCarProfile(item.car.id);
                  }}
                >

                  <div>

                    <strong>
                      {item.car.brand} {item.car.model}
                    </strong>

                    <span>
                      {item.template.service_name}
                    </span>

                  </div>

                  <div>

                    <b>
                      {item.status.status === "danger"
                        ? "🔴"
                        : "🟡"}{" "}
                      <SmartLabel>
                        {item.status.label}
                      </SmartLabel>
                    </b>

                    <small>
                      {item.status.status === "danger"
                        ? "عقب‌افتاده"
                        : "نزدیک موعد"}
                    </small>

                  </div>

                </div>
              );

            })}

          </div>

        )}


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

              const dueCount =
                getDueCount(car);


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
                      سلامت خودرو{" "}
                      {health.percent !== null ? (
                        <bdi>{health.percent}%</bdi>
                      ) : (
                        "نامشخص"
                      )}
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

                          {lastService.mileage ? (
                            <bdi>
                              {Number(
                                lastService.mileage
                              ).toLocaleString()}{" "}
                              km
                            </bdi>
                          ) : (
                            "کیلومتر ثبت نشده"
                          )}

                        </small>

                      )
                    }

                  </div>


                  <div className="service-box">

                    <span>
                      سرویس بعدی
                    </span>

                    <strong>
                      <SmartLabel>
                        {getNextService(car)}
                      </SmartLabel>
                    </strong>

                  </div>


                  {dueCount > 0 && (

                    <div className="service-box reminder-box">

                      <span>
                        ⏰ یادآوری
                      </span>

                      <strong>
                        {dueCount} مورد نیاز به توجه
                      </strong>

                    </div>

                  )}


                  <div className="vehicle-details">


                    <div>

                      <span>
                        کیلومتر فعلی
                      </span>

                      <strong>
                        <bdi>
                          {Number(
                            car.current_mileage || 0
                          ).toLocaleString()}{" "}
                          km
                        </bdi>
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