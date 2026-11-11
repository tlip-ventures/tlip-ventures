-- Stock & POS: a sale can be On hold: part paid, its items already off the
-- shelf, waiting for the rest of the money. It confirms itself (completed)
-- once nothing is owed. The functions that use it follow in the next migration
-- (a new enum value can't be used in the same transaction that adds it).

alter type public.sale_status add value if not exists 'on_hold' after 'pending';
