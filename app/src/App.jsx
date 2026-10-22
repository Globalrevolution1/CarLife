import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import OwnerRegister from "./pages/OwnerRegister";
import OwnerDashboard from "./pages/OwnerDashboard";
import CarRegister from "./pages/CarRegister";
import CarProfile from "./pages/CarProfile";
import AddService from "./pages/AddService";
import CenterRegister from "./pages/CenterRegister";
import CenterPanel from "./pages/CenterPanel";
import CarEdit from "./pages/CarEdit";
import TransferClaim from "./pages/TransferClaim";
import VehicleReport from "./pages/VehicleReport";
import ProtectedRoute from "./components/ProtectedRoute";

// صفحهٔ دیباگ /test و فایل‌های بلااستفاده (SupabaseTest, Dashboard,
// ServiceRegister, App.css) حذف شدند تا چیزی از بیرون در دسترس نباشد
// و در build نیاید.


function App() {

  return (

    <BrowserRouter>

      <Routes>


        {/* صفحه‌های عمومی: نیازی به ورود ندارند */}

        <Route 
          path="/" 
          element={<Login />} 
        />


        <Route 
          path="/owner-register" 
          element={<OwnerRegister />} 
        />


        {/* صفحه‌های خصوصی: بدون ورود به صفحهٔ ورود می‌روند */}

        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <OwnerDashboard />
            </ProtectedRoute>
          } 
        />


        <Route 
          path="/car-register" 
          element={
            <ProtectedRoute>
              <CarRegister />
            </ProtectedRoute>
          } 
        />


        <Route 
          path="/car-profile/:id" 
          element={
            <ProtectedRoute>
              <CarProfile />
            </ProtectedRoute>
          } 
        />


        <Route 
          path="/car-edit/:id" 
          element={
            <ProtectedRoute>
              <CarEdit />
            </ProtectedRoute>
          } 
        />


        <Route 
          path="/add-service/:id" 
          element={
            <ProtectedRoute>
              <AddService />
            </ProtectedRoute>
          } 
        />


        {/* خروجی گزارش خودرو — قابل چاپ / ذخیره PDF */}
        <Route 
          path="/report/:id" 
          element={
            <ProtectedRoute>
              <VehicleReport />
            </ProtectedRoute>
          } 
        />


        {/* گزارش عمومی با لینک اشتراک (فاز ۸) — بدون ورود.
            دسترسی فقط با توکنِ منقضی‌نشده از مسیر تابع دیتابیس */}
        <Route 
          path="/v/:token" 
          element={<VehicleReport publicMode />} 
        />


        <Route 
          path="/center-register" 
          element={
            <ProtectedRoute>
              <CenterRegister />
            </ProtectedRoute>
          } 
        />


        <Route 
          path="/center-panel" 
          element={
            <ProtectedRoute>
              <CenterPanel />
            </ProtectedRoute>
          } 
        />


        <Route 
          path="/transfer" 
          element={
            <ProtectedRoute>
              <TransferClaim />
            </ProtectedRoute>
          } 
        />


        {/* هر مسیر ناشناخته به ورود برمی‌گردد */}

        <Route 
          path="*" 
          element={<Login />} 
        />


      </Routes>

    </BrowserRouter>

  );

}


export default App;
