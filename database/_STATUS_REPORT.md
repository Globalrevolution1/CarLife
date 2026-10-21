# Karnegar — Status Report (2026-10-21)

## 1. Executive Summary

| Metric | Value |
|---|---|
| Project | Karnegar (formerly CarLife) |
| MVP (PRD sections 2 + 5 + 6 + 9) | Frontend 100% written — **DB migrations 013–019 applied & E2E verified** |
| Overall Progress | ~95% of PRD scope |
| Database | Supabase (PostgreSQL) — live, RLS verified by E2E probe |
| Auth | Supabase Auth (email/password) |
| Frontend | React 19 + Vite 8 + React Router 7 |
| CSS | Plain CSS per-page files |
| Quality gates | `npm run verify` → lint 0 errors, **108 tests pass**, production build OK (90 modules) |

**No blocker.** Migrations `013`–`019` were executed on the live database and
verified by query. The live database is back to its clean baseline (no test data
left — only the real client account).

---

## 2. Pages Inventory

| File | Route | Status |
|---|---|---|
| `Login.jsx` | `/` | ✅ signInWithPassword → `/dashboard` |
| `OwnerRegister.jsx` | `/owner-register` | ✅ signUp with full_name, mobile, email, role |
| `OwnerDashboard.jsx` | `/dashboard` | ✅ Protected — vehicle cards + health + 3 actions |
| `CarRegister.jsx` | `/car-register` | ✅ Protected — RPC `register_vehicle` |
| `CarProfile.jsx` | `/car-profile/:id` | ✅ Protected — health + templates + history + **transfer block** |
| `CarEdit.jsx` | `/car-edit/:id` | ✅ Protected — **monotonic mileage rule verified E2E** |
| `AddService.jsx` | `/add-service/:id` | ✅ Protected — **date + cost + service center** |
| `CenterRegister.jsx` | `/center-register` | ✅ Protected — register / already-registered state |
| `CenterPanel.jsx` | `/center-panel` | ✅ Protected — list + `verify_service` RPC |
| `TransferClaim.jsx` | `/transfer` | ✅ Protected — **E2E verified (claim + one-time code + old owner locked out)** |
| `VehicleReport.jsx` | `/report/:id` | ✅ Protected — printable report (vehicle, health, plan, reminders, history) |

Shared: `components/AppHeader.jsx` (logout on every protected page),
`components/ProtectedRoute.jsx` (unauthenticated → `/`),
`lib/errorMessage.js` (PostgREST messages → Persian).

**Removed (2026-10-19):** `/test` route; dead files `Dashboard.jsx`,
`ServiceRegister.jsx`, `SupabaseTest.jsx`, `styles/CarRegister.css`,
`App.css` (stale copy never imported).

---

## 3. Database Schema (Live)

### Tables (8)

| Table | RLS | Policies (live, probed 2026-10-18) | Notes |
|---|---|---|---|
| `profiles` | ✅ | select, update own | trigger → `auth.users` |
| `vehicles` | ✅ | select/insert/update, owner-scoped, `end_date is null` | hardening from 012 applied |
| `vehicle_ownerships` | ✅ | insert, select own | partial unique index `vehicle_ownerships_one_active_owner` |
| `services` | ✅ | SELECT (owner + **center**), INSERT owner-scoped | **no UPDATE policy — intentional** (status via `verify_service`) |
| `service_items` | ❌ | none | not used by frontend |
| `service_templates` | ✅ | 1 hand-made | readable by anon ⚠️ |
| `service_centers` | ✅ | **4 (013)** — select-all-auth, insert/update/delete own | registered + E2E tested |
| `vehicle_transfer_codes` | ✅ | **1 (014)** — select own only; writes only via RPC | RLS on, client writes revoked |
| `vehicle_services` | ❌ | none | dead table |

**Live probe results (2026-10-19):** **17 policies** total,
`register_vehicle` + `verify_service` + `create_transfer_code` + `claim_transfer_code`
present, FK `services_service_center_id_fkey` exists.

**Applied on 2026-10-19:**

- `013` → policies 11 → 16, `verify_service` present, FK present, centers `0` rows
- `014` → policies 16 → 17, both transfer functions present, table + RLS + SELECT-own
  policy, `authenticated` has `SELECT=1 / INSERT=0` (writes only through RPC)

---

## 4. Security Audit

### Resolved by `012_security_hardening.sql` ✅ (applied)

| Old issue | Evidence it is fixed |
|---|---|
| vehicles INSERT open to anon | E2E dashboard isolation probe: only own rows returned |
| services had no policy | services registered + read through RLS in E2E run |
| ownership read policy missing `end_date` check | 012 policies filter `vo.end_date is null` |
| no UPDATE policy on vehicles | vehicle edit persisted (colour + mileage) in E2E |
| unauthenticated `/test` debug page | route deleted, wildcard → Login |

