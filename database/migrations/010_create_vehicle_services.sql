-- Create vehicle services table

create table public.vehicle_services (

  id uuid default gen_random_uuid()
    primary key,


  vehicle_id uuid
    references public.vehicles(id)
    on delete cascade
    not null,


  service_type text not null,


  service_date timestamptz default now(),


  mileage integer,


  description text,


  created_at timestamptz default now()

);



-- Enable Row Level Security

alter table public.vehicle_services
enable row level security;