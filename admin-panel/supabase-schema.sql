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
