-- Give an existing Supabase Auth user access to /admin. Safe to re-run.
-- 1. Supabase dashboard → Authentication → Users → Add user → Create new user
--    (email + a strong password, tick "Auto Confirm User").
-- 2. Put that email below and run this file in the SQL editor.
-- Remove access with: delete from public.admins where user_id = (select id from auth.users where email = '...');

insert into public.admins (user_id, role)
select id, 'owner'
from auth.users
where email = 'owner@example.com'
on conflict (user_id) do nothing;
