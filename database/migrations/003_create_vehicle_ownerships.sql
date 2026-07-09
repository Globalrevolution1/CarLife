-- Create vehicle ownership history table

create table public.vehicle_ownerships (

  id uuid default gen_random_uuid()
    primary key,

  vehicle_id uuid
    references public.vehicles(id)
    on delete cascade
    not null,

  owner_id uuid
    references public.profiles(id)
    on delete cascade
    not null,

  start_date timestamptz default now(),

  end_date timestamptz,

  created_at timestamptz default now()

);


-- Enable Row Level Security

alter table public.vehicle_ownerships
enable row level security;