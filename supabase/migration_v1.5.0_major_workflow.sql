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
