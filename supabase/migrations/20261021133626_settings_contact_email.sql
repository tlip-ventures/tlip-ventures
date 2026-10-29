-- Shop's contact email, shown in the footer and on the About page.
alter table public.settings
  add column contact_email text
  check (contact_email is null or (length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
