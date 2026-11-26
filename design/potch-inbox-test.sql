create function moh16_private.create_potch_test_notification()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c constant uuid := 'debd20d7-ab61-490e-ab73-1d37b55cb389';
  u uuid := auth.uid();
begin
  if u is null or not moh16_private.has_membership(c) then
    raise exception 'Active Potchefstroom membership required' using errcode = '42501';
  end if;
  insert into public.moh16_notifications(church_id,user_id,kind,title,body,dedupe_key)
  values(c,u,'test','Test ministry notification','Your CRC MoH inbox is receiving notifications.',
    'potch-inbox-test:' || (now() at time zone 'Africa/Johannesburg')::date::text)
  on conflict(church_id,user_id,dedupe_key) do nothing;
  return found;
end;
$$;
revoke all on function moh16_private.create_potch_test_notification() from public, anon;
grant execute on function moh16_private.create_potch_test_notification() to authenticated;
create function public.moh16_create_potch_test_notification()
returns boolean language sql set search_path = '' as $$
  select moh16_private.create_potch_test_notification();
$$;
revoke all on function public.moh16_create_potch_test_notification() from public, anon;
grant execute on function public.moh16_create_potch_test_notification() to authenticated;
