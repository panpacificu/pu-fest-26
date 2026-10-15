-- PU FEST 2026 TICKETING SYSTEM
-- Version 1.5.0 — Fresh Database Setup

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.staff_role as enum ('admin','finance','event_admin','scanner','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum ('unused','used','void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_status as enum ('active','void','cancelled');
exception when duplicate_object then null; end $$;

create sequence if not exists public.puf26_transaction_seq start 1;
create sequence if not exists public.puf26_ticket_seq start 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.staff_role not null default 'scanner',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  venue text not null,
  ticket_price numeric(10,2) not null,
  max_tickets_per_transaction integer not null default 50 check (max_tickets_per_transaction between 1 and 50),
  sales_open boolean not null default true,
  checkin_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  transaction_number text unique not null,
  student_number text not null,
  campus text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  email text not null,
  course text not null,
  year_level text not null,
  section text not null,
  ticket_quantity integer not null check (ticket_quantity > 0),
  ticket_price numeric(10,2) not null,
  expected_total numeric(10,2) not null,
  amount_paid numeric(10,2) not null,
  or_number text,
  receipt_path text,
  payment_date date not null,
  payment_method text not null,
  notes text,
  status public.registration_status not null default 'active',
  email_status text not null default 'pending',
  email_sent_at timestamptz,
  email_error text,
  sheet_sync_status text not null default 'pending',
  sheet_synced_at timestamptz,
  sheet_sync_error text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  ticket_number text unique not null,
  holder_name text not null,
  token_hash text unique not null,
  status public.ticket_status not null default 'unused',
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  checked_in_gate text,
  created_at timestamptz not null default now()
);

