-- Category tree from CLAUDE.md "Catalogue". Safe to re-run.
-- "Storage Organizers & Racks" exists twice on purpose (one per parent), with different slugs.

insert into public.categories (name, slug, sort_order) values
  ('Kitchen Appliances', 'kitchen-appliances', 10),
  ('Cooking & Baking', 'cooking-baking', 20),
  ('Kitchen Storage & Utensils', 'kitchen-storage-utensils', 30),
  ('Home Organization', 'home-organization', 40),
  ('Laundry & Cleaning', 'laundry-cleaning', 50),
  ('Bathroom', 'bathroom', 60),
  ('Kids & Baby', 'kids-baby', 70)
on conflict (slug) do nothing;

insert into public.categories (name, slug, parent_id, sort_order)
select c.name, c.slug, p.id, c.sort_order
from (values
  ('kitchen-appliances', 'Blenders', 'blenders', 10),
  ('kitchen-appliances', 'Juicers', 'juicers', 20),
  ('kitchen-appliances', 'Food Processors', 'food-processors', 30),
  ('kitchen-appliances', 'Stand & Hand Mixers', 'stand-hand-mixers', 40),
  ('kitchen-appliances', 'Kettles', 'kettles', 50),
  ('kitchen-appliances', 'Dispensers', 'dispensers', 60),
  ('cooking-baking', 'Ovens', 'ovens', 10),
  ('cooking-baking', 'Gas Burners', 'gas-burners', 20),
  ('cooking-baking', 'Coal Pots', 'coal-pots', 30),
  ('kitchen-storage-utensils', 'Utensils', 'utensils', 10),
  ('kitchen-storage-utensils', 'Food Racks', 'food-racks', 20),
  ('kitchen-storage-utensils', 'Storage Organizers & Racks', 'kitchen-storage-organizers-racks', 30),
  ('home-organization', 'Storage Organizers & Racks', 'home-storage-organizers-racks', 10),
  ('home-organization', 'Foldable & Storage Stools', 'foldable-storage-stools', 20),
  ('home-organization', 'Packing Cubes', 'packing-cubes', 30),
  ('laundry-cleaning', 'Washing Machines', 'washing-machines', 10),
  ('laundry-cleaning', 'Irons & Garment Steamers', 'irons-garment-steamers', 20),
  ('laundry-cleaning', 'Cleaning Items & Tools', 'cleaning-items-tools', 30),
  -- Added with the shop's price list (October 2026).
  ('kitchen-appliances', 'Fufu & Swallow Makers', 'fufu-swallow-makers', 35),
  ('kitchen-appliances', 'Food Dehydrators', 'food-dehydrators', 70),
  ('kitchen-appliances', 'Ice Makers', 'ice-makers', 80),
  ('kitchen-appliances', 'Snack & Dessert Makers', 'snack-dessert-makers', 90),
  ('cooking-baking', 'Rice & Multi Cookers', 'rice-multi-cookers', 5),
  ('home-organization', 'Mats & Rugs', 'mats-rugs', 40),
  ('home-organization', 'Home Essentials', 'home-essentials', 50),
  ('laundry-cleaning', 'Laundry Baskets & Drying Racks', 'laundry-baskets-drying-racks', 25),
  ('bathroom', 'Bathroom Accessories', 'bathroom-accessories', 10),
  ('kids-baby', 'Baby Feeding', 'baby-feeding', 10)
) as c (parent_slug, name, slug, sort_order)
join public.categories p on p.slug = c.parent_slug
on conflict (slug) do nothing;
