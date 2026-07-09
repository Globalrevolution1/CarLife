-- Function to automatically create a profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.profiles (
    id,
    full_name,
    mobile,
    role
  )
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.phone,
    coalesce(new.raw_user_meta_data->>'role', 'owner')
  );

  return new;

end;
$$;


-- Trigger
create trigger on_auth_user_created

after insert on auth.users

for each row

execute function public.handle_new_user();