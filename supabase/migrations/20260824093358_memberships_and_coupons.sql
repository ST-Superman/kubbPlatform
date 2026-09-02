-- Kubb Platform — Memberships, entitlement, coupons & comps
--   Single source of truth for "is this account paid/active." Four writers, one gate:
--     • Stripe webhook (service role)        → paid 12-month purchases
--     • redeem_coupon(code)  [authenticated] → 'trial' (one per account) or 'gift' codes
--     • admin_grant_months() [service role]  → comp time to a known account, no code
--     • Beta free-for-all window             → everyone entitled until platform_config.beta_free_until
--
--   Entitlement = is_entitled(uid): true while the Beta window is open OR expires_at > now().
--   All grant paths STACK: extend from greatest(current expiry, now()) so early top-ups never
--   waste remaining time. This is the non-renewing model from VIRTUAL_MATCHES_PAYWALL_PLAN.md §5.1.
--
-- Apply with: supabase db push  (or paste into the Supabase SQL editor — migrations are not auto-applied)

-- ============ platform_config: single-row Beta free-for-all window ============
-- Flip the paywall on by setting beta_free_until to NULL (or a past date). No migration needed.
create table if not exists public.platform_config (
  id              boolean primary key default true check (id),  -- enforces a single row
  beta_free_until timestamptz,                                  -- everyone entitled while now() < this; NULL = beta over
  updated_at      timestamptz not null default now()
);

-- Default: free for 90 days from apply time. UPDATE this to the real Beta end date.
insert into public.platform_config (id, beta_free_until)
  values (true, now() + interval '90 days')
  on conflict (id) do nothing;

-- ============ memberships: single source of truth ============
create table if not exists public.memberships (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  expires_at        timestamptz,   -- access window end; NULL = never granted
  last_purchase_at  timestamptz,   -- set by the Stripe webhook
  trial_redeemed_at timestamptz,   -- set the first time a 'trial' code is redeemed (one-trial guard)
  stripe_customer_id text,
  updated_at        timestamptz not null default now()
);

-- ============ membership_purchases: Stripe idempotency + audit ============
-- Webhooks retry; the unique session id credits each Checkout at most once.
create table if not exists public.membership_purchases (
  stripe_session_id text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  amount_cents      integer,
  created_at        timestamptz not null default now()
);

