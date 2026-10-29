-- When the shop replies to WhatsApp orders, shown in the footer, the cart and
-- after ordering. Outside these hours the site says when the shop will reply.
-- Times are Ghana time (GMT all year). reply_days: 1 = Monday ... 7 = Sunday.
alter table public.settings
  add column response_promise text check (response_promise is null or char_length(response_promise) <= 120),
  add column reply_open time,
  add column reply_close time,
  add column reply_days smallint[] not null default '{1,2,3,4,5,6}'
    check (reply_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add constraint settings_reply_hours_valid check (
    (reply_open is null and reply_close is null)
    or (reply_open is not null and reply_close is not null and reply_close > reply_open)
  );

update public.settings
set response_promise = 'We reply within 30 minutes', reply_open = '07:00', reply_close = '19:30'
where id = 1;
