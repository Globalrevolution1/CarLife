import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import OwnerRegister from "./pages/OwnerRegister";
import CarRegister from "./pages/CarRegister";
import CarProfile from "./pages/CarProfile";
import AddService from "./pages/AddService";
import SupabaseTest from "./pages/SupabaseTest";

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<Home />}
        />


        <Route
          path="/owner-register"
          element={<OwnerRegister />}
        />


        <Route
          path="/car-register"
          element={<CarRegister />}
        />


        <Route
          path="/car-profile"
          element={<CarProfile />}
        />


        <Route
          path="/add-service"
          element={<AddService />}
        />

        <Route
  path="/test"
  element={<SupabaseTest />}
/>

      </Routes>

    </BrowserRouter>
  );
}


export default App;