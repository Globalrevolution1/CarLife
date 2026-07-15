const { data, error } = await supabase
  .from("vehicle_ownerships")
  .select(`
    vehicles (
      id,
      brand,
      model,
      production_year_solar,
      color,
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