-- PU FEST 2026 TICKETING SYSTEM
-- Migration v1.3.2
-- Hotfix: Supabase pgcrypto functions are installed in the `extensions` schema.
-- This replaces the random public ticket-number generator so it can resolve
-- gen_random_bytes() correctly.
--
-- Existing tickets remain unchanged.

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
    raw_code := upper(
      encode(extensions.gen_random_bytes(8), 'hex')
    );

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

revoke execute on function public.generate_puf26_ticket_number()
from public, anon, authenticated;

grant execute on function public.generate_puf26_ticket_number()
to service_role;
