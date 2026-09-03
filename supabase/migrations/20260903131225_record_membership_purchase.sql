-- Kubb Platform — record_membership_purchase: credit a paid 12-month window (idempotent)
--   Called by the Stripe webhook (service role) on checkout.session.completed /
--   .async_payment_succeeded. Idempotent on the Checkout session id: the unique
--   membership_purchases row means a retried webhook credits at most once. On the FIRST
--   sighting of a session it stacks 12 months onto the membership (from the later of the
--   current expiry or now, so an early renewal never wastes remaining time) and records
--   last_purchase_at + the Stripe customer id.
--
--   Mirrors the coupon/comp crediting model from 20260824093358_memberships_and_coupons.sql.
--   service_role only.
--
-- Apply with: supabase db push

create or replace function record_membership_purchase(
  p_session_id  text,
  p_user_id     uuid,
  p_amount_cents int  default null,
  p_customer_id text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_expiry timestamptz;
begin
  -- Idempotency gate: one credit per Checkout session. On a retry this conflicts and
  -- inserts nothing, so FOUND is false and we skip crediting.
  insert into membership_purchases (stripe_session_id, user_id, amount_cents)
  values (p_session_id, p_user_id, p_amount_cents)
  on conflict (stripe_session_id) do nothing;

  if not found then
    select expires_at into v_expiry from memberships where user_id = p_user_id;
    return jsonb_build_object('credited', false, 'expires_at', v_expiry);
  end if;

  -- First time we've seen this session → stack a 12-month window.
  insert into memberships (user_id, expires_at, last_purchase_at, stripe_customer_id, updated_at)
  values (p_user_id, now() + interval '12 months', now(), p_customer_id, now())
  on conflict (user_id) do update
    set expires_at         = greatest(coalesce(memberships.expires_at, now()), now())
                             + interval '12 months',
        last_purchase_at   = now(),
        stripe_customer_id = coalesce(excluded.stripe_customer_id, memberships.stripe_customer_id),
        updated_at         = now()
  returning expires_at into v_expiry;

  return jsonb_build_object('credited', true, 'expires_at', v_expiry);
end $$;

revoke all on function record_membership_purchase(text, uuid, int, text)   from public;
grant execute on function record_membership_purchase(text, uuid, int, text) to service_role;