-- ============ coupon_codes: the codes you text/email ============
-- max_redemptions: 1 = single-use (one recipient), N = shared cap, NULL = unlimited.
create table if not exists public.coupon_codes (
  code            text primary key,   -- stored/compared uppercased; see redeem_coupon
  kind            text not null check (kind in ('trial', 'gift')),
  grant_months    integer not null check (grant_months > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  times_redeemed  integer not null default 0,
  valid_until     timestamptz,        -- code unusable after this; NULL = no deadline (≠ membership expiry)
  label           text,               -- internal note, e.g. "beta friends batch 1"
  created_at      timestamptz not null default now()
);

-- ============ coupon_redemptions: who redeemed what (idempotency, audit, guard) ============
create table if not exists public.coupon_redemptions (
  code           text not null references public.coupon_codes(code) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null,
  granted_months integer not null,
  redeemed_at    timestamptz not null default now(),
  primary key (code, user_id)         -- a user can't redeem the same code twice
);

alter table public.platform_config     enable row level security;
alter table public.memberships          enable row level security;
alter table public.membership_purchases enable row level security;
alter table public.coupon_codes         enable row level security;
alter table public.coupon_redemptions   enable row level security;

-- Config is public-read (drives a "free during Beta" banner); only the service role writes it.
create policy platform_config_read on public.platform_config
  for select to authenticated using (true);

-- Self-read only. No client writes: grants come from the webhook (service role) and
-- security-definer RPCs, both of which bypass RLS.
create policy memberships_self_read on public.memberships
  for select to authenticated using (auth.uid() = user_id);
create policy purchases_self_read on public.membership_purchases
  for select to authenticated using (auth.uid() = user_id);
create policy redemptions_self_read on public.coupon_redemptions
  for select to authenticated using (auth.uid() = user_id);
-- coupon_codes intentionally has NO select policy → clients cannot enumerate or read codes.
-- Redemption goes only through redeem_coupon() (security definer), which bypasses RLS.

-- ============ is_entitled: the one gate (web + app + match RPCs) ============
create or replace function public.is_entitled(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select
    uid is not null
    and (
      -- Beta: everyone signed in is entitled while the window is open
      exists (
        select 1 from platform_config c
        where c.beta_free_until is not null and now() < c.beta_free_until
      )
      -- or a real active membership window
      or exists (
        select 1 from memberships m
        where m.user_id = uid and m.expires_at > now()
      )
    );
$$;

-- ============ my_membership: client read for the gate + "active until …" ============
-- Always returns exactly one row (even before any membership exists).
create or replace function public.my_membership()
returns table (
  expires_at      timestamptz,
  entitled        boolean,
  trial_redeemed  boolean,
  beta_free_until timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    m.expires_at,
    public.is_entitled(u.uid)               as entitled,
    (m.trial_redeemed_at is not null)        as trial_redeemed,
    (select beta_free_until from platform_config) as beta_free_until
  from (select auth.uid() as uid) u
  left join memberships m on m.user_id = u.uid;
$$;

-- ============ redeem_coupon: user-facing redemption (trial guard + stacked gift time) ============
-- Returns the new expires_at. Raises a coded exception on any failure so the web UI can map it
-- to friendly copy: invalid_code / code_expired / code_exhausted / already_redeemed /
-- trial_already_used / not_authenticated.
create or replace function public.redeem_coupon(p_code text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code coupon_codes;
  v_new  timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_code from coupon_codes
    where code = upper(btrim(p_code))
    for update;                      -- lock the row so concurrent redeems can't overshoot the cap
  if not found then
    raise exception 'invalid_code';
  end if;

  if v_code.valid_until is not null and now() > v_code.valid_until then
    raise exception 'code_expired';
  end if;

  if v_code.max_redemptions is not null and v_code.times_redeemed >= v_code.max_redemptions then
    raise exception 'code_exhausted';
  end if;

  if exists (select 1 from coupon_redemptions r where r.code = v_code.code and r.user_id = v_uid) then
    raise exception 'already_redeemed';
  end if;

  -- One trial per account, ever. Gift codes are exempt (rewards/comps stack freely).
  if v_code.kind = 'trial'
     and exists (select 1 from memberships m where m.user_id = v_uid and m.trial_redeemed_at is not null) then
    raise exception 'trial_already_used';
  end if;

  insert into coupon_redemptions (code, user_id, kind, granted_months)
    values (v_code.code, v_uid, v_code.kind, v_code.grant_months);
  update coupon_codes set times_redeemed = times_redeemed + 1 where code = v_code.code;

  -- Stacked extension: never waste remaining time.
  insert into memberships (user_id, expires_at, updated_at)
    values (v_uid, now() + make_interval(months => v_code.grant_months), now())
  on conflict (user_id) do update
    set expires_at = greatest(coalesce(memberships.expires_at, now()), now())
                     + make_interval(months => v_code.grant_months),
        updated_at = now()
  returning expires_at into v_new;

  if v_code.kind = 'trial' then
    update memberships set trial_redeemed_at = coalesce(trial_redeemed_at, now())
      where user_id = v_uid;
  end if;

  return v_new;
end;
$$;

-- ============ admin_grant_months: comp time to a known account (service role only) ============
-- For prizes, rewards, or thanking testers when you know the account — no code needed.
-- Stacks like every other path. p_reason is for your audit trail (logged via label on nothing
-- yet; kept in the signature for a future admin_grants table if you want one).
create or replace function public.admin_grant_months(p_user uuid, p_months int, p_reason text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_new timestamptz;
begin
  if p_months <= 0 then
    raise exception 'invalid_months';
  end if;
  insert into memberships (user_id, expires_at, updated_at)
    values (p_user, now() + make_interval(months => p_months), now())
  on conflict (user_id) do update
    set expires_at = greatest(coalesce(memberships.expires_at, now()), now())
                     + make_interval(months => p_months),
        updated_at = now()
  returning expires_at into v_new;
  return v_new;
end;
$$;

-- ============ create_coupon: mint a code (service role only) ============
-- Returns the code string to text/email. Pass p_code to set your own; omit for a random one.
create or replace function public.create_coupon(
  p_kind            text,
  p_grant_months    int,
  p_max_redemptions int default 1,
  p_valid_until     timestamptz default null,
  p_label           text default null,
  p_code            text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if p_kind not in ('trial', 'gift') then
    raise exception 'invalid_kind';
  end if;
  v_code := upper(btrim(coalesce(
    p_code,
    'KUBB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  )));
  insert into coupon_codes (code, kind, grant_months, max_redemptions, valid_until, label)
    values (v_code, p_kind, p_grant_months, p_max_redemptions, p_valid_until, p_label);
  return v_code;
end;
$$;

-- ============ grants ============
grant execute on function public.is_entitled(uuid)            to authenticated;
grant execute on function public.my_membership()             to authenticated;

revoke all on function public.redeem_coupon(text)            from public;
grant execute on function public.redeem_coupon(text)          to authenticated;

-- Admin/minting paths: service role only (SQL editor runs as owner and can also call them).
revoke all on function public.admin_grant_months(uuid, int, text)                    from public;
grant execute on function public.admin_grant_months(uuid, int, text)                  to service_role;
revoke all on function public.create_coupon(text, int, int, timestamptz, text, text) from public;
grant execute on function public.create_coupon(text, int, int, timestamptz, text, text) to service_role;
