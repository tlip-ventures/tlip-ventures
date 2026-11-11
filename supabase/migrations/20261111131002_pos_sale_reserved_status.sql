-- A sale kept for the customer that isn't paid in full yet: its items stay on
-- the shelf until the last payment, or until it is collected or sent out.
alter type public.sale_status add value if not exists 'reserved';
