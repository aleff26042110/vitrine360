-- pg_net's default queue grants must not expose scheduler authentication headers.
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;

-- Rotate the server-only scheduler credential after locking down the queue.
do $$
declare v_token text; v_secret uuid;
begin
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  select id into strict v_secret from vault.secrets where name='vitrine360_pix_reconcile_key';
  perform vault.update_secret(v_secret,v_token);
  update billing_private.reconcile_config set token_hash=sha256(convert_to(v_token,'UTF8')),next_run='-infinity' where singleton;
end;
$$;
