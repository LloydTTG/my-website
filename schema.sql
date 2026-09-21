-- ================================================================
-- schema.sql — run in Supabase -> SQL Editor -> New query.
--
-- Creates every table the dashboard reads, enables row level
-- security on all of them, and sets policies so that:
--   * anyone (the anon key in the browser) can SELECT, except that
--     diary_logs is filtered to rows where is_public = true;
--   * only the signed-in owner can INSERT / UPDATE / DELETE.
--
-- The service_role key is never used or referenced here, and must
-- never be put in the browser: it bypasses every policy below.
--
-- Safe to re-run — every statement is idempotent, and section 3
-- migrates a database created by the earlier version of this file.
-- ================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()


-- ================================================================
-- 1. OWNER  <<<<<<<<<<<<<<<<  EDIT THIS  >>>>>>>>>>>>>>>>
--
-- Every write policy defers to this one function, so this literal
-- is the only place the owner is configured. Replace it with your
-- own auth user id:  select id, email from auth.users;
-- ================================================================

create or replace function public.owner_id()
returns uuid
language sql
immutable
as $$
    select '843ff6ff-ea5d-4686-bd0f-2a775dc2c2b0'::uuid;
$$;


-- ================================================================
-- 2. TABLES
-- ================================================================

-- ---- profile: one row, the hero card's name / tagline / photo ---
create table if not exists profile (
    id           uuid primary key default gen_random_uuid(),
    display_name text not null,
    tagline      text,
    avatar_url   text,
    updated_at   timestamptz not null default now()
);

-- ---- academics: one row, the current score ----------------------
-- gpa / gpa_max are a generic score out of a maximum, not strictly
-- a 4.0 GPA. Set gpa_max = 100 and the dashboard renders the ring
-- as a percentage; set it to 4.0 and it renders as "3.71 / 4".
-- numeric(6,2) leaves room for 100.00, which numeric(4,2) — the
-- original type — could not hold at all (its ceiling is 99.99).
create table if not exists academics (
    id         uuid primary key default gen_random_uuid(),
    degree     text         not null,
    gpa        numeric(6,2) not null,
    gpa_max    numeric(6,2) not null default 100,
    updated_at timestamptz  not null default now(),
    constraint academics_gpa_range check (gpa >= 0 and gpa <= gpa_max)
);

-- ---- milestones: achievements listed beside the ring ------------
create table if not exists milestones (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    achieved_on date not null,
    created_at  timestamptz not null default now()
);

-- ---- body_log: one bodyweight reading per calendar day ----------
create table if not exists body_log (
    id        uuid primary key default gen_random_uuid(),
    logged_on date not null unique,
    weight_kg numeric(5,2) not null check (weight_kg > 0)
);

-- ---- lift_prs: personal records for the three main lifts --------
-- `lift` must be exactly 'squat', 'bench' or 'deadlift' — the page
-- looks rows up by that key, so any other spelling would be stored
-- happily and then silently ignored. The check catches it instead.
-- The label shown on the card is set in index.html, not here.
create table if not exists lift_prs (
    id          uuid primary key default gen_random_uuid(),
    lift        text not null check (lift in ('squat', 'bench', 'deadlift')),
    weight_kg   numeric(6,2) not null check (weight_kg > 0),
    reps        integer not null default 1 check (reps > 0),
    achieved_on date not null
);