### Resolved by `013_service_center_section.sql` ✅ (applied 2026-10-19)

| Issue | Evidence it is fixed |
|---|---|
| `service_centers` had RLS but **zero policies** → table invisible to the Data API | 4 policies live; center registration + listing E2E-passed |
| `services` had no center read path → center panel would be empty | policy `Centers can view services linked to them` live; panel showed `(1)` |
| no FK on `services.service_center_id` (any uuid accepted) | `services_service_center_id_fkey` exists |
| status could be self-verified by anyone | no UPDATE policy on `services`; only `verify_service` (SECURITY DEFINER) flips it — E2E |

### Resolved by `014_ownership_transfer.sql` ✅ (applied 2026-10-19)

| Issue | Evidence it is fixed |
|---|---|
| no way to hand over the health record on sale | `create_transfer_code` → `9ABEE645`; claim in a 2nd account → full profile (3 services, 100%) |
| old owner could keep access after selling | dashboard of old owner showed **«هنوز خودرویی ثبت نشده است»** (RLS `end_date is null`) |
| code reuse risk | re-entering the consumed code → «کد انتقال معتبر نیست یا منقضی شده است.» |
| client could forge ownership rows | `vehicle_transfer_codes` client writes revoked; both fns `SECURITY DEFINER` + `grant execute to authenticated` only |

### Remaining

| Sev | Issue | Fix |
|---|---|---|
| 🟡 | `service_templates` readable by anon | scope to `authenticated` |
| 🟡 | `service_items`, `vehicle_services` dead tables | drop or park in archive |
| 🟢 | Supabase Data API grant changes (deadline was 2026-10-30) | 012 contains grants — confirm applied |

---

## 5. Migration Inventory (19 files)

| # | File | Status |
|---|---|---|
| 001–011 | baseline | ✅ Applied |
| 012 | `security_hardening.sql` | ✅ **Applied** (11 policies + `register_vehicle`) |
| 013 | `service_center_section.sql` | ✅ **Applied 2026-10-19** — 4 `service_centers` policies, center SELECT on `services`, `verify_service`, FK |
| 014 | `ownership_transfer.sql` | ✅ **Applied 2026-10-19** — `vehicle_transfer_codes`, `create_transfer_code`, `claim_transfer_code` |
| 015 | `invoice_image.sql` | ✅ **Applied 2026-10-19** — `services.image` + private bucket + `_owns_active_vehicle_folder` + 3 storage policies |
| 016 | `service_templates_coverage.sql` | ✅ **Applied 2026-10-19** — universal (`brand=''`) rows + model rows for high-volume cars |
| 017 | `market_service_templates.sql` | ✅ **Applied 2026-10-20** — 3-layer coverage of the whole market (38 brands × 12 services + timing belts) |
| 018 | `fix_lexus_gear_oil_interval.sql` | ✅ **Applied 2026-10-21** — `لکسوس/ls460L` gear-oil interval 5,000 → 60,000 km (owner-confirmed; the 5,000 seeded by 011 was a data-entry artefact) |
| 019 | `interval_months.sql` | ✅ **Applied 2026-10-21** — `service_templates.interval_months` (time-based health); 6–60 months per service, 579/579 rows populated |

`_cleanup_e2e_test_data.sql` — ✅ **Executed 2026-10-19**; post-state verified:
`vehicles=2, ownerships=2, services=4, profiles=1, users=1, centers=0, codes=0, leftover=0`.

### Actual post-013 verification

- policy count **11 → 16** ✅
- `verify_service` in `pg_proc` = 1 ✅
- FK `services_service_center_id_fkey` = 1 ✅

### Actual post-014 verification

- `create_transfer_code` + `claim_transfer_code` = 2 ✅
- `vehicle_transfer_codes` exists, `relrowsecurity = true`, policies = 1 ✅
- `authenticated`: `SELECT` grant = 1, `INSERT` grant = 0 ✅

### Actual post-015 verification

- `services.image` column = 1, bucket `invoice-images` exists and is **private**
- helper `_owns_active_vehicle_folder` = 1, storage policies = 3
- pre-existing public policies untouched = 17 ✅

### Actual post-016 / post-017 verification

- `service_templates` **48 → 579 rows**
- universal (`brand=''`) = **12**, brand-level = **456**, model-level = **111**
- distinct brands = **38**, distinct `(brand, model)` pairs = **103**
- E2E through the app's own Supabase client + engine:
  `کیا/سلتوس`, `هاوال/H6`, `بی وای دی/سونگ`, `مرسدس بنز/C200`
  each resolve to **12 services, 0 duplicates** (previously: 4 universal rows only)
  — `پژو/206 تیپ 2` → 13 (its dedicated timing-belt row on top of the brand plan)
  — unknown brand → still falls back to the 12 universal rows