-- Raw high-entropy QR secrets are isolated from browser roles.
create table if not exists public.ticket_secrets (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  qr_token text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.checkin_logs (
  id bigint generated always as identity primary key,
  ticket_id uuid references public.tickets(id),
  ticket_number text,
  result text not null,
  gate text,
  method text,
  scanned_by uuid references public.profiles(id),
  scanned_at timestamptz not null default now(),
  details jsonb
);

create table if not exists public.email_logs (
  id bigint generated always as identity primary key,
  registration_id uuid references public.registrations(id) on delete cascade,
  recipient text not null,
  status text not null,
  provider text not null default 'resend',
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists registrations_event_idx on public.registrations(event_id);
create index if not exists registrations_student_idx on public.registrations(student_number);
create index if not exists registrations_created_idx on public.registrations(created_at desc);
create index if not exists tickets_registration_idx on public.tickets(registration_id);
create index if not exists tickets_event_status_idx on public.tickets(event_id,status);
create index if not exists checkin_logs_scanned_idx on public.checkin_logs(scanned_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
for each row execute procedure public.set_updated_at();

drop trigger if exists registrations_updated_at on public.registrations;
create trigger registrations_updated_at before update on public.registrations
for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles(id,email,full_name,role,active)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'scanner',
    false
  )
  on conflict(id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_staff_role()
returns public.staff_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.is_active_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and active=true)
$$;

-- Atomic creation called only by service-role Edge Function.

create or replace function public.generate_puf26_ticket_number()
returns text
language plpgsql security definer set search_path = public as $$
declare
  raw_code text;
  candidate text;
begin
  loop
    raw_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
    candidate := 'PUF26-' ||
      substr(raw_code,1,4) || '-' ||
      substr(raw_code,5,4) || '-' ||
      substr(raw_code,9,4) || '-' ||
      substr(raw_code,13,4);

    exit when not exists (
      select 1 from public.tickets where ticket_number = candidate
    );
  end loop;

  return candidate;
end $$;

create or replace function public.create_registration_and_tickets(
  p_registration jsonb,
  p_tokens jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  reg_id uuid;
  tx_no text;
  ticket_id uuid;
  ticket_no text;
  tok jsonb;
  ord bigint;
  ticket_results jsonb := '[]'::jsonb;
begin
  select * into ev from public.events where slug = p_registration->>'event_slug' and sales_open = true;
  if not found then raise exception 'Event sales are closed or event not found'; end if;

  if (p_registration->>'ticket_quantity')::int < 1
     or (p_registration->>'ticket_quantity')::int > ev.max_tickets_per_transaction then
    raise exception 'Ticket quantity exceeds event limit';
  end if;

  if jsonb_array_length(p_tokens) <> (p_registration->>'ticket_quantity')::int then
    raise exception 'Token count does not match ticket quantity';
  end if;

  tx_no := 'PUF26-TXN-' || lpad(nextval('public.puf26_transaction_seq')::text,6,'0');
  reg_id := gen_random_uuid();

  insert into public.registrations(
    id,event_id,transaction_number,student_number,campus,first_name,middle_name,last_name,email,
    course,year_level,section,ticket_quantity,ticket_price,expected_total,amount_paid,or_number,
    payment_date,payment_method,notes,created_by,updated_by
  ) values (
    reg_id,ev.id,tx_no,
    p_registration->>'student_number',p_registration->>'campus',p_registration->>'first_name',
    nullif(p_registration->>'middle_name',''),p_registration->>'last_name',p_registration->>'email',
    p_registration->>'course',p_registration->>'year_level',p_registration->>'section',
    (p_registration->>'ticket_quantity')::int,ev.ticket_price,
    ev.ticket_price * (p_registration->>'ticket_quantity')::int,
    (p_registration->>'amount_paid')::numeric,nullif(p_registration->>'or_number',''),
    (p_registration->>'payment_date')::date,p_registration->>'payment_method',
    nullif(p_registration->>'notes',''),(p_registration->>'created_by')::uuid,(p_registration->>'created_by')::uuid
  );

  for tok, ord in
    select value, ordinality from jsonb_array_elements(p_tokens) with ordinality
  loop
    ticket_id := gen_random_uuid();
    ticket_no := public.generate_puf26_ticket_number();

    insert into public.tickets(id,event_id,registration_id,ticket_number,holder_name,token_hash)
    values(ticket_id,ev.id,reg_id,ticket_no,tok->>'holder_name',tok->>'token_hash');

    insert into public.ticket_secrets(ticket_id,qr_token)
    values(ticket_id,tok->>'qr_token');

    ticket_results := ticket_results || jsonb_build_array(jsonb_build_object(
      'id',ticket_id,'ticket_number',ticket_no,'holder_name',tok->>'holder_name','ordinal',ord
    ));
  end loop;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values((p_registration->>'created_by')::uuid,'CREATE_REGISTRATION','registration',reg_id::text,
    jsonb_build_object('transaction_number',tx_no,'ticket_quantity',(p_registration->>'ticket_quantity')::int));

  return jsonb_build_object(
    'registration_id',reg_id,
    'transaction_number',tx_no,
    'tickets',ticket_results
  );
end $$;

-- Atomic one-time redemption.
create or replace function public.redeem_ticket(
  p_token_hash text,
  p_ticket_number text,
  p_scanned_by uuid,
  p_gate text,
  p_method text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.tickets%rowtype;
  r public.registrations%rowtype;
begin
  if p_token_hash is not null then
    select * into t from public.tickets where token_hash=p_token_hash for update;
  elsif p_ticket_number is not null then
    select * into t from public.tickets where upper(ticket_number)=upper(p_ticket_number) for update;
  else
    return jsonb_build_object('result','invalid','message','No ticket supplied');
  end if;

  if not found then
    insert into public.checkin_logs(ticket_number,result,gate,method,scanned_by,details)
    values(p_ticket_number,'invalid',p_gate,p_method,p_scanned_by,jsonb_build_object('reason','not_found'));
    return jsonb_build_object('result','invalid','message','Ticket not registered');
  end if;

  select * into r from public.registrations where id=t.registration_id;

  if t.status='void' then
    insert into public.checkin_logs(ticket_id,ticket_number,result,gate,method,scanned_by)
    values(t.id,t.ticket_number,'void',p_gate,p_method,p_scanned_by);
    return jsonb_build_object('result','void','ticket_number',t.ticket_number,'holder_name',t.holder_name,
      'purchaser_name',trim(concat_ws(' ',r.first_name,r.middle_name,r.last_name)),
      'course',r.course,'year_level',r.year_level,'section',r.section);
  end if;

  if t.status='used' then
    insert into public.checkin_logs(ticket_id,ticket_number,result,gate,method,scanned_by)
    values(t.id,t.ticket_number,'used',p_gate,p_method,p_scanned_by);
    return jsonb_build_object('result','used','ticket_number',t.ticket_number,'holder_name',t.holder_name,
      'purchaser_name',trim(concat_ws(' ',r.first_name,r.middle_name,r.last_name)),
      'course',r.course,'year_level',r.year_level,'section',r.section,
      'checked_in_at',t.checked_in_at,'checked_in_gate',t.checked_in_gate);
  end if;

  update public.tickets set status='used',checked_in_at=now(),checked_in_by=p_scanned_by,checked_in_gate=p_gate where id=t.id
  returning * into t;

  insert into public.checkin_logs(ticket_id,ticket_number,result,gate,method,scanned_by)
  values(t.id,t.ticket_number,'success',p_gate,p_method,p_scanned_by);

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(p_scanned_by,'CHECK_IN','ticket',t.id::text,jsonb_build_object('ticket_number',t.ticket_number,'gate',p_gate,'method',p_method));

  return jsonb_build_object('result','success','ticket_number',t.ticket_number,'holder_name',t.holder_name,
    'purchaser_name',trim(concat_ws(' ',r.first_name,r.middle_name,r.last_name)),
    'course',r.course,'year_level',r.year_level,'section',r.section,'checked_in_at',t.checked_in_at,'checked_in_gate',t.checked_in_gate);
end $$;

-- Seed event
insert into public.events(slug,name,event_date,start_time,end_time,venue,ticket_price,max_tickets_per_transaction,sales_open,checkin_open)
values('pu-fest-2026','PU Fest 2026','2026-10-30','13:00','18:00','PanpacificU Events Center',499,50,true,true)
on conflict(slug) do update set
  name=excluded.name,event_date=excluded.event_date,start_time=excluded.start_time,end_time=excluded.end_time,
  venue=excluded.venue,ticket_price=excluded.ticket_price,max_tickets_per_transaction=excluded.max_tickets_per_transaction;

-- RLS
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_secrets enable row level security;
alter table public.checkin_logs enable row level security;
alter table public.email_logs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_self_or_admin_select on public.profiles;
create policy profiles_self_or_admin_select on public.profiles for select to authenticated
using (
  id=auth.uid()
  or public.current_staff_role() in ('admin'::public.staff_role,'event_admin'::public.staff_role)
);

drop policy if exists events_staff_select on public.events;
create policy events_staff_select on public.events for select to authenticated
using(public.is_active_staff());

drop policy if exists registrations_staff_select on public.registrations;
create policy registrations_staff_select on public.registrations for select to authenticated
using(public.current_staff_role() in ('admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role,'viewer'::public.staff_role));

drop policy if exists tickets_management_select on public.tickets;
create policy tickets_management_select on public.tickets for select to authenticated
using(public.current_staff_role() in ('admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role,'viewer'::public.staff_role));

drop policy if exists checkin_management_select on public.checkin_logs;
create policy checkin_management_select on public.checkin_logs for select to authenticated
using(public.current_staff_role() in ('admin'::public.staff_role,'event_admin'::public.staff_role,'viewer'::public.staff_role));

drop policy if exists email_management_select on public.email_logs;
create policy email_management_select on public.email_logs for select to authenticated
using(public.current_staff_role() in ('admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role,'viewer'::public.staff_role));

drop policy if exists audit_admin_select on public.audit_logs;
create policy audit_admin_select on public.audit_logs for select to authenticated
using(public.current_staff_role() in ('admin'::public.staff_role,'event_admin'::public.staff_role));

-- Browser grants: SELECT only where RLS allows. Mutations are Edge Function/service-role only.
revoke all on public.ticket_secrets from anon, authenticated;
revoke all on public.profiles,public.events,public.registrations,public.tickets,public.checkin_logs,public.email_logs,public.audit_logs from anon;
revoke insert,update,delete on public.profiles,public.events,public.registrations,public.tickets,public.checkin_logs,public.email_logs,public.audit_logs from authenticated;
grant select on public.profiles,public.events,public.registrations,public.tickets,public.checkin_logs,public.email_logs,public.audit_logs to authenticated;
grant usage,select on all sequences in schema public to service_role;
grant all on public.ticket_secrets to service_role;
grant all on public.profiles,public.events,public.registrations,public.tickets,public.checkin_logs,public.email_logs,public.audit_logs to service_role;

revoke execute on function public.create_registration_and_tickets(jsonb,jsonb) from public,anon,authenticated;
revoke execute on function public.redeem_ticket(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_registration_and_tickets(jsonb,jsonb) to service_role;
grant execute on function public.redeem_ticket(text,text,uuid,text,text) to service_role;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.is_active_staff() to authenticated;


revoke execute on function public.generate_puf26_ticket_number() from public,anon,authenticated;
grant execute on function public.generate_puf26_ticket_number() to service_role;


-- v1.4.0 private payment receipt storage
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'payment-receipts','payment-receipts',false,5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "PU Fest receipt read" on storage.objects;
create policy "PU Fest receipt read" on storage.objects for select to authenticated
using(
  bucket_id='payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
  )
);

drop policy if exists "PU Fest receipt upload" on storage.objects;
create policy "PU Fest receipt upload" on storage.objects for insert to authenticated
with check(
  bucket_id='payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
  )
);

drop policy if exists "PU Fest receipt update" on storage.objects;
create policy "PU Fest receipt update" on storage.objects for update to authenticated
using(
  bucket_id='payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
  )
)
with check(
  bucket_id='payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
  )
);

drop policy if exists "PU Fest receipt delete" on storage.objects;
create policy "PU Fest receipt delete" on storage.objects for delete to authenticated
using(
  bucket_id='payment-receipts'
  and public.current_staff_role() in (
    'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
  )
);


-- ==================== v1.5.0 MAJOR WORKFLOW UPDATE ====================
-- PU FEST 2026 TICKETING SYSTEM
-- Migration v1.5.0
-- Major workflow update:
-- - Password-gated public scanner (no staff account required)
-- - Archive instead of destructive transaction deletion
-- - Online ticket requests with proof of payment + Finance approval
-- - Up to 50 paid tickets per transaction
-- - Barkada Bundle: Buy 10, Get 1 Free (per 10 paid tickets)
-- - Finance-created tickets still auto-email immediately

-- 1) EVENT LIMIT -------------------------------------------------------------
alter table public.events
  drop constraint if exists events_max_tickets_per_transaction_check;

alter table public.events
  add constraint events_max_tickets_per_transaction_check
  check (max_tickets_per_transaction between 1 and 50);

update public.events
set max_tickets_per_transaction = 50
where slug = 'pu-fest-2026';

-- 2) REGISTRATION / TICKET METADATA ----------------------------------------
alter table public.registrations
  add column if not exists purchase_source text not null default 'finance',
  add column if not exists paid_ticket_quantity integer,
  add column if not exists free_ticket_quantity integer not null default 0,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

update public.registrations
set paid_ticket_quantity = ticket_quantity
where paid_ticket_quantity is null;

alter table public.registrations
  alter column paid_ticket_quantity set not null;

alter table public.tickets
  add column if not exists is_free boolean not null default false;

-- 3) ONLINE REQUESTS ---------------------------------------------------------
create table if not exists public.online_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  submission_number text unique not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  email text not null,
  contact_number text not null,
  organization text,
  paid_ticket_quantity integer not null check (paid_ticket_quantity between 1 and 50),
  free_ticket_quantity integer not null default 0,
  total_ticket_quantity integer not null,
  ticket_price numeric(10,2) not null,
  expected_total numeric(10,2) not null,
  payment_method text not null,
  payment_reference text,
  receipt_path text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  registration_id uuid references public.registrations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registrations
  add column if not exists online_order_id uuid references public.online_orders(id);

create index if not exists online_orders_status_created_idx
  on public.online_orders(status, created_at desc);
create index if not exists online_orders_email_idx
  on public.online_orders(email);
create index if not exists registrations_source_idx
  on public.registrations(purchase_source, created_at desc);
create index if not exists registrations_archived_idx
  on public.registrations(archived_at);

-- 4) ARCHIVE LEDGER ----------------------------------------------------------
create table if not exists public.transaction_archives (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  transaction_number text not null,
  registration_snapshot jsonb not null,
  tickets_snapshot jsonb not null,
  archived_by uuid references public.profiles(id),
  archive_reason text,
  archived_at timestamptz not null default now()
);

create unique index if not exists transaction_archives_registration_uidx
  on public.transaction_archives(registration_id);
create index if not exists transaction_archives_archived_idx
  on public.transaction_archives(archived_at desc);

-- 5) UPDATED_AT FOR ONLINE REQUESTS -----------------------------------------
drop trigger if exists online_orders_updated_at on public.online_orders;
create trigger online_orders_updated_at before update on public.online_orders
for each row execute procedure public.set_updated_at();

-- 6) STORAGE FOR ONLINE PAYMENT PROOFS --------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'online-payment-proofs','online-payment-proofs',false,5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Only staff read these through the browser. Public uploads go through a service-role Edge Function.
drop policy if exists "PU Fest online proof read" on storage.objects;
create policy "PU Fest online proof read"
on storage.objects for select to authenticated
using(
  bucket_id='online-payment-proofs'
  and public.current_staff_role() in (
    'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
  )
);

-- 7) RLS --------------------------------------------------------------------
alter table public.online_orders enable row level security;
alter table public.transaction_archives enable row level security;

