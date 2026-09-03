-- Kubb Platform — Paywall enforcement: gate virtual-match writes on is_entitled()
--   Plan §5.2. Enforced at the DATA LAYER via BEFORE INSERT triggers rather than editing
--   each (complex, multiply-redefined) write-path RPC — so every current and future path
--   that creates a match, plays a turn, or issues a challenge is gated in one place, and
--   none can forget the check.
--
--   Physical write points covered:
--     matches    ← create_match, _spawn_match
--     turns      ← submit_turn (all versions)
--     challenges ← create_challenge
--
--   The guard fires ONLY for authenticated users (auth.uid() is not null); service-role /
--   SQL-editor / harness inserts pass through as trusted infrastructure. During Beta,
--   is_entitled() returns true for everyone, so this is INERT until platform_config's
--   beta_free_until passes — shipping it now changes nothing until you flip Beta off.
--
--   Reads (match_state, history, stats, spectate) are NOT gated — only writes.
--
-- Apply with: supabase db push

create or replace function enforce_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- No auth.uid() → trusted server context (service role / SQL editor / harness) → allow.
  -- Authenticated caller → must be entitled (active membership, or inside the Beta window).
  if auth.uid() is not null and not public.is_entitled(auth.uid()) then
    raise exception 'membership_required';
  end if;
  return new;
end $$;

revoke all on function enforce_membership() from public;

-- Match creation (create_match, _spawn_match, any future path).
drop trigger if exists membership_gate_matches on matches;
create trigger membership_gate_matches
  before insert on matches
  for each row execute function enforce_membership();

-- Playing a turn (submit_turn, all versions).
drop trigger if exists membership_gate_turns on turns;
create trigger membership_gate_turns
  before insert on turns
  for each row execute function enforce_membership();

-- Issuing a challenge (create_challenge).
drop trigger if exists membership_gate_challenges on challenges;
create trigger membership_gate_challenges
  before insert on challenges
  for each row execute function enforce_membership();
