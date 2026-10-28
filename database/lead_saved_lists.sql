create table if not exists public.lead_saved_lists(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name)) between 2 and 100),
 lead_ids uuid[] not null default '{}'::uuid[],
 city text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(cardinality(lead_ids)<=2000)
);
create index if not exists lead_saved_lists_owner_updated on public.lead_saved_lists(owner_id,updated_at desc);
alter table public.lead_saved_lists enable row level security;
revoke all on public.lead_saved_lists from public,anon;
grant select,insert,update,delete on public.lead_saved_lists to authenticated;
drop policy if exists lead_saved_lists_owned on public.lead_saved_lists;
create policy lead_saved_lists_owned on public.lead_saved_lists for all to authenticated
 using (owner_id=auth.uid()) with check (owner_id=auth.uid());