drop policy if exists online_orders_staff_select on public.online_orders;
create policy online_orders_staff_select on public.online_orders for select to authenticated
using(public.current_staff_role() in (
  'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
));

drop policy if exists archives_staff_select on public.transaction_archives;
create policy archives_staff_select on public.transaction_archives for select to authenticated
using(public.current_staff_role() in (
  'admin'::public.staff_role,'finance'::public.staff_role,'event_admin'::public.staff_role
));

revoke all on public.online_orders, public.transaction_archives from anon;
revoke insert,update,delete on public.online_orders, public.transaction_archives from authenticated;
grant select on public.online_orders, public.transaction_archives to authenticated;
grant all on public.online_orders, public.transaction_archives to service_role;

-- 8) CREATE REGISTRATION + TICKETS RPC --------------------------------------
-- paid_ticket_quantity is what the buyer pays for.
-- free_ticket_quantity = floor(paid / 10)
-- total ticket_quantity = paid + free
create or replace function public.create_registration_and_tickets(
  p_registration jsonb,
  p_tokens jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  ev public.events%rowtype;
  reg_id uuid;
  tx_no text;
  ticket_id uuid;
  ticket_no text;
  tok jsonb;
  ord bigint;
  paid_qty integer;
  free_qty integer;
  total_qty integer;
  src text;
  online_id uuid;
  ticket_results jsonb := '[]'::jsonb;
  order_updated integer := 0;
begin
  select * into ev
  from public.events
  where slug = p_registration->>'event_slug'
    and sales_open = true;

  if not found then
    raise exception 'Event sales are closed or event not found';
  end if;

  paid_qty := coalesce(
    nullif(p_registration->>'paid_ticket_quantity','')::int,
    nullif(p_registration->>'ticket_quantity','')::int,
    0
  );

  if paid_qty < 1 or paid_qty > ev.max_tickets_per_transaction then
    raise exception 'Paid ticket quantity must be between 1 and %', ev.max_tickets_per_transaction;
  end if;

  free_qty := floor(paid_qty / 10.0)::int;
  total_qty := paid_qty + free_qty;

  if jsonb_array_length(p_tokens) <> total_qty then
    raise exception 'Token count does not match paid + free ticket quantity';
  end if;

  src := coalesce(nullif(p_registration->>'purchase_source',''), 'finance');
  if src not in ('finance','online') then
    raise exception 'Invalid purchase source';
  end if;

  online_id := nullif(p_registration->>'online_order_id','')::uuid;

  tx_no := 'PUF26-TXN-' || lpad(nextval('public.puf26_transaction_seq')::text,6,'0');
  reg_id := gen_random_uuid();

  insert into public.registrations(
    id,event_id,transaction_number,student_number,campus,first_name,middle_name,last_name,email,
    course,year_level,section,ticket_quantity,paid_ticket_quantity,free_ticket_quantity,
    ticket_price,expected_total,amount_paid,or_number,receipt_path,payment_date,payment_method,notes,
    purchase_source,online_order_id,created_by,updated_by
  ) values (
    reg_id,ev.id,tx_no,
    p_registration->>'student_number',p_registration->>'campus',p_registration->>'first_name',
    nullif(p_registration->>'middle_name',''),p_registration->>'last_name',p_registration->>'email',
    p_registration->>'course',p_registration->>'year_level',p_registration->>'section',
    total_qty,paid_qty,free_qty,ev.ticket_price,ev.ticket_price * paid_qty,
    (p_registration->>'amount_paid')::numeric,nullif(p_registration->>'or_number',''),
    nullif(p_registration->>'receipt_path',''),
    (p_registration->>'payment_date')::date,p_registration->>'payment_method',
    nullif(p_registration->>'notes',''),src,online_id,
    nullif(p_registration->>'created_by','')::uuid,nullif(p_registration->>'created_by','')::uuid
  );

  for tok, ord in
    select value, ordinality from jsonb_array_elements(p_tokens) with ordinality
  loop
    ticket_id := gen_random_uuid();
    ticket_no := public.generate_puf26_ticket_number();

    insert into public.tickets(
      id,event_id,registration_id,ticket_number,holder_name,token_hash,is_free
    ) values(
      ticket_id,ev.id,reg_id,ticket_no,tok->>'holder_name',tok->>'token_hash',
      coalesce((tok->>'is_free')::boolean, ord > paid_qty)
    );

    insert into public.ticket_secrets(ticket_id,qr_token)
    values(ticket_id,tok->>'qr_token');

    ticket_results := ticket_results || jsonb_build_array(jsonb_build_object(
      'id',ticket_id,
      'ticket_number',ticket_no,
      'holder_name',tok->>'holder_name',
      'is_free',coalesce((tok->>'is_free')::boolean, ord > paid_qty),
      'ordinal',ord
    ));
  end loop;

  if src = 'online' then
    if online_id is null then
      raise exception 'Online order ID is required';
    end if;

    update public.online_orders
    set status='approved',
        registration_id=reg_id,
        reviewed_by=nullif(p_registration->>'created_by','')::uuid,
        reviewed_at=now(),
        review_note=nullif(p_registration->>'review_note','')
    where id=online_id and status='pending';

    get diagnostics order_updated = row_count;
    if order_updated <> 1 then
      raise exception 'Online request is no longer pending';
    end if;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(
    nullif(p_registration->>'created_by','')::uuid,
    case when src='online' then 'APPROVE_ONLINE_ORDER' else 'CREATE_REGISTRATION' end,
    'registration',reg_id::text,
    jsonb_build_object(
      'transaction_number',tx_no,
      'purchase_source',src,
      'paid_ticket_quantity',paid_qty,
      'free_ticket_quantity',free_qty,
      'ticket_quantity',total_qty,
      'online_order_id',online_id
    )
  );

  return jsonb_build_object(
    'registration_id',reg_id,
    'transaction_number',tx_no,
    'paid_ticket_quantity',paid_qty,
    'free_ticket_quantity',free_qty,
    'ticket_quantity',total_qty,
    'tickets',ticket_results
  );
end $$;

-- 9) REDEEM RPC: archived transactions cannot enter -------------------------
create or replace function public.redeem_ticket(
  p_token_hash text,
  p_ticket_number text,
  p_scanned_by uuid,
  p_gate text,
  p_method text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.tickets%rowtype;
  r public.registrations%rowtype;
begin
  if p_token_hash is not null then
    select * into t from public.tickets where token_hash=p_token_hash for update;
  elsif p_ticket_number is not null then
    select * into t from public.tickets where upper(ticket_number)=upper(p_ticket_number) for update;
  else
    return jsonb_build_object('result','invalid','message','No ticket supplied');
  end if;

  if not found then
    insert into public.checkin_logs(ticket_number,result,gate,method,scanned_by,details)
    values(p_ticket_number,'invalid',p_gate,p_method,p_scanned_by,jsonb_build_object('reason','not_found'));
    return jsonb_build_object('result','invalid','message','Ticket not registered');
  end if;

  select * into r from public.registrations where id=t.registration_id;

  if r.archived_at is not null or r.status <> 'active' then
    insert into public.checkin_logs(ticket_id,ticket_number,result,gate,method,scanned_by,details)
    values(t.id,t.ticket_number,'void',p_gate,p_method,p_scanned_by,jsonb_build_object('reason','archived_or_inactive'));
    return jsonb_build_object(
      'result','void','message','Transaction is archived or inactive',
      'ticket_number',t.ticket_number,'holder_name',t.holder_name,'is_free',t.is_free,
      'purchaser_name',trim(concat_ws(' ',r.first_name,r.middle_name,r.last_name)),
      'course',r.course,'year_level',r.year_level,'section',r.section
    );
  end if;

  if t.status='void' then
    insert into public.checkin_logs(ticket_id,ticket_number,result,gate,method,scanned_by)
    values(t.id,t.ticket_number,'void',p_gate,p_method,p_scanned_by);
    return jsonb_build_object('result','void','ticket_number',t.ticket_number,'holder_name',t.holder_name,'is_free',t.is_free,
      'purchaser_name',trim(concat_ws(' ',r.first_name,r.middle_name,r.last_name)),
      'course',r.course,'year_level',r.year_level,'section',r.section);
  end if;

  if t.status='used' then
    insert into public.checkin_logs(ticket_id,ticket_number,result,gate,method,scanned_by)
    values(t.id,t.ticket_number,'used',p_gate,p_method,p_scanned_by);
    return jsonb_build_object('result','used','ticket_number',t.ticket_number,'holder_name',t.holder_name,'is_free',t.is_free,
      'purchaser_name',trim(concat_ws(' ',r.first_name,r.middle_name,r.last_name)),
      'course',r.course,'year_level',r.year_level,'section',r.section,
      'checked_in_at',t.checked_in_at,'checked_in_gate',t.checked_in_gate);
  end if;

  update public.tickets
  set status='used',checked_in_at=now(),checked_in_by=p_scanned_by,checked_in_gate=p_gate
  where id=t.id
  returning * into t;

  insert into public.checkin_logs(ticket_id,ticket_number,result,gate,method,scanned_by)
  values(t.id,t.ticket_number,'success',p_gate,p_method,p_scanned_by);

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_values)
  values(p_scanned_by,'CHECK_IN','ticket',t.id::text,
    jsonb_build_object('ticket_number',t.ticket_number,'gate',p_gate,'method',p_method));

  return jsonb_build_object('result','success','ticket_number',t.ticket_number,'holder_name',t.holder_name,'is_free',t.is_free,
    'purchaser_name',trim(concat_ws(' ',r.first_name,r.middle_name,r.last_name)),
    'course',r.course,'year_level',r.year_level,'section',r.section,
    'checked_in_at',t.checked_in_at,'checked_in_gate',t.checked_in_gate);
end $$;

revoke execute on function public.create_registration_and_tickets(jsonb,jsonb) from public,anon,authenticated;
revoke execute on function public.redeem_ticket(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_registration_and_tickets(jsonb,jsonb) to service_role;
grant execute on function public.redeem_ticket(text,text,uuid,text,text) to service_role;
