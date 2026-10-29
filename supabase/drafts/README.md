# Draft migrations

SQL written for the next phase of the Stock & POS app but not applied to the
database yet. Nothing here is picked up by `npm run db:push`.

Each draft is dry-run against the database with its checks (inside a
transaction that is rolled back) before it is applied. Once applied, it moves to
`supabase/migrations/` under the version the database records.
