-- 1. Create this user first in Supabase Authentication > Users.
-- 2. Replace the email below and run this SQL.

update public.profiles
set role='admin', active=true, updated_at=now()
where id = (
  select id from auth.users
  where email = 'YOUR_ADMIN_EMAIL@panpacificu.edu.ph'
);

select id,email,full_name,role,active from public.profiles
where email = 'YOUR_ADMIN_EMAIL@panpacificu.edu.ph';
