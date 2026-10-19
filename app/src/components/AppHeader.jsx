import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./../styles/AppHeader.css";

function AppHeader({ title = "کارنگار" }) {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("LOGOUT ERROR:", err);
    }
    navigate("/");
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-brand">
          <div className="app-header-icon">🚗</div>
          <h2 className="app-header-title">{title}</h2>
        </div>
        <button className="app-header-logout" onClick={handleLogout} type="button">
          خروج
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
