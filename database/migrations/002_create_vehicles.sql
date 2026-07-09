-- Create vehicles table

create table public.vehicles (

  id uuid default gen_random_uuid()
    primary key,

  vin text unique not null,

  brand text,

  model text,

  production_year integer,

  color text,

  created_at timestamptz default now(),

  updated_at timestamptz default now()

);


-- Enable Row Level Security

alter table public.vehicles
enable row level security;