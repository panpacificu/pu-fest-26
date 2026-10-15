-- PU FEST 2026 TICKETING SYSTEM
-- Migration v1.3.1
-- Security hardening: replace predictable sequential public ticket numbers
-- with random 64-bit display codes such as PUF26-7A3F-9C2D-81B4-E6F1.
--
-- Existing tickets are NOT changed and remain valid.

create or replace function public.generate_puf26_ticket_number()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  raw_code text;
  candidate text;
begin
  loop
    raw_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));

    candidate :=
      'PUF26-' ||
      substr(raw_code, 1, 4) || '-' ||
      substr(raw_code, 5, 4) || '-' ||
      substr(raw_code, 9, 4) || '-' ||
      substr(raw_code, 13, 4);

    exit when not exists (
      select 1
      from public.tickets
      where ticket_number = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.create_registration_and_tickets(
  p_registration jsonb,
  p_tokens jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
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
  select *
  into ev
  from public.events
  where slug = p_registration->>'event_slug'
    and sales_open = true;

  if not found then
    raise exception 'Event sales are closed or event not found';
  end if;

  if (p_registration->>'ticket_quantity')::int < 1
     or (p_registration->>'ticket_quantity')::int > ev.max_tickets_per_transaction then
    raise exception 'Ticket quantity exceeds event limit';
  end if;

  if jsonb_array_length(p_tokens) <> (p_registration->>'ticket_quantity')::int then
    raise exception 'Token count does not match ticket quantity';
  end if;

  -- Transaction IDs may remain sequential because they are administrative references,
  -- not admission credentials.
  tx_no := 'PUF26-TXN-' || lpad(nextval('public.puf26_transaction_seq')::text, 6, '0');
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
    nullif(p_registration->>'notes',''),(p_registration->>'created_by')::uuid,
    (p_registration->>'created_by')::uuid
  );

  for tok, ord in
    select value, ordinality
    from jsonb_array_elements(p_tokens) with ordinality
  loop
    ticket_id := gen_random_uuid();

    -- Security change: random public ticket number instead of PUF26-000001 style IDs.
    ticket_no := public.generate_puf26_ticket_number();

    insert into public.tickets(
      id,event_id,registration_id,ticket_number,holder_name,token_hash
    )
    values(
      ticket_id,ev.id,reg_id,ticket_no,tok->>'holder_name',tok->>'token_hash'
    );

    insert into public.ticket_secrets(ticket_id,qr_token)
    values(ticket_id,tok->>'qr_token');

    ticket_results := ticket_results || jsonb_build_array(
      jsonb_build_object(
        'id',ticket_id,
        'ticket_number',ticket_no,
        'holder_name',tok->>'holder_name',
        'ordinal',ord
      )
    );
  end loop;

  insert into public.audit_logs(
    actor_id,action,entity_type,entity_id,new_values
  )
  values(
    (p_registration->>'created_by')::uuid,
    'CREATE_REGISTRATION',
    'registration',
    reg_id::text,
    jsonb_build_object(
      'transaction_number',tx_no,
      'ticket_quantity',(p_registration->>'ticket_quantity')::int
    )
  );

  return jsonb_build_object(
    'registration_id',reg_id,
    'transaction_number',tx_no,
    'tickets',ticket_results
  );
end;
$$;

revoke execute on function public.generate_puf26_ticket_number() from public, anon, authenticated;
grant execute on function public.generate_puf26_ticket_number() to service_role;

revoke execute on function public.create_registration_and_tickets(jsonb,jsonb)
from public,anon,authenticated;

grant execute on function public.create_registration_and_tickets(jsonb,jsonb)
to service_role;
