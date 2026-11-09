-- DEMO products for showing the shop before real stock is loaded.
-- Prices are integer pesewas. Images are added once Cloudinary is set up.
-- Remove them all with supabase/seed/demo_products_remove.sql.
-- Safe to re-run.

insert into public.products
  (name, slug, brand, description, price, compare_at_price, option1_name, choices, is_featured)
values
  ('Blender 1.5L', 'blender-1-5l', 'Silver Crest',
   'Powerful 1.5 litre blender with glass jar and two speeds plus pulse. Ideal for smoothies, soups and grinding pepper.',
   45000, null, 'Colour', '{Black,White}', true),
  ('Juice Extractor 800W', 'juice-extractor-800w', null,
   'Wide-mouth juicer for whole fruit and vegetables, with pulp container and easy-clean parts.',
   65000, null, null, '{}', false),
  ('Food Processor 3-in-1', 'food-processor-3-in-1', null,
   'Chops, slices and kneads. Comes with blender jar and grinder attachment.',
   89000, 99000, null, '{}', true),
  ('Hand Mixer 5-Speed', 'hand-mixer-5-speed', null,
   'Light hand mixer with beaters and dough hooks for cakes, chin chin and bread.',
   25000, null, null, '{}', false),
  ('Electric Kettle 1.8L', 'electric-kettle-1-8l', null,
   'Stainless steel cordless kettle with auto shut-off and boil-dry protection.',
   18000, null, 'Colour', '{Silver,Black}', false),
  ('Water Dispenser Hot & Cold', 'water-dispenser-hot-cold', null,
   'Top-loading dispenser for hot and cold water, with child lock on the hot tap.',
   125050, null, null, '{}', false),
  ('Table-top Gas Burner (2 Burners)', 'gas-burner-2-burners', null,
   'Sturdy two-burner gas cooker with auto ignition.',
   32000, null, null, '{}', true),
  ('Electric Oven 30L', 'electric-oven-30l', null,
   '30 litre oven with grill, timer and adjustable temperature up to 230°C.',
   150000, 175000, null, '{}', false),
  ('Coal Pot', 'coal-pot', null,
   'Traditional cast iron coal pot for slow cooking and grilling.',
   9000, null, null, '{}', false),
  ('Foldable Storage Stool', 'foldable-storage-stool', null,
   'Padded stool that folds flat and doubles as a storage box.',
   12000, null, 'Colour', '{Grey,Navy}', true),
  ('Packing Cubes (Set of 6)', 'packing-cubes-set-of-6', null,
   'Six zip cubes in different sizes to keep wardrobes and travel bags tidy.',
   15000, null, null, '{}', false),
  ('3-Tier Kitchen Rack', 'kitchen-rack-3-tier', null,
   'Steel rack for spices, pots and food stuff. Fits beside the counter.',
   27500, null, null, '{}', false),
  ('Steam Iron', 'steam-iron', null,
   'Non-stick soleplate with steam burst and vertical steaming.',
   22000, null, null, '{}', false),
  ('Mop & Bucket Set', 'mop-bucket-set', null,
   'Spin mop with bucket and two microfibre heads.',
   14000, null, null, '{}', false),
  ('Kitchen Utensil Set (6 Pieces)', 'kitchen-utensil-set-6', null,
   'Heat-resistant spoon, ladle, turner, slotted spoon, whisk and tongs.',
   8500, null, null, '{}', false)
on conflict (slug) do nothing;

-- One stock entry per product; colours are choices on the product, not stocked separately.
insert into public.product_variants (product_id, in_stock)
select p.id, v.in_stock
from (values
  ('blender-1-5l', true),
  ('juice-extractor-800w', true),
  ('food-processor-3-in-1', true),
  ('hand-mixer-5-speed', true),
  ('electric-kettle-1-8l', true),
  ('water-dispenser-hot-cold', true),
  ('gas-burner-2-burners', true),
  ('electric-oven-30l', true),
  ('coal-pot', true),
  ('foldable-storage-stool', true),
  ('packing-cubes-set-of-6', true),
  ('kitchen-rack-3-tier', true),
  ('steam-iron', true),
  ('mop-bucket-set', false),
  ('kitchen-utensil-set-6', true)
) as v (product_slug, in_stock)
join public.products p on p.slug = v.product_slug
where not exists (select 1 from public.product_variants x where x.product_id = p.id and not x.retired);

-- Category links. Some products sit in two subcategories.
insert into public.product_categories (product_id, category_id)
select p.id, c.id
from (values
  ('blender-1-5l', 'blenders'),
  ('juice-extractor-800w', 'juicers'),
  ('food-processor-3-in-1', 'food-processors'),
  ('food-processor-3-in-1', 'blenders'),
  ('hand-mixer-5-speed', 'stand-hand-mixers'),
  ('electric-kettle-1-8l', 'kettles'),
  ('water-dispenser-hot-cold', 'dispensers'),
  ('gas-burner-2-burners', 'gas-burners'),
  ('electric-oven-30l', 'ovens'),
  ('coal-pot', 'coal-pots'),
  ('foldable-storage-stool', 'foldable-storage-stools'),
  ('foldable-storage-stool', 'home-storage-organizers-racks'),
  ('packing-cubes-set-of-6', 'packing-cubes'),
  ('kitchen-rack-3-tier', 'food-racks'),
  ('kitchen-rack-3-tier', 'kitchen-storage-organizers-racks'),
  ('steam-iron', 'irons-garment-steamers'),
  ('mop-bucket-set', 'cleaning-items-tools'),
  ('kitchen-utensil-set-6', 'utensils')
) as l (product_slug, category_slug)
join public.products p on p.slug = l.product_slug
join public.categories c on c.slug = l.category_slug
on conflict do nothing;
