-- Kubb Platform — challenges (accept-first match proposals)
--   A challenge is a proposal that becomes a real match only when accepted.
--   - Account opponent (user_id set): pending challenge → accept/decline.
--   - Managed opponent (user_id null, my own): no acceptance → match created now.
--   The match lifecycle, stats, and list queries are untouched — a match still only
--   exists once play is agreed. Writes go through SECURITY DEFINER RPCs (players pattern).
--
-- Apply with: supabase db push

create table if not exists challenges (
  id           uuid primary key default gen_random_uuid(),
  from_player  uuid not null references players(id) on delete cascade,
  to_player    uuid not null references players(id) on delete cascade,
  race_to      int  not null check (race_to between 1 and 9),
  status       text not null default 'pending'
               check (status in ('pending','accepted','declined','cancelled')),
  match_id     uuid references matches(id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_player <> to_player)
);

-- At most one outstanding pending challenge per direction.
create unique index if not exists challenges_pending_uniq
  on challenges (from_player, to_player) where status = 'pending';
create index if not exists challenges_to_pending_idx
  on challenges (to_player) where status = 'pending';

alter table challenges enable row level security;
drop policy if exists challenges_select on challenges;
create policy challenges_select on challenges for select to authenticated
  using (exists (
    select 1 from players p
    where p.id in (from_player, to_player) and p.user_id = auth.uid()
  ));

-- ===== internal: spawn the match + participants + lineups; returns match id =====
create or replace function _spawn_match(
  p_from_player uuid, p_to_player uuid, p_race_to int, p_created_by uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_match uuid; v_pa uuid; v_pb uuid;
begin
  insert into matches (race_to, status, created_by)
  values (p_race_to, 'created', p_created_by) returning id into v_match;
  insert into match_participants (match_id, side, player_id)
  values (v_match, 'A', p_from_player) returning id into v_pa;
  insert into match_participants (match_id, side, player_id)
  values (v_match, 'B', p_to_player) returning id into v_pb;
  insert into match_lineups (participant_id, player_id)
  values (v_pa, p_from_player), (v_pb, p_to_player);
  return v_match;
end $$;

-- ===== create_challenge =====
create or replace function create_challenge(p_opponent_player_id uuid, p_race_to int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_my_player uuid; v_opp record; v_match uuid; v_challenge uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_race_to is null or p_race_to < 1 or p_race_to > 9 then raise exception 'race_to_range'; end if;
  if p_opponent_player_id is null then raise exception 'opponent_required'; end if;

  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then raise exception 'no_player_for_account'; end if;
  if p_opponent_player_id = v_my_player then raise exception 'cannot_play_self'; end if;

  select id, user_id, created_by into v_opp from players where id = p_opponent_player_id;
  if v_opp.id is null then raise exception 'opponent_not_found'; end if;

  -- Managed opponent (no account): must be mine; nothing to accept → create match now.
  if v_opp.user_id is null then
    if v_opp.created_by is distinct from v_me then raise exception 'opponent_not_found'; end if;
    v_match := _spawn_match(v_my_player, p_opponent_player_id, p_race_to, v_me);
    return jsonb_build_object('match_id', v_match);
  end if;

  -- Account opponent → pending challenge.
  begin
    insert into challenges (from_player, to_player, race_to)
    values (v_my_player, p_opponent_player_id, p_race_to)
    returning id into v_challenge;
  exception when unique_violation then
    raise exception 'challenge_exists';
  end;
  return jsonb_build_object('challenge_id', v_challenge);
end $$;

-- ===== list_my_challenges =====
create or replace function list_my_challenges() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; arr jsonb;
begin
  if v_me is null then return '[]'::jsonb; end if;
  select id into v_my_player from players where user_id = v_me;
  if v_my_player is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb) into arr
  from (
    select jsonb_build_object(
      'id', c.id,
      'direction', case when c.to_player = v_my_player then 'incoming' else 'outgoing' end,
      'race_to', c.race_to,
      'created_at', c.created_at,
      'other_display_name', op.display_name,
      'other_handle', opr.handle::text
    ) as row
    from challenges c
    join players op
      on op.id = case when c.to_player = v_my_player then c.from_player else c.to_player end
    left join profiles opr on opr.id = op.user_id
    where c.status = 'pending' and v_my_player in (c.from_player, c.to_player)
  ) sub;
  return arr;
end $$;

-- ===== accept_challenge =====
create or replace function accept_challenge(p_challenge_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; c record; v_match uuid;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  select * into c from challenges where id = p_challenge_id;
  if c.id is null then raise exception 'challenge_not_found'; end if;
  if c.to_player is distinct from v_my_player then raise exception 'not_your_challenge'; end if;
  if c.status <> 'pending' then raise exception 'challenge_not_pending'; end if;

  v_match := _spawn_match(c.from_player, c.to_player, c.race_to, v_me);
  update challenges set status = 'accepted', match_id = v_match, responded_at = now()
   where id = c.id;
  return jsonb_build_object('match_id', v_match);
end $$;

-- ===== decline_challenge =====
create or replace function decline_challenge(p_challenge_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; c record;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  select * into c from challenges where id = p_challenge_id;
  if c.id is null then raise exception 'challenge_not_found'; end if;
  if c.to_player is distinct from v_my_player then raise exception 'not_your_challenge'; end if;
  if c.status <> 'pending' then raise exception 'challenge_not_pending'; end if;
  update challenges set status = 'declined', responded_at = now() where id = c.id;
end $$;

-- ===== cancel_challenge =====
create or replace function cancel_challenge(p_challenge_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_my_player uuid; c record;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  select id into v_my_player from players where user_id = v_me;
  select * into c from challenges where id = p_challenge_id;
  if c.id is null then raise exception 'challenge_not_found'; end if;
  if c.from_player is distinct from v_my_player then raise exception 'not_your_challenge'; end if;
  if c.status <> 'pending' then raise exception 'challenge_not_pending'; end if;
  update challenges set status = 'cancelled', responded_at = now() where id = c.id;
end $$;

-- ===== grants (_spawn_match stays internal — called only by the definer RPCs) =====
revoke all on function _spawn_match(uuid, uuid, int, uuid) from public;
revoke all on function create_challenge(uuid, int)  from public;
revoke all on function list_my_challenges()          from public;
revoke all on function accept_challenge(uuid)        from public;
revoke all on function decline_challenge(uuid)       from public;
revoke all on function cancel_challenge(uuid)        from public;
grant execute on function create_challenge(uuid, int) to authenticated;
grant execute on function list_my_challenges()         to authenticated;
grant execute on function accept_challenge(uuid)       to authenticated;
grant execute on function decline_challenge(uuid)      to authenticated;
grant execute on function cancel_challenge(uuid)       to authenticated;
