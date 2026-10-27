-- Home page banners (marketplace redesign). Artwork is 1440 × 720 (2:1) from
-- Cloudinary, the same image on phones and computers. The home page shows up
-- to 5 active banners in sort_order; with none active it shows a green panel.

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null check (image_url ~ '^https://'),
  public_id text,
  -- Describes the artwork, including any words in it (screen readers, slow connections).
  alt text not null check (char_length(btrim(alt)) between 1 and 300),
  -- A page on this site ("/deals") or a full https:// address; null for a picture only.
  link_url text check (link_url is null or link_url ~ '^(/([^/].*)?|https://.+)$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index banners_active_sort_idx on public.banners (sort_order, created_at) where is_active;

create trigger banners_set_updated_at
  before update on public.banners
  for each row execute function public.set_updated_at();

-- Same pattern as the catalogue (20261020223203_rls.sql): the public reads
-- active banners only; admins (private.is_admin()) read and change all.
revoke all on public.banners from anon, authenticated;
grant select on public.banners to anon, authenticated;
grant insert, update, delete on public.banners to authenticated;

alter table public.banners enable row level security;

create policy "Anyone can read active banners; admins read all"
  on public.banners for select to anon, authenticated
  using (is_active or (select private.is_admin()));
create policy "Admins can add banners"
  on public.banners for insert to authenticated
  with check ((select private.is_admin()));
create policy "Admins can edit banners"
  on public.banners for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete banners"
  on public.banners for delete to authenticated
  using ((select private.is_admin()));