-- ---- gallery: image tiles in the bento grid ---------------------
-- The first two published rows (by sort_order) become full tiles in
-- the top row. image_url must be a plain http(s) URL — the page
-- rejects any other scheme rather than putting it in a src.
create table if not exists gallery (
    id         uuid primary key default gen_random_uuid(),
    image_url  text not null,
    alt        text not null default '',
    caption    text,
    published  boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

-- ---- diary_logs: the public diary ------------------------------
create table if not exists diary_logs (
    id         uuid primary key default gen_random_uuid(),
    title      text not null,
    body       text not null default '',
    tags       text[] not null default '{}',
    cover_url  text,
    is_public  boolean not null default false,
    created_at timestamptz not null default now()
);


-- ================================================================
-- 3. MIGRATIONS for a database created by the earlier version.
-- `create table if not exists` above is a no-op on a table that
-- already exists, so changed columns have to be altered explicitly.
-- Each statement is harmless on a fresh install too.
-- ================================================================

-- Widen the score columns so gpa_max = 100 fits. Without this, any
-- percentage of 100 fails with a numeric field overflow.
alter table academics alter column gpa     type numeric(6,2);
alter table academics alter column gpa_max type numeric(6,2);
alter table academics alter column gpa_max set default 100;

-- Optional cover image per diary entry.
alter table diary_logs add column if not exists cover_url text;


-- ================================================================
-- 4. INDEXES
-- ================================================================

create index if not exists milestones_achieved_idx on milestones (achieved_on desc);
create index if not exists body_log_logged_idx     on body_log (logged_on);
create index if not exists lift_prs_best_idx       on lift_prs (lift, weight_kg desc);
create index if not exists gallery_order_idx       on gallery (sort_order) where published;
create index if not exists diary_logs_public_idx   on diary_logs (created_at desc) where is_public;


-- ================================================================
-- 5. GRANTS
-- Table privileges are the coarse gate; RLS below is the fine one.
-- ================================================================

grant usage on schema public to anon, authenticated;

grant select on profile, academics, milestones, body_log, lift_prs, gallery, diary_logs
    to anon, authenticated;

grant insert, update, delete on profile, academics, milestones, body_log, lift_prs, gallery, diary_logs
    to authenticated;


-- ================================================================
-- 6. ROW LEVEL SECURITY
--
-- Postgres ORs permissive policies together, so each table gets
-- two: a read policy open to everyone, and an owner policy for all
-- commands. The owner policy covering SELECT is what lets the owner
-- read unpublished drafts, while the public read policy stays
-- restricted to published rows.
-- ================================================================

alter table profile    enable row level security;
alter table academics  enable row level security;
alter table milestones enable row level security;
alter table body_log   enable row level security;
alter table lift_prs   enable row level security;
alter table gallery    enable row level security;
alter table diary_logs enable row level security;

-- ---- public reads ----------------------------------------------
drop policy if exists "Public read profile" on profile;
create policy "Public read profile" on profile for select using (true);

drop policy if exists "Public read academics" on academics;
create policy "Public read academics" on academics for select using (true);

drop policy if exists "Public read milestones" on milestones;
create policy "Public read milestones" on milestones for select using (true);

drop policy if exists "Public read body_log" on body_log;
create policy "Public read body_log" on body_log for select using (true);

drop policy if exists "Public read lift_prs" on lift_prs;
create policy "Public read lift_prs" on lift_prs for select using (true);

-- The two read policies that filter rows: unpublished never leaves the db.
drop policy if exists "Public read published gallery" on gallery;
create policy "Public read published gallery" on gallery
    for select using (published = true);

drop policy if exists "Public read published diary_logs" on diary_logs;
create policy "Public read published diary_logs" on diary_logs
    for select using (is_public = true);

-- ---- owner writes ----------------------------------------------
drop policy if exists "Owner manages profile" on profile;
create policy "Owner manages profile" on profile
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());

drop policy if exists "Owner manages academics" on academics;
create policy "Owner manages academics" on academics
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());

drop policy if exists "Owner manages milestones" on milestones;
create policy "Owner manages milestones" on milestones
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());

drop policy if exists "Owner manages body_log" on body_log;
create policy "Owner manages body_log" on body_log
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());

drop policy if exists "Owner manages lift_prs" on lift_prs;
create policy "Owner manages lift_prs" on lift_prs
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());

drop policy if exists "Owner manages gallery" on gallery;
create policy "Owner manages gallery" on gallery
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());

drop policy if exists "Owner manages diary_logs" on diary_logs;
create policy "Owner manages diary_logs" on diary_logs
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());


