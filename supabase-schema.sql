create table if not exists public.hcc_site_content (
  id text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.hcc_site_content (id, content)
values (
  'main',
  '{
    "tournaments": [],
    "images": [],
    "socials": [],
    "testimonials": []
  }'::jsonb
)
on conflict (id) do nothing;

alter table public.hcc_site_content enable row level security;

drop policy if exists "service role manages hcc content" on public.hcc_site_content;
create policy "service role manages hcc content"
on public.hcc_site_content
for all
to service_role
using (true)
with check (true);

create table if not exists public.hcc_bookings (
  reference text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'declined', 'completed', 'cancelled')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  form_type text not null default 'Booking Request',
  fullname text not null default '',
  email text not null default '',
  phone text not null default '',
  booking_type text not null default '',
  booking_date text not null default '',
  booking_date_label text not null default '',
  time_slot text not null default '',
  tournament_name text not null default '',
  team_name text not null default '',
  notes text not null default '',
  admin_note text not null default ''
);

create index if not exists hcc_bookings_created_at_idx on public.hcc_bookings (created_at desc);
create index if not exists hcc_bookings_status_idx on public.hcc_bookings (status);

alter table public.hcc_bookings enable row level security;

drop policy if exists "service role manages hcc bookings" on public.hcc_bookings;
create policy "service role manages hcc bookings"
on public.hcc_bookings
for all
to service_role
using (true)
with check (true);

create table if not exists public.hcc_admin_audit (
  id text primary key,
  created_at timestamptz not null default now(),
  actor text not null default 'system',
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  ip text
);

alter table public.hcc_admin_audit enable row level security;

drop policy if exists "service role manages hcc audit" on public.hcc_admin_audit;
create policy "service role manages hcc audit"
on public.hcc_admin_audit
for all
to service_role
using (true)
with check (true);
