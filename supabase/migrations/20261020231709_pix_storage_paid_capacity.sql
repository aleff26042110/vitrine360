-- Preserve the free-service R2 guard, with capacity funded by active paid plans.
create function billing_private.paid_r2_capacity()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case plan_key when 'essential' then 1000000000::bigint when 'professional' then 3000000000::bigint when 'business' then 10000000000::bigint else 0 end),0)::bigint
  from public.billing_pix_access where valid_until > now();
$$;
revoke all on function billing_private.paid_r2_capacity() from public, anon, authenticated;
do $$
declare v_definition text; v_old text := 'v_bytes + p_bytes > v_budget.max_bytes';
begin
  select pg_get_functiondef('public.r2_gateway(text,uuid,text,text,bigint,text,uuid,text)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then raise exception 'billing_r2_budget_guard_missing'; end if;
  execute replace(v_definition,v_old,v_old || ' + billing_private.paid_r2_capacity()');
end;
$$;
