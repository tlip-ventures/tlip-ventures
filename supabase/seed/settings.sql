-- The single settings row. Safe to re-run (keeps existing values).
-- whatsapp_number is the shop's WhatsApp (024 295 9396); orders are sent there.
-- Change it in Admin → Settings.

insert into public.settings (id, store_name, whatsapp_number, tagline, social_links)
values (1, 'Tlip Ventures', '233242959396', 'Judges 6:24', '{}'::jsonb)
on conflict (id) do nothing;