### Actual post-018 verification (2026-10-21)

- `لکسوس/ls460L` model rows = 3: `تعویض روغن` 10,000 · `تعویض فیلتر هوا`
  20,000 · `تعویض روغن گیربکس` **60,000**
- engine output for that vehicle: **12 services, 0 duplicates**
  (was 14 rows with 2 duplicates before the `SERVICE_TITLE_ALIASES` fix)
- full live-DB re-check after the fix: `لکسوس/ls460L`, `بنز/E350`,
  `کیا/سلتوس` and an unknown brand all resolve to **12 services, 0 duplicates**
- E2E test account created and **fully purged** the same day; live DB back to
  `users=1, vehicles=2, ownerships=2, services=4, profiles=1, templates=579`

---

### Actual post-019 verification (2026-10-21)

- `service_templates.interval_months` exists; **579/579 rows populated, 0 null**
- per-service months: روغن موتور/فیلتر روغن **6** · فیلتر هوا/کابین **12** ·
  روغن گیربکس، روغن ترمز، ضد یخ، فیلتر بنزین، لنت‌ها **24** · شمع **30** ·
  باتری **36** · تسمه تایم، تعویض لاستیک **60**
- legacy names from 011 (`تعویض روغن`, `تعویض روغن گیربکس`, `تعویض فیلتر هوا`)
  mapped too, so dedicated Lexus rows get a time basis as well
- constraint `service_templates_interval_months_positive` (NULL or > 0)

---

## 6. Health Engine (`vehicleHealthEngine.js`)

Pure functions, unit-tested (108 tests in `vehicleHealthEngine.test.js`):
`normalizeServiceTitle`, `serviceTitleMatches`, `getLastServiceForTemplate`,
`getNextDueMileage`, `getTemplateStatus`, `filterTemplatesForVehicle`,
`getOverallHealth`, `getUpcomingServices`, **`getDueServices`**,
`addMonths`, `getLatestService`,
`resolveNextVehicleMileage` (regression-safe — mileage never decreases).

Internal helpers: `normalizeLabel`, `dedupeByServiceName`,
`mergeUniversalTemplates`, **`dedupePreferExactModel`** (added with 017 —
when one service exists both as a brand-level row and an exact-model row,
the exact-model row wins, so it is neither offered twice in the
"add service" form nor scored twice in health),
**`SERVICE_TITLE_ALIASES`** (added 2026-10-21 — folds legacy «تعویض …»
titles onto the canonical catalog names, e.g. «تعویض روغن گیربکس» ≡
«روغن گیربکس», «تعویض فیلتر هوا» ≡ «فیلتر هوا»). Without that map any
vehicle carrying pre-017 history — the Lexus ls460L baseline seeded by
migration 011 — rendered the same service twice and scored it twice
(14 rows with 2 duplicates → now 12 rows, 0 duplicates).

### Two bases: km **and** months (added 2026-10-21, migration 019)

Every template may carry one or both of `interval_km` / `interval_months`;
**whichever comes first decides the status.**

- `evaluateByKm` — unchanged legacy rule: last service mileage + `interval_km` vs odometer
- `evaluateByTime` — last service **date** (`service_date`, falling back to
  `created_at`) + `interval_months` vs `currentDate`
- `mergeEvaluations` picks the worse of the two (`danger > warning > good`)
- `NEAR_DUE_THRESHOLD_DAYS = 30` (km keeps `NEAR_DUE_THRESHOLD_KM = 1000`)
- `addMonths` is **UTC-based on purpose**: `service_date` arrives as an ISO
  string parsed as UTC, so local-time month arithmetic would shift the day
  count by one in UTC+3:30 (Iran). Tests pin this with `Date.UTC`.

Backward compatibility: `currentDate` defaults to `null`, so any call that
does not pass it — and any template with `interval_months IS NULL` — takes
exactly the old km-only path.

### Template matching (3 layers, `service_templates`)

| Layer | `brand` | `model` | Means |
|---|---|---|---|
| 1 universal | `''` | `''` | for every vehicle |
| 2 brand | set | `''` | any model of that brand |
| 3 model | set | set | only that exact vehicle |

`filterTemplatesForVehicle` falls back from layer 3 → 2 → 1, so **every brand
listed in the table yields a full 12-service plan even for an unlisted model**.

### Known limitations

- A vehicle with **no service history** stays `unknown` on the time basis too —
  without a last-service date there is no reference point, and by design
  «never serviced» is not scored as overdue
- A brand **not** in the table still resolves only to the 12 universal rows
- `getOverallHealth` averages templates without importance weighting
- Timing-belt rows exist only for engines that really have a belt
  (XU7/TU5/EF7/M13/M15); chain engines are deliberately left without a row

