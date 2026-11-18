-- Stock & POS: edit a customer's name, phone and note (any shop user, like
-- adding one at the till). The phone stays unique: a number already used by
-- another customer is refused, naming them.
create function public.pos_update_customer(p_customer_id uuid, p_name text, p_phone text, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing text;
begin
  if not private.is_member() then
    raise exception 'Sign in again to edit customers.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 100 then
    raise exception 'Enter the customer''s name (up to 100 characters).' using errcode = '22023';
  end if;
  if p_phone is not null and p_phone !~ '^233[0-9]{9}$' then
    raise exception 'Enter a Ghana number like 024 123 4567, or leave it empty.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  if p_phone is not null then
    select name into v_existing from public.customers where phone = p_phone and id <> p_customer_id;
    if found then
      raise exception 'This number belongs to %. Each customer needs their own number.', v_existing using errcode = '23505';
    end if;
  end if;
  update public.customers
  set name = btrim(p_name), phone = p_phone, notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_customer_id;
  if not found then
    raise exception 'This customer no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.pos_update_customer(uuid, text, text, text) from public, anon;
grant execute on function public.pos_update_customer(uuid, text, text, text) to authenticated;
