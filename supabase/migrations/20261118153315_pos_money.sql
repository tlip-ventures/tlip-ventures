-- Stock & POS: money accounts (owner only). The shop's money is in three
-- places, the same as the ways of paying: cash, MoMo and bank. Each one's
-- expected balance is its last count by the owner plus everything recorded
-- since: sale payments in, refunds, supplier payments and expenses out, and
-- money moves. A money move is a transfer between accounts (cash taken to the
-- bank, MoMo cashed out), money the owner takes out for herself, or money
-- she puts in. Moves and counts are never removed: a wrong move is cancelled.

create table public.money_moves (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('transfer', 'owner_out', 'owner_in')),
  from_account public.payment_method,
  to_account public.payment_method,
  amount integer not null check (amount > 0 and amount <= 100000000),
  moved_on date not null,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  constraint money_moves_accounts check (
    (kind = 'transfer' and from_account is not null and to_account is not null and from_account <> to_account)
    or (kind = 'owner_out' and from_account is not null and to_account is null)
    or (kind = 'owner_in' and from_account is null and to_account is not null)
  )
);
create index money_moves_created_idx on public.money_moves (created_at desc);
create index money_moves_moved_on_idx on public.money_moves (moved_on);

-- The owner's counts: what was really there, and what the app expected.
create table public.money_checks (
  id uuid primary key default gen_random_uuid(),
  account public.payment_method not null,
  counted integer not null check (counted between -100000000 and 1000000000),
  expected integer,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index money_checks_account_idx on public.money_checks (account, created_at desc);

revoke all on public.money_moves, public.money_checks from anon, authenticated;
grant select on public.money_moves, public.money_checks to authenticated;
alter table public.money_moves enable row level security;
alter table public.money_checks enable row level security;
create policy "Owner reads money moves" on public.money_moves for select to authenticated using ((select private.is_owner()));
create policy "Owner reads money counts" on public.money_checks for select to authenticated using ((select private.is_owner()));

-- Money in and out of one account recorded after p_since (null: ever), by kind.
create function private.money_flows(p_account public.payment_method, p_since timestamptz)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with since as (select coalesce(p_since, '-infinity'::timestamptz) as t)
  select json_build_object(
    'sales_in', coalesce((select sum(p.amount) from public.payments p, since where p.method = p_account and p.paid_at > since.t), 0),
    'refunds_out', coalesce((select sum(r.amount) from public.refund_payments r, since where r.method = p_account and r.paid_at > since.t), 0),
    'suppliers_out', coalesce((select sum(s.amount) from public.purchase_payments s, since where s.method = p_account and s.paid_at > since.t), 0),
    'expenses_out', coalesce((select sum(e.amount) from public.expenses e, since where e.method = p_account and e.cancelled_at is null and e.created_at > since.t), 0),
    'moved_in', coalesce((select sum(m.amount) from public.money_moves m, since where m.kind = 'transfer' and m.to_account = p_account and m.cancelled_at is null and m.created_at > since.t), 0),
    'moved_out', coalesce((select sum(m.amount) from public.money_moves m, since where m.kind = 'transfer' and m.from_account = p_account and m.cancelled_at is null and m.created_at > since.t), 0),
    'owner_out', coalesce((select sum(m.amount) from public.money_moves m, since where m.kind = 'owner_out' and m.from_account = p_account and m.cancelled_at is null and m.created_at > since.t), 0),
    'owner_in', coalesce((select sum(m.amount) from public.money_moves m, since where m.kind = 'owner_in' and m.to_account = p_account and m.cancelled_at is null and m.created_at > since.t), 0)
  );
$$;

-- The net of money_flows.
create function private.money_net(p_flows json)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ((p_flows ->> 'sales_in')::bigint - (p_flows ->> 'refunds_out')::bigint - (p_flows ->> 'suppliers_out')::bigint
    - (p_flows ->> 'expenses_out')::bigint + (p_flows ->> 'moved_in')::bigint - (p_flows ->> 'moved_out')::bigint
    - (p_flows ->> 'owner_out')::bigint + (p_flows ->> 'owner_in')::bigint)::integer;
$$;

-- Each account now: the last count (if any), what came in and went out since,
-- and the balance the app expects. Owner only.
create function public.pos_money_overview()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out json := '[]'::json;
  v_account public.payment_method;
  v_check record;
  v_flows json;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can see the money accounts.' using errcode = '42501';
  end if;
  foreach v_account in array array['cash', 'momo', 'bank']::public.payment_method[] loop
    select counted, created_at into v_check from public.money_checks where account = v_account order by created_at desc limit 1;
    v_flows := private.money_flows(v_account, v_check.created_at);
    v_out := (v_out::jsonb || jsonb_build_array(jsonb_build_object(
      'account', v_account,
      'counted', v_check.counted,
      'counted_at', v_check.created_at,
      'flows', v_flows,
      'expected', coalesce(v_check.counted, 0) + private.money_net(v_flows)
    )))::json;
  end loop;
  return v_out;
end;
$$;

-- Count an account: what is really there now. Saves what the app expected
-- too, so the difference stays on record. Returns the difference.
create function public.pos_count_money(p_account text, p_counted integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.payment_method;
  v_last record;
  v_expected integer;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can count the money.' using errcode = '42501';
  end if;
  if p_account is null or p_account not in ('cash', 'momo', 'bank') then
    raise exception 'Choose cash, MoMo or bank.' using errcode = '22023';
  end if;
  if p_counted is null or p_counted < 0 or p_counted > 1000000000 then
    raise exception 'Enter the amount there now (0 or more).' using errcode = '22023';
  end if;
  v_account := p_account::public.payment_method;
  select counted, created_at into v_last from public.money_checks where account = v_account order by created_at desc limit 1;
  v_expected := coalesce(v_last.counted, 0) + private.money_net(private.money_flows(v_account, v_last.created_at));
  insert into public.money_checks (account, counted, expected, note)
  values (v_account, p_counted, v_expected, left(nullif(btrim(coalesce(p_note, '')), ''), 300));
  return p_counted - v_expected;
end;
$$;

-- Record a money move: a transfer, money the owner takes out, or puts in.
create function public.pos_save_money_move(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := p ->> 'kind';
  v_from text := nullif(p ->> 'from_account', '');
  v_to text := nullif(p ->> 'to_account', '');
  v_amount integer := (p ->> 'amount')::integer;
  v_day date := (p ->> 'moved_on')::date;
  v_id uuid;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can record money moves.' using errcode = '42501';
  end if;
  if v_kind is null or v_kind not in ('transfer', 'owner_out', 'owner_in') then
    raise exception 'Choose what kind of move it is.' using errcode = '22023';
  end if;
  if v_kind = 'owner_out' then v_to := null; end if;
  if v_kind = 'owner_in' then v_from := null; end if;
  if (v_from is not null and v_from not in ('cash', 'momo', 'bank')) or (v_to is not null and v_to not in ('cash', 'momo', 'bank'))
     or (v_kind in ('transfer', 'owner_out') and v_from is null) or (v_kind in ('transfer', 'owner_in') and v_to is null) then
    raise exception 'Choose where the money comes from and goes to.' using errcode = '22023';
  end if;
  if v_kind = 'transfer' and v_from = v_to then
    raise exception 'Choose two different places.' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > 100000000 then
    raise exception 'Enter the amount.' using errcode = '22023';
  end if;
  if v_day is null or v_day > (now() at time zone 'utc')::date then
    raise exception 'Pick the day (today or earlier).' using errcode = '22023';
  end if;
  insert into public.money_moves (kind, from_account, to_account, amount, moved_on, note)
  values (v_kind, v_from::public.payment_method, v_to::public.payment_method, v_amount, v_day,
          left(nullif(btrim(coalesce(p ->> 'note', '')), ''), 300))
  returning id into v_id;
  return v_id;
end;
$$;

-- Cancel a wrong money move (kept, with the reason; no longer counted).
create function public.pos_cancel_money_move(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can cancel money moves.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why it is cancelled.' using errcode = '22023';
  end if;
  update public.money_moves
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = left(btrim(p_reason), 300)
  where id = p_id and cancelled_at is null;
  if not found then
    raise exception 'This move is already cancelled.' using errcode = '22023';
  end if;
end;
$$;

-- Money the owner took out and put in over a stretch of days (by the day of
-- the move). Runs as the caller: only the owner sees anything.
create function public.pos_owner_money(p_from timestamptz, p_to timestamptz)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'out', coalesce(sum(amount) filter (where kind = 'owner_out'), 0),
    'in', coalesce(sum(amount) filter (where kind = 'owner_in'), 0)
  )
  from public.money_moves
  where cancelled_at is null and kind in ('owner_out', 'owner_in')
    and moved_on >= (p_from at time zone 'utc')::date and moved_on < (p_to at time zone 'utc')::date;
$$;

revoke execute on function private.money_flows(public.payment_method, timestamptz), private.money_net(json) from public, anon, authenticated;
revoke execute on function
  public.pos_money_overview(),
  public.pos_count_money(text, integer, text),
  public.pos_save_money_move(jsonb),
  public.pos_cancel_money_move(uuid, text),
  public.pos_owner_money(timestamptz, timestamptz)
from public, anon;
grant execute on function
  public.pos_money_overview(),
  public.pos_count_money(text, integer, text),
  public.pos_save_money_move(jsonb),
  public.pos_cancel_money_move(uuid, text),
  public.pos_owner_money(timestamptz, timestamptz)
to authenticated;
