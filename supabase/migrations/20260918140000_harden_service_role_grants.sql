-- Kubb Platform — SECURITY: lock service_role-only functions from anon/authenticated
--
--   Found by a grant sweep (2026-09-18): several SECURITY DEFINER functions that have
--   NO internal auth check — they rely solely on their grant for protection — were
--   executable by `anon` and `authenticated`. Because the anon key ships in the web
--   bundle, an UNAUTHENTICATED caller could hit /rest/v1/rpc/<fn> and:
--     • record_membership_purchase / admin_grant_months / create_coupon → grant
--       themselves paid membership or mint coupons (revenue bypass),
--     • admin_delete_user → delete any account,
--     • merge_players → merge/destroy player records,
--     • challenge_email_payload / message_digest_payload → harvest emails,
--     • message_push_payload → read device tokens,
--     • dispatch_message_digest → trigger digest emails.
--
--   Root cause: Supabase grants anon/authenticated broad EXECUTE; these admin/internal
--   functions were never revoked. Fix = revoke from public/anon/authenticated and keep
--   service_role only (they're called by the Stripe webhook, Edge Functions, the digest
--   cron, and the SQL editor / admin tooling as postgres|service_role — never the client).
--
--   NOTE: applied MANUALLY — paste into the Supabase SQL editor and run.

-- ---- revoke client roles -----------------------------------------------------
revoke all on function admin_delete_user(uuid, uuid)                                   from public, anon, authenticated;
revoke all on function admin_grant_months(uuid, integer, text)                         from public, anon, authenticated;
revoke all on function create_coupon(text, integer, integer, timestamptz, text, text)  from public, anon, authenticated;
revoke all on function record_membership_purchase(text, uuid, integer, text)           from public, anon, authenticated;
revoke all on function merge_players(uuid, uuid, boolean)                              from public, anon, authenticated;
revoke all on function challenge_email_payload(uuid, text)                             from public, anon, authenticated;
revoke all on function dispatch_message_digest(text)                                   from public, anon, authenticated;
revoke all on function message_digest_payload(text)                                    from public, anon, authenticated;
revoke all on function message_push_payload(uuid)                                      from public, anon, authenticated;

-- ---- keep the legitimate service_role callers working ------------------------
grant execute on function admin_delete_user(uuid, uuid)                                   to service_role;
grant execute on function admin_grant_months(uuid, integer, text)                         to service_role;
grant execute on function create_coupon(text, integer, integer, timestamptz, text, text)  to service_role;
grant execute on function record_membership_purchase(text, uuid, integer, text)           to service_role;
grant execute on function merge_players(uuid, uuid, boolean)                              to service_role;
grant execute on function challenge_email_payload(uuid, text)                             to service_role;
grant execute on function dispatch_message_digest(text)                                   to service_role;
grant execute on function message_digest_payload(text)                                    to service_role;
grant execute on function message_push_payload(uuid)                                      to service_role;

-- ---- internal helpers: never client-callable (parents call them as owner) ----
--   These have no internal auth guard and are only meant to be invoked BY other
--   SECURITY DEFINER functions (which run as the owner, so they keep access). Most
--   important: _merge_player_rows is the destructive merge that merge_players calls —
--   locking merge_players above is moot if the inner one stays anon-callable.
revoke all on function _merge_player_rows(uuid, uuid)          from public, anon, authenticated;
revoke all on function _spawn_match(uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function _claim_managed_player(uuid, uuid)       from public, anon, authenticated;
revoke all on function _group_addable(uuid, uuid)             from public, anon, authenticated;
revoke all on function _is_group_owner(uuid, uuid)            from public, anon, authenticated;
revoke all on function derive_clone_stats(uuid)               from public, anon, authenticated;
revoke all on function compute_turn_metrics(uuid[])           from public, anon, authenticated;
revoke all on function rls_auto_enable()                      from public, anon, authenticated;

-- ---- verify (every row should be authed=f, anon=f) ---------------------------
-- select p.proname,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in (
--   'admin_delete_user','admin_grant_months','create_coupon','record_membership_purchase',
--   'merge_players','challenge_email_payload','dispatch_message_digest',
--   'message_digest_payload','message_push_payload')
-- order by p.proname;
--
-- Note: redeem_coupon is intentionally left alone — it checks auth.uid() internally
-- ('not_authenticated'), so it's safe for authenticated users to call.
