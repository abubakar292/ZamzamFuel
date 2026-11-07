export const SUPABASE_SETUP_SQL = `-- ============================================================================
-- ZAMZAM FUEL STATION — SUPABASE POSTGRESQL SCHEMA, RLS & FUNCTIONS
-- Run this script once in your Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Core Multi-Tenant Records Table (isolated by company_id = auth.uid())
create table if not exists public.fuel_station_records (
  company_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection_name text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  is_cancelled boolean not null default false,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, collection_name, doc_id)
);

create index if not exists idx_fuel_station_records_company_col
  on public.fuel_station_records (company_id, collection_name);

-- 2. Auto-update updated_at timestamp trigger
create or replace function public.set_fuel_station_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fuel_station_records_updated_at on public.fuel_station_records;
create trigger trg_fuel_station_records_updated_at
  before update on public.fuel_station_records
  for each row
  execute function public.set_fuel_station_updated_at();

-- 3. Atomic Invoice Number Generator Function (Concurrency-Safe per company_id)
create or replace function public.next_fuel_invoice_number()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := auth.uid();
  v_next integer;
begin
  if v_company_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.fuel_station_records (company_id, collection_name, doc_id, data)
  values (
    v_company_id,
    'appSettings',
    'counters',
    jsonb_build_object('lastInvoiceNumber', 1)
  )
  on conflict (company_id, collection_name, doc_id)
  do update set
    data = jsonb_set(
      coalesce(public.fuel_station_records.data, '{}'::jsonb),
      '{lastInvoiceNumber}',
      to_jsonb(coalesce((public.fuel_station_records.data->>'lastInvoiceNumber')::integer, 0) + 1)
    ),
    updated_at = now()
  returning (data->>'lastInvoiceNumber')::integer into v_next;

  return v_next;
end;
$$;

-- 4. Server-Side Vendor Ledger (Qarz) Recalculation Function in Postgres (Numeric precision)
create or replace function public.recalculate_company_vendor_ledgers()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := auth.uid();
  v_vendor record;
  v_purchase record;
  v_total_purchases numeric(18,2);
  v_total_paid_purchases numeric(18,2);
  v_total_payments numeric(18,2);
  v_p_total numeric(18,2);
  v_p_paid numeric(18,2);
  v_p_rem numeric(18,2);
  v_vendor_name text;
begin
  if v_company_id is null then
    return;
  end if;

  for v_vendor in
    select doc_id, data
    from public.fuel_station_records
    where company_id = v_company_id
      and collection_name = 'vendors'
      and is_cancelled = false
  loop
    v_total_purchases := 0;
    v_total_paid_purchases := 0;
    v_vendor_name := lower(trim(coalesce(v_vendor.data->>'name', '')));

    for v_purchase in
      select data
      from public.fuel_station_records
      where company_id = v_company_id
        and collection_name = 'purchases'
        and is_cancelled = false
        and (
          (data->>'vendorId') = v_vendor.doc_id
          or (v_vendor_name <> '' and lower(trim(coalesce(data->>'vendorName', ''))) = v_vendor_name)
        )
    loop
      v_p_total := coalesce(nullif(v_purchase.data->>'total', '')::numeric, nullif(v_purchase.data->>'netSubtotal', '')::numeric, 0);
      v_total_purchases := v_total_purchases + v_p_total;

      if coalesce(v_purchase.data->>'paymentType', 'Cash') = 'Cash' then
        if v_purchase.data->>'amountPaid' is null or v_purchase.data->>'amountPaid' = '' then
          v_p_paid := v_p_total;
        else
          v_p_paid := coalesce((v_purchase.data->>'amountPaid')::numeric, v_p_total);
        end if;
      else
        if v_purchase.data->>'remainingBalance' is not null and v_purchase.data->>'remainingBalance' <> '' then
          v_p_rem := coalesce((v_purchase.data->>'remainingBalance')::numeric, 0);
          if v_p_rem > 0 then
            v_p_paid := greatest(0, v_p_total - v_p_rem);
          else
            v_p_paid := coalesce(nullif(v_purchase.data->>'amountPaid', '')::numeric, 0);
            if v_p_paid >= v_p_total then
              v_p_paid := 0;
            end if;
          end if;
        else
          v_p_paid := coalesce(nullif(v_purchase.data->>'amountPaid', '')::numeric, 0);
          if v_p_paid >= v_p_total then
            v_p_paid := 0;
          end if;
        end if;
      end if;

      v_total_paid_purchases := v_total_paid_purchases + v_p_paid;
    end loop;

    select coalesce(sum(coalesce(nullif(data->>'amount', '')::numeric, 0)), 0)
    into v_total_payments
    from public.fuel_station_records
    where company_id = v_company_id
      and collection_name = 'vendorPayments'
      and is_cancelled = false
      and (
        (data->>'vendorId') = v_vendor.doc_id
        or (v_vendor_name <> '' and lower(trim(coalesce(data->>'vendorName', ''))) = v_vendor_name)
      );

    update public.fuel_station_records
    set data = jsonb_set(
      jsonb_set(
        jsonb_set(
          data,
          '{totalPurchases}',
          to_jsonb(round(v_total_purchases, 2))
        ),
        '{totalPaid}',
        to_jsonb(round(v_total_paid_purchases + v_total_payments, 2))
      ),
      '{vendorQarz}',
      to_jsonb(greatest(0, round(v_total_purchases - (v_total_paid_purchases + v_total_payments), 2)))
    )
    where company_id = v_company_id
      and collection_name = 'vendors'
      and doc_id = v_vendor.doc_id;
  end loop;
end;
$$;

-- 5. Enable Row Level Security (RLS) for strict company isolation
alter table public.fuel_station_records enable row level security;

drop policy if exists "Company isolation select" on public.fuel_station_records;
create policy "Company isolation select"
  on public.fuel_station_records
  for select
  to authenticated
  using (company_id = auth.uid());

drop policy if exists "Company isolation insert" on public.fuel_station_records;
create policy "Company isolation insert"
  on public.fuel_station_records
  for insert
  to authenticated
  with check (company_id = auth.uid());

drop policy if exists "Company isolation update" on public.fuel_station_records;
create policy "Company isolation update"
  on public.fuel_station_records
  for update
  to authenticated
  using (company_id = auth.uid())
  with check (company_id = auth.uid());

drop policy if exists "Company isolation delete" on public.fuel_station_records;
create policy "Company isolation delete"
  on public.fuel_station_records
  for delete
  to authenticated
  using (company_id = auth.uid());

-- 6. Enable Realtime on public.fuel_station_records
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fuel_station_records'
  ) then
    alter publication supabase_realtime add table public.fuel_station_records;
  end if;
exception
  when others then null;
end $$;
`;
