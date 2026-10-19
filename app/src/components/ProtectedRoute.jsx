import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStatus(data.session ? "in" : "out");
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#667085" }}>
        <p>در حال بررسی ورود...</p>
      </div>
    );
  }

  if (status === "out") {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
