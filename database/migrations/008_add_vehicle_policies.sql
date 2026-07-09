-- Users can insert their own vehicles
create policy "Users can insert vehicles"
on public.vehicles
for insert
with check (
  true
);


-- Users can view vehicles they own
create policy "Users can view own vehicles"
on public.vehicles
for select
using (
  exists (
    select 1
    from public.vehicle_ownerships
    where vehicle_ownerships.vehicle_id = vehicles.id
    and vehicle_ownerships.owner_id = auth.uid()
  )
);



-- Users can create ownership records
create policy "Users can create ownership"
on public.vehicle_ownerships
for insert
with check (
  owner_id = auth.uid()
);



-- Users can view their ownership history
create policy "Users can view own ownership history"
on public.vehicle_ownerships
for select
using (
  owner_id = auth.uid()
);