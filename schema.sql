-- ================================================================
-- Meridian Studio — Supabase schema
-- Run this in the SQL Editor of your Supabase project.
--
-- After running:
--   1. Create your admin user: Authentication → Users → Add user
--   2. Copy their UUID and run:
--        insert into public.admins (user_id) values ('THE-UUID-HERE');
--   3. Put your project URL + anon key in supabase-client.js
-- ================================================================

-- ---------- Admins ----------
create table if not exists public.admins (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Admins can see the admins list (needed for the client-side check)
create policy "Admins can read admins"
    on public.admins for select
    to authenticated
    using (user_id = auth.uid());

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.admins where user_id = auth.uid()
    );
$$;

-- ---------- Editable site content ----------
create table if not exists public.site_content (
    key text primary key,
    value text not null default '',
    updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

create policy "Anyone can read site content"
    on public.site_content for select
    using (true);

create policy "Admins can insert site content"
    on public.site_content for insert
    to authenticated
    with check (public.is_admin());

create policy "Admins can update site content"
    on public.site_content for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ---------- Projects ----------
create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    tag text not null default '',
    description text not null default '',
    scope text not null default '',
    year text not null default '',
    image_url text not null default '',
    link text not null default '',
    published boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Anyone can read published projects"
    on public.projects for select
    using (published = true or public.is_admin());

create policy "Admins can insert projects"
    on public.projects for insert
    to authenticated
    with check (public.is_admin());

create policy "Admins can update projects"
    on public.projects for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Admins can delete projects"
    on public.projects for delete
    to authenticated
    using (public.is_admin());

-- ---------- Testimonials ----------
create table if not exists public.testimonials (
    id uuid primary key default gen_random_uuid(),
    quote text not null,
    author text not null,
    role text not null default '',
    published boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.testimonials enable row level security;

create policy "Anyone can read published testimonials"
    on public.testimonials for select
    using (published = true or public.is_admin());

create policy "Admins can insert testimonials"
    on public.testimonials for insert
    to authenticated
    with check (public.is_admin());

create policy "Admins can update testimonials"
    on public.testimonials for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Admins can delete testimonials"
    on public.testimonials for delete
    to authenticated
    using (public.is_admin());

-- ---------- Enquiries (contact form) ----------
create table if not exists public.inquiries (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    service text not null default '',
    message text not null,
    handled boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.inquiries enable row level security;

-- Anyone (including anonymous visitors) may submit an enquiry…
create policy "Anyone can submit an enquiry"
    on public.inquiries for insert
    with check (true);

-- …but only admins can read or manage them.
create policy "Admins can read enquiries"
    on public.inquiries for select
    to authenticated
    using (public.is_admin());

create policy "Admins can update enquiries"
    on public.inquiries for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Admins can delete enquiries"
    on public.inquiries for delete
    to authenticated
    using (public.is_admin());

-- ---------- Seed data (optional — delete if not wanted) ----------
insert into public.projects (title, tag, description, scope, year, sort_order) values
    ('Harbourline Legal', 'Web design & build', 'Full redesign and CMS build for a three-partner law firm. Enquiries up 60% in the first quarter after launch.', 'Design · Build · SEO', '2026', 1),
    ('Kiln & Co. Ceramics', 'E-commerce', 'Storefront with inventory sync and a custom order pipeline for a small-batch ceramics studio.', 'Build · Payments', '2025', 2),
    ('A-Level CS cohort', 'Tutoring', 'Twelve-week structured programme for eight students. Every one of them beat their predicted grade.', 'Curriculum · 1-on-1', '2025', 3),
    ('Rosterly', 'Web app', 'Shift-scheduling tool for a 40-person café group — built, deployed, and handed over in six weeks.', 'Design · Build · Auth', '2025', 4),
    ('Invoice pipeline', 'Automation', 'Replaced a 6-hour weekly manual process with a fully automated invoicing and reconciliation flow.', 'Scripting · Integration', '2024', 5),
    ('Fieldnote Films', 'Web design', 'Portfolio site for a documentary studio — fast, quiet design that puts the work first.', 'Design · Build', '2024', 6)
on conflict do nothing;

insert into public.testimonials (quote, author, role, sort_order) values
    ('The scope document alone was worth the fee. Everything landed exactly when the timeline said it would — I have never had that from a contractor before.', 'Sarah Lim', 'Partner, Harbourline Legal', 1),
    ('My son went from dreading computer science to teaching his friends. The weekly progress notes meant we always knew exactly where he stood.', 'Devi Nair', 'Parent, A-Level tutoring', 2),
    ('We handed over a mess of spreadsheets and got back a system that just works. Six hours of admin a week, gone.', 'Marcus Chen', 'Director, Brewline Group', 3),
    ('Fast, honest, and completely unflappable. When the payment provider changed their API a week before launch, it was handled before we even noticed.', 'Amira Hassan', 'Founder, Kiln & Co.', 4)
on conflict do nothing;
