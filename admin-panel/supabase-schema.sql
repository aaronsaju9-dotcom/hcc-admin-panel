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