-- PostgREST caches the schema; this makes the new tables and
-- columns visible to the API immediately instead of after its
-- next poll. Without it, `gallery` and `profile` 404 for a while.
notify pgrst, 'reload schema';


-- ================================================================
-- 7. EXAMPLE DATA — commented out on purpose.
--
-- The dashboard ships with no sample data baked in, so an empty
-- table shows an empty state rather than something fictional.
-- Uncomment, edit, and run as a separate query.
--
-- Where to host images: Supabase Storage (Storage -> New bucket,
-- make it public, upload, then copy the public URL) works well and
-- keeps everything in one project. Any plain https URL is fine.
-- The page ignores anything that is not http(s).
-- ================================================================

-- insert into profile (display_name, tagline, avatar_url) values
--     ('Randy',
--      'Engineering student, currently lifting and shipping things in Kuala Lumpur.',
--      'https://example.com/portrait.jpg');

-- -- gpa_max = 100 renders the ring as a percentage.
-- insert into academics (degree, gpa, gpa_max) values
--     ('BEng Electrical & Electronic Engineering', 87.50, 100);

-- insert into milestones (title, achieved_on) values
--     ('Dean''s List, Year 2',            '2026-06-30'),
--     ('First-author paper accepted',     '2026-04-12'),
--     ('Finished embedded systems module','2026-01-20');

-- insert into body_log (logged_on, weight_kg) values
--     ('2026-09-15', 78.40), ('2026-09-16', 78.10),
--     ('2026-09-17', 78.60), ('2026-09-18', 77.90),
--     ('2026-09-19', 78.20), ('2026-09-20', 77.80),
--     ('2026-09-21', 77.95);

-- insert into lift_prs (lift, weight_kg, reps, achieved_on) values
--     ('squat',    140.0, 1, '2026-08-02'),
--     ('bench',    105.0, 6, '2026-09-21'),
--     ('deadlift', 180.0, 1, '2026-09-06');

-- insert into gallery (image_url, alt, caption, sort_order) values
--     ('https://example.com/bench.jpg', 'Loaded barbell on a bench press', 'Bench day', 1),
--     ('https://example.com/desk.jpg',  'Workbench with an oscilloscope',  'The bench',  2);

-- insert into diary_logs (title, body, tags, cover_url, is_public) values
--     ('On starting over',
--      E'Cleared the whole thing today.\n\nIt is easier to build the second time.',
--      array['meta', 'rebuild'],
--      'https://example.com/cover.jpg',
--      true);


-- ================================================================
-- 8. VITALS — the Vessel card's spec list (added after the first
-- version of this file; re-run the whole script to pick it up).
--
-- Deliberately generic label/value/unit rows rather than fixed
-- columns, so you can list height, blood type, shoe size or
-- anything else without another migration. `value` is text, so
-- "O+" and "178" are equally valid.
--
-- Bodyweight is NOT stored here: the Vessel card reads the latest
-- body_log row for that, so it can never disagree with the chart
-- in the Iron card. Do not add a "weight" row or it will show twice.
-- ================================================================

create table if not exists vitals (
    id         uuid primary key default gen_random_uuid(),
    label      text not null,
    value      text not null,
    unit       text,
    published  boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists vitals_order_idx on vitals (sort_order) where published;

grant select on vitals to anon, authenticated;
grant insert, update, delete on vitals to authenticated;

alter table vitals enable row level security;

drop policy if exists "Public read published vitals" on vitals;
create policy "Public read published vitals" on vitals
    for select using (published = true);

drop policy if exists "Owner manages vitals" on vitals;
create policy "Owner manages vitals" on vitals
    for all to authenticated
    using (auth.uid() = public.owner_id())
    with check (auth.uid() = public.owner_id());

notify pgrst, 'reload schema';

-- Example specs — uncomment, edit, run.
-- insert into vitals (label, value, unit, sort_order) values
--     ('Height',     '178',   'cm', 1),
--     ('Born',       '2005',  null, 2),
--     ('Blood type', 'O+',    null, 3),
--     ('Location',   'Kuala Lumpur', null, 4);