---

## 7. Known Issues / Debt

1. **No offline support** — PWA manifest added, service worker deliberately skipped (cache/HMR risk in dev)
2. **Large page components** — `CarProfile` / `AddService` could be split
3. **Reminders are in-app only** — the overdue/near-due list shows on the
   dashboard and inside each vehicle file, but nothing reaches the user when
   they are not in the app (no push, no email, no service worker yet)
4. **`service_templates` policy is `to public`** — anon can read the reference
   table. Harmless (no private data) but could be tightened to `authenticated`
5. **Dead tables** — `service_items` / `vehicle_services` are unused leftovers
   and could be dropped once confirmed to hold no valuable data

**Cleared on 2026-10-19:** all 24 `console.log` debug statements removed;
test data purged from the live database; 5 dead files deleted
(`Dashboard.jsx`, `ServiceRegister.jsx`, `SupabaseTest.jsx`,
`styles/CarRegister.css`, `App.css`).

**Cleared on 2026-10-20:** invoice image upload implemented and E2E verified
(015); `service_templates` coverage gaps closed for the whole market (017).

**Cleared on 2026-10-21:** legacy «تعویض …» titles no longer duplicate a
service — folded onto the canonical catalog names by
`SERVICE_TITLE_ALIASES` in the health engine; the wrong 5,000 km gear-oil
interval on `لکسوس/ls460L` corrected to 60,000 km (018).

**Cleared on 2026-10-21 (second pass):** health now scores **time as well as
distance** (migration 019 + `interval_months` on all 579 template rows), so a
low-mileage car no longer reports «سالم» forever; overdue / near-due services
are surfaced as **reminders** on the dashboard and inside each vehicle file;
and a **printable vehicle report** exists at `/report/:id` (PRD ۵ + ۷).

---

## 8. Roadmap Alignment (PRD)

| PRD section | Status | Blocking |
|---|---|---|
| ۵ ثبت سرویس (تاریخ + هزینه) | ✅ Done & E2E verified | — |
| ۶ مرکز خدمات (ثبت → تأیید) | ✅ Done & E2E verified 2026-10-19 | — |
| ۲ انتقال مالکیت | ✅ Done & E2E verified 2026-10-19 | — |
| ۹ PWA | ✅ manifest + RTL + meta | service worker deferred |
| حساب/خودرو/سلامت | ✅ verified E2E | — |
| تصویر فاکتور (Storage) | ✅ Done & E2E verified 2026-10-19 | — |
| سلامت مبتنی بر زمان (ماه) | ✅ Built 2026-10-21 | migration 019 + two-basis engine; DB verified |
| یادآوری‌ها / اعلان (PRD ۵) | ✅ Built 2026-10-21 — **visual E2E pending** | engine unit-tested, DB verified; needs a logged-in session to eyeball |
| خروجی گزارش خودرو (PRD ۷) | ✅ Built 2026-10-21 — **visual E2E pending** | `/report/:id` + `window.print()`/PDF; route registration verified |

---

## 9. Immediate Actions

**Done on 2026-10-19** ✅ — items 1–7 of the previous list (013, 014, center chain
E2E, transfer chain E2E, data cleanup, debug `console.log` removal).

**Next (owner decisions):**

1. Delete the 3 zero-byte files + `SupabaseTest.jsx` (tracked in git)
2. Decide on PRD gaps: invoice image (Storage bucket + policy), `service_templates`
   coverage for more brand/model combos
3. Optional hardening: scope `service_templates` SELECT to `authenticated`,
   drop the dead tables `service_items` / `vehicle_services`
4. Review `KARNEGAR_MASTER_CONTEXT.md` against the current reality
5. Commit the working tree (currently all changes uncommitted)

---

## 10. Supabase Project Reference

- Project ref: `ezcdjwthdptfnyialjpw`
- URL: `https://ezcdjwthdptfnyialjpw.supabase.co`
- SQL Editor: `https://supabase.com/dashboard/project/ezcdjwthdptfnyialjpw/sql/new`
- Anon key: in `app/.env` (`VITE_SUPABASE_ANON_KEY`) — public by design, bundled to client
- Git repo: `https://github.com/Globalrevolution1/CarLife`

---

*Report generated: 2026-10-05 — **last updated: 2026-10-21***
*Updated after: migrations 013–019 applied, full E2E pass (auth, vehicle registration, service registration with date + cost, health score, RLS isolation, logout, protected routes, vehicle edit, PWA, service-center verification chain, ownership transfer chain), live-DB test-data cleanup, the `SERVICE_TITLE_ALIASES` duplicate fix, time-based health (`interval_months`), service reminders, and the printable vehicle report.*
