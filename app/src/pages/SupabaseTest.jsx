import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function SupabaseTest() {

  const [status, setStatus] = useState("در حال اتصال...");

  useEffect(() => {

    async function testConnection() {

      const { error } = await supabase
        .from("profiles")
        .select("*")
        .limit(1);

      if (error) {
        setStatus("خطا در اتصال: " + error.message);
      } else {
        setStatus("اتصال به Supabase موفق بود ✅");
      }

    }

    testConnection();

  }, []);


  return (
    <div>
      <h1>تست اتصال</h1>
      <p>{status}</p>
    </div>
  );
}

export default SupabaseTest;