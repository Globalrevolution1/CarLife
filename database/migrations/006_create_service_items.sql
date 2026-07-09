-- Create service items table

create table public.service_items (

  id uuid default gen_random_uuid()
    primary key,

  service_id uuid
    references public.services(id)
    on delete cascade
    not null,

  name text not null,

  quantity numeric(10,2)
    default 1,

  unit_price numeric(12,2),

  created_at timestamptz default now()

);


-- Enable Row Level Security

alter table public.service_items
enable row level security;