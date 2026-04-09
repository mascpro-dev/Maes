-- =============================================================================
-- Aura — Programa de indicação (comissão + cashback)
-- =============================================================================

create table if not exists public.partner_program_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  referral_code text not null unique,
  referral_base_url text not null default '',
  commission_pending_cents bigint not null default 0,
  cashback_pending_cents bigint not null default 0,
  total_released_cents bigint not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint partner_program_commission_nonneg check (commission_pending_cents >= 0),
  constraint partner_program_cashback_nonneg check (cashback_pending_cents >= 0),
  constraint partner_program_released_nonneg check (total_released_cents >= 0)
);

create index if not exists partner_program_referral_code_idx
  on public.partner_program_accounts (referral_code);

create or replace function public.set_partner_program_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists partner_program_accounts_set_updated_at on public.partner_program_accounts;
create trigger partner_program_accounts_set_updated_at
  before update on public.partner_program_accounts
  for each row
  execute function public.set_partner_program_updated_at();

alter table public.partner_program_accounts enable row level security;

drop policy if exists "partner_program_select_own" on public.partner_program_accounts;
create policy "partner_program_select_own"
  on public.partner_program_accounts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "partner_program_insert_own" on public.partner_program_accounts;
create policy "partner_program_insert_own"
  on public.partner_program_accounts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "partner_program_update_own" on public.partner_program_accounts;
create policy "partner_program_update_own"
  on public.partner_program_accounts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "partner_program_delete_own" on public.partner_program_accounts;
create policy "partner_program_delete_own"
  on public.partner_program_accounts for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.partner_program_accounts is
  'Conta do programa de indicação de cada utilizadora (comissões e cashback).';
