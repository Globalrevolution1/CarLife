-- Create profiles table
create table public.profiles (

  id uuid references auth.users(id) on delete cascade primary key,

  full_name text,

  mobile text unique,

  role text not null default 'owner'
    check (role in ('owner', 'service_center', 'admin')),

  created_at timestamptz default now(),

  updated_at timestamptz default now()

);


-- Enable Row Level Security
alter table public.profiles
enable row level security;


-- Users can view their own profile
create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);


-- Users can update their own profile
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id);