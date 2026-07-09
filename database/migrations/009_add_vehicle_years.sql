-- Add solar and gregorian production years

alter table public.vehicles

add column production_year_solar integer,

add column production_year_gregorian integer;