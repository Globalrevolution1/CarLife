-- Create vehicle services table

create table public.services (

  id uuid default gen_random_uuid()
    primary key,

  vehicle_id uuid
    references public.vehicles(id)
    on delete cascade
    not null,

  service_center_id uuid
    references public.service_centers(id)
    on delete set null,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  title text not null,

  description text,

  service_date timestamptz default now(),

  mileage integer,

  cost numeric(12,2),

  verification_status text default 'owner_reported'
    check (
      verification_status in (
        'owner_reported',
        'service_center_verified'
      )
    ),

  created_at timestamptz default now(),

  updated_at timestamptz default now()

);


-- Enable Row Level Security

alter table public.services
enable row level security;