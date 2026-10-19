-- =============================================================
-- 014 — انتقال پروندهٔ خودرو به نفر بعدی (بخش ۲ PRD)
-- =============================================================
--
-- خواسته: «هر وقت خواست بفروشه بتونه به طور کل پرونده سلامت
-- خودرو رو به نفر بعدی انتقال بده.»
--
-- مدل کار:
--   ۱) مالک فعلی یک کد انتقال می‌سازد (۸ کاراکتری، ۷۲ ساعته)
--   ۲) خریدار با حساب خودش کد را وارد می‌کند
--   ۳) مالکیت قبلی بسته و مالکیت جدید ثبت می‌شود
--
-- چرا این مدل؟ چون سیاست‌های 012 همه‌جا شرط
--   vo.end_date is null
-- دارند؛ یعنی به‌محض بسته شدن مالکیت قبلی، مالک قبلی
-- خودکار به خودرو و سرویس‌هایش دسترسی ندارد. نیازی به
-- حذف داده یا policy جدید روی vehicles/services نیست.
--
-- تصمیم امنیتی:
--   * هیچ INSERT/UPDATE مستقیم کلاینت روی این جدول نیست.
--   * هر دو تابع SECURITY DEFINER هستند.
--   * ساخت کد فقط برای مالکِ فعال خودرو ممکن است.
--   * وارد کردن کد فقط برای کاربرِ لاگین‌شده‌ای که
--     سازندهٔ کد نیست (خودش نمی‌تواند خودش را منتقل کند).
--   * ایندکس یکتای 012 (vehicle_ownerships_one_active_owner)
--     تضمین می‌کند یک خودرو هرگز دو مالک فعال نداشته باشد؛
--     ترتیب دستورها طوری است که اول مالکیت قبلی بسته می‌شود،
--     بعد مالکیت جدید اضافه می‌گردد.
--
-- idempotent: چند بار اجرا شدن آسیبی ندارد.
-- =============================================================


-- =============================================================
-- 1) جدول کدهای انتقال
-- =============================================================

create table if not exists public.vehicle_transfer_codes (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null
                references public.vehicles (id) on delete cascade,
  code        text not null unique,
  created_by  uuid not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid,
  created_at  timestamptz not null default now()
);


alter table public.vehicle_transfer_codes enable row level security;


create index if not exists vehicle_transfer_codes_vehicle_idx
  on public.vehicle_transfer_codes (vehicle_id);


-- فقط خواندن برای سازندهٔ کد. نوشتن از مسیر کلاینت بسته است.
revoke insert, update, delete, truncate, references, trigger
  on table public.vehicle_transfer_codes
  from anon, authenticated;

grant select on table public.vehicle_transfer_codes
  to authenticated;


drop policy if exists "Owners can view their own transfer codes"
  on public.vehicle_transfer_codes;

create policy "Owners can view their own transfer codes"
  on public.vehicle_transfer_codes for select
  to authenticated
  using (created_by = auth.uid());


-- =============================================================
-- 2) ساخت کد انتقال
-- =============================================================

create or replace function public.create_transfer_code(
  p_vehicle_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_owned    uuid;
  v_code     text;
  v_attempts integer := 0;
begin
  if v_uid is null then
    raise exception 'ابتدا وارد حساب خود شوید.'
      using errcode = '42501';
  end if;

  -- فقط مالکِ فعالِ همین خودرو اجازهٔ ساخت کد دارد.
  select vo.vehicle_id
    into v_owned
    from public.vehicle_ownerships vo
   where vo.vehicle_id = p_vehicle_id
     and vo.owner_id   = v_uid
     and vo.end_date   is null;

  if v_owned is null then
    raise exception 'فقط مالک فعلی خودرو می‌تواند کد انتقال بسازد.'
      using errcode = '42501';
  end if;

  -- کدهای قبلی همین خودرو باطل می‌شوند تا همیشه یک کد فعال باشد.
  update public.vehicle_transfer_codes
     set consumed_at = coalesce(consumed_at, now())
   where vehicle_id  = p_vehicle_id
     and consumed_at is null;

  -- کد ۸ کاراکتری از hex (بدون کاراکتر مبهم)؛ برخورد یکتا تکرار می‌شود.
  loop
    exit when v_attempts >= 5;

    v_attempts := v_attempts + 1;

    v_code := upper(
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
    );

    begin
      insert into public.vehicle_transfer_codes
        (vehicle_id, code, created_by, expires_at)
      values
        (p_vehicle_id, v_code, v_uid, now() + interval '72 hours');

      return v_code;

    exception when unique_violation then
      v_code := null;
    end;
  end loop;

  raise exception 'خطا در ساخت کد انتقال. لطفاً دوباره تلاش کنید.'
    using errcode = '55000';
end;
$$;


-- =============================================================
-- 3) دریافت پرونده با کد انتقال
--
-- ترتیب دستورها مهم است: اول بستن مالکیت قبلی، بعد افزودن
-- مالکیت جدید، وگرنه ایندکس یکتای مالک فعال خطا می‌دهد.
-- =============================================================

create or replace function public.claim_transfer_code(
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_record public.vehicle_transfer_codes%rowtype;
begin
  if v_uid is null then
    raise exception 'ابتدا وارد حساب خود شوید.'
      using errcode = '42501';
  end if;

  select *
    into v_record
    from public.vehicle_transfer_codes
   where code        = upper(btrim(p_code))
     and consumed_at is null
     and expires_at  > now();

  if not found then
    raise exception 'کد انتقال معتبر نیست یا منقضی شده است.'
      using errcode = 'P0002';
  end if;

  if v_record.created_by = v_uid then
    raise exception 'این کد برای خود شماست؛ باید خریدار آن را وارد کند.'
      using errcode = '42501';
  end if;

  -- ۱) بستن مالکیت فعلی
  update public.vehicle_ownerships
     set end_date = current_date
   where vehicle_id = v_record.vehicle_id
     and end_date   is null;

  if not found then
    raise exception 'این خودرو مالک فعالی ندارد.'
      using errcode = 'P0002';
  end if;

  -- ۲) ثبت مالکیت جدید
  insert into public.vehicle_ownerships
    (vehicle_id, owner_id, start_date)
  values
    (v_record.vehicle_id, v_uid, current_date);

  -- ۳) مصرف شدن کد
  update public.vehicle_transfer_codes
     set consumed_at = now(),
         consumed_by = v_uid
   where id = v_record.id;

  return v_record.vehicle_id;
end;
$$;


comment on function public.create_transfer_code(uuid) is
  'ساخت کد ۷۲ ساعتهٔ انتقال پرونده؛ فقط برای مالک فعال خودرو.';

comment on function public.claim_transfer_code(text) is
  'دریافت پروندهٔ خودرو با کد انتقال؛ مالکیت قبلی بسته و مالکیت جدید ثبت می‌شود.';


-- فقط authenticated برای هر دو تابع.
revoke execute on function public.create_transfer_code(uuid)
  from public, anon;

grant execute on function public.create_transfer_code(uuid)
  to authenticated;

revoke execute on function public.claim_transfer_code(text)
  from public, anon;

grant execute on function public.claim_transfer_code(text)
  to authenticated;


-- =============================================================
-- 4) خلاصهٔ آنچه این migration انجام می‌دهد
--
--   * جدول vehicle_transfer_codes ساخته شد + 1 policy
--   * تابع create_transfer_code ایجاد شد
--   * تابع claim_transfer_code ایجاد شد
--   * هیچ policy یا دادهٔ موجودی تغییر نمی‌کند
-- =============================================================
