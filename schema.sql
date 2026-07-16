-- ================================================================
-- schema.sql — run this once in Supabase → SQL Editor.
-- Creates every table the site's JS talks to, plus row-level
-- security so the anon key can only do what the UI is meant to do:
-- read published content, submit an enquiry, and (if signed in as
-- an admin) edit/create/delete everything.
-- ================================================================

create extension if not exists pgcrypto;

-- ---- site_content: generic key/value store for editable text ----
create table if not exists site_content (
    key        text primary key,
    value      text not null,
    updated_at timestamptz not null default now()
);

-- ---- projects ----
create table if not exists projects (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    tag         text,
    description text not null,
    scope       text,
    year        text,
    image_url   text,
    link        text,
    published   boolean not null default true,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

-- ---- testimonials ----
create table if not exists testimonials (
    id         uuid primary key default gen_random_uuid(),
    quote      text not null,
    author     text not null,
    role       text,
    published  boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

-- ---- inquiries: contact form submissions ----
create table if not exists inquiries (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    email      text not null,
    service    text,
    message    text not null,
    created_at timestamptz not null default now()
);

-- ---- admins: allow-list of auth user ids who can edit content ----
create table if not exists admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---- globe_markers: pinned points of interest on the 3D globe ----
-- `body` holds admin-authored HTML (rich text + images from the location
-- editor's toolbar), same trust model as site_content.value — only admins
-- (checked via RLS below) can ever write it.
create table if not exists globe_markers (
    id         uuid primary key default gen_random_uuid(),
    lat        double precision not null,
    lon        double precision not null,
    title      text not null default 'New location',
    eyebrow    text not null default 'A point of interest',
    body       text not null default '',
    created_at timestamptz not null default now()
);

-- Migration for installs that already ran the old body_1/body_2/body_3
-- version of this table — merges them into one field and drops them.
-- Safe to run again (each statement is a no-op once already applied).
do $$
begin
    if exists (select 1 from information_schema.columns where table_name = 'globe_markers' and column_name = 'body_1') then
        update globe_markers set body = trim(both e'\n' from
            concat_ws(e'\n\n', nullif(body_1, ''), nullif(body_2, ''), nullif(body_3, '')))
            where coalesce(body, '') = '';
        alter table globe_markers drop column body_1;
        alter table globe_markers drop column body_2;
        alter table globe_markers drop column body_3;
    end if;
end $$;

-- ================================================================
-- Row Level Security
-- ================================================================

alter table site_content  enable row level security;
alter table projects      enable row level security;
alter table testimonials  enable row level security;
alter table inquiries     enable row level security;
alter table admins        enable row level security;
alter table globe_markers enable row level security;

-- Public (anon key) can read site content and published cards.
create policy "Public read site_content"        on site_content for select using (true);
create policy "Public read published projects"   on projects     for select using (published = true);
create policy "Public read published testimonials" on testimonials for select using (published = true);
create policy "Public read globe_markers"       on globe_markers for select using (true);

-- Public can submit an enquiry, but not read/edit others' enquiries.
create policy "Public insert inquiries" on inquiries for insert with check (true);

-- Signed-in admins (checked against the admins table) can do anything.
create policy "Admins manage site_content" on site_content for all
    using (exists (select 1 from admins where user_id = auth.uid()))
    with check (exists (select 1 from admins where user_id = auth.uid()));

create policy "Admins manage projects" on projects for all
    using (exists (select 1 from admins where user_id = auth.uid()))
    with check (exists (select 1 from admins where user_id = auth.uid()));

create policy "Admins manage testimonials" on testimonials for all
    using (exists (select 1 from admins where user_id = auth.uid()))
    with check (exists (select 1 from admins where user_id = auth.uid()));

create policy "Admins read inquiries" on inquiries for select
    using (exists (select 1 from admins where user_id = auth.uid()));

create policy "Admins manage globe_markers" on globe_markers for all
    using (exists (select 1 from admins where user_id = auth.uid()))
    with check (exists (select 1 from admins where user_id = auth.uid()));

-- A user needs to read their own row so admin.js's checkAdmin() works.
create policy "Admins read own row" on admins for select
    using (user_id = auth.uid());
