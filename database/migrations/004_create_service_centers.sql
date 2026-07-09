-- Create service centers table

create table public.service_centers (

  id uuid default gen_random_uuid()
    primary key,

  owner_id uuid
    references public.profiles(id)
    on delete cascade
    not null,

  name text not null,

  mobile text,

  city text,

  address text,

  is_verified boolean default false,

  created_at timestamptz default now(),

  updated_at timestamptz default now()

);


-- Enable Row Level Security

alter table public.service_centers
enable row level security;