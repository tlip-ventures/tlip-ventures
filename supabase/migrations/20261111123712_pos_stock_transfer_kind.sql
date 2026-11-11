-- Stock & POS: a stock movement can be a transfer between places (shop and
-- warehouse). On its own so the next migration can use it.
alter type public.stock_movement_kind add value if not exists 'transfer';
