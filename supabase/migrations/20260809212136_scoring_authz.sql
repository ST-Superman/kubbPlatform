-- Kubb Platform — fix: don't let the match creator act for a REAL opponent
-- The "creator can score both sides" path (added so a solo tester can drive a match
-- against a MANAGED player) also let the creator enter a claimed opponent's lag/turns.
-- New rule via can_act(match, side): you may act for a side iff it is your own account,
-- OR it is a managed player (user_id NULL) and you created the match.
--
-- Apply with: supabase db push

-- ============ can_act ============
create or replace function can_act(p_match_id uuid, p_side text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from match_participants mp
    join players p on p.id = mp.player_id
    join matches m on m.id = mp.match_id
    where mp.match_id = p_match_id and mp.side = p_side
      and (p.user_id = auth.uid()
           or (p.user_id is null and m.created_by = auth.uid()))
  );
$$;
revoke all on function can_act(uuid, text) from public;
grant execute on function can_act(uuid, text) to authenticated;

-- ============ submit_lag (authz via can_act; returns full match_state) ============
create or replace function submit_lag(p_match_id uuid, p_side text, p_value text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  m record;
  ra numeric; rb numeric; v_winner text;
begin
  if v_me is null then raise exception 'auth_required'; end if;
  if p_side not in ('A','B') then raise exception 'bad_side'; end if;
  if coalesce(btrim(p_value),'') = '' then raise exception 'lag_value_required'; end if;

  select * into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;
  if m.status <> 'created' then raise exception 'not_in_lag'; end if;
  if not can_act(p_match_id, p_side) then raise exception 'forbidden'; end if;

  if p_side = 'A' then
    update matches set lag_value_a = p_value where id = p_match_id;
  else
    update matches set lag_value_b = p_value where id = p_match_id;
  end if;

  select * into m from matches where id = p_match_id;   -- re-read both values
  if m.lag_value_a is not null and m.lag_value_b is not null then
    ra := case when m.lag_value_a in ('0.1','.1') then 0.05 else m.lag_value_a::numeric end;
    rb := case when m.lag_value_b in ('0.1','.1') then 0.05 else m.lag_value_b::numeric end;
    if ra = rb then
      update matches set lag_value_a = null, lag_value_b = null where id = p_match_id;  -- tie → re-lag
    else
      v_winner := case when ra < rb then 'A' else 'B' end;
      update matches set lag_winner_side = v_winner, status = 'live' where id = p_match_id;
      insert into games (match_id, game_number) values (p_match_id, 1);
    end if;
  end if;

  return match_state(p_match_id);
end $$;

-- ============ submit_turn (authz via can_act; body otherwise unchanged) ============
create or replace function submit_turn(
  p_turn_id uuid,
  p_game_id uuid,
  p_token uuid,
  p_expected_seq int,
  p_batons_field int, p_batons_baseline int, p_baseline_kubbs int,
  p_base_kubb_double boolean, p_penalty_kubbs int, p_field_kubbs_left int,
  p_advantage_line text, p_king_shots int,
  p_king_hit boolean, p_king_hit_early boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid; s jsonb; x text; o text; participant uuid;
  cap int; used int; field_x int; base_o int; adv_x text;
  bl_total int; felled_field int; fin boolean;
  v_race_to int; w_a int := 0; w_b int := 0; g record; gs jsonb; v_gnum int;
begin
  select match_id into v_match from games where id = p_game_id;
  if v_match is null then raise exception 'game_not_found'; end if;

  -- 0. idempotency
  if exists (select 1 from turns where id = p_turn_id) then
    return match_state(v_match) || jsonb_build_object('duplicate', true);
  end if;

  s := game_state(p_game_id);
  if s->>'winner' is not null then raise exception 'game_over'; end if;
  x := s->>'next_side';
  o := case when x = 'A' then 'B' else 'A' end;

  -- 1. authz: caller may act for the acting side (own account, or a managed side
  --    they created). A real opponent must submit their own turns.
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if not can_act(v_match, x) then raise exception 'forbidden'; end if;

  select id into participant from match_participants where match_id = v_match and side = x;

  -- 2. concurrency
  if p_expected_seq is distinct from
     (select coalesce(max(seq),0)+1 from turns where game_id = p_game_id and voided_at is null)
  then return match_state(v_match) || jsonb_build_object('already_scored', true); end if;

  -- 3. VALIDATION — mirrors buildErrors() (same order, same rules) + range guards
  cap := (s->>'round_cap')::int;
  used := p_batons_field + p_batons_baseline + p_king_shots;
  field_x := (s->'field'->>x)::int;
  base_o  := (s->'baseline'->>o)::int;
  adv_x   := s->'advantage'->>x;
  bl_total := p_baseline_kubbs + p_base_kubb_double::int;
  felled_field := field_x - p_field_kubbs_left;

  if used > cap then raise exception 'batons_over_cap'; end if;
  if used = 0 and not p_king_hit_early then raise exception 'no_batons'; end if;
  if p_batons_field = 0 and felled_field > 0 then raise exception 'field_batons_missing'; end if;
  if p_field_kubbs_left < 0 or p_field_kubbs_left > field_x then raise exception 'field_left_range'; end if;
  if p_field_kubbs_left > 0 and (p_batons_baseline > 0 or p_baseline_kubbs > 0
     or p_base_kubb_double or p_king_shots > 0 or p_king_hit)
    then raise exception 'field_blocks_baseline'; end if;
  if p_field_kubbs_left > 0 and p_advantage_line is null then raise exception 'advantage_line_required'; end if;
  if p_base_kubb_double and field_x = 0 then raise exception 'double_needs_field'; end if;
  if p_baseline_kubbs > p_batons_baseline then raise exception 'hits_exceed_batons'; end if;
  if bl_total > base_o then raise exception 'baseline_over_remaining'; end if;
  if base_o = 0 and p_batons_baseline > 0 then raise exception 'baseline_clear_use_king_shots'; end if;
  if p_penalty_kubbs < 0 or p_penalty_kubbs > field_x then raise exception 'penalty_range'; end if;
  if p_king_shots > 0 and not (base_o - bl_total = 0 and p_field_kubbs_left = 0)
    then raise exception 'king_too_early_range'; end if;
  if p_king_hit and p_king_shots = 0 then raise exception 'king_hit_needs_shot'; end if;
  if p_king_hit and p_king_hit_early then raise exception 'king_flags_conflict'; end if;

  fin := p_king_hit or p_king_hit_early;

  -- 4. append
  insert into turns (id, game_id, participant_id, seq, batons_field, batons_baseline,
    throw_line, baseline_kubbs, base_kubb_double, penalty_kubbs, field_kubbs_left,
    advantage_line, king_shots, king_hit, king_hit_early, finished)
  values (p_turn_id, p_game_id, participant, p_expected_seq, p_batons_field, p_batons_baseline,
    case when adv_x is not null then 'advantage' else '8m' end,
    p_baseline_kubbs, p_base_kubb_double, p_penalty_kubbs, p_field_kubbs_left,
    case when p_field_kubbs_left > 0 then p_advantage_line end,
    p_king_shots, p_king_hit, p_king_hit_early, fin);

  -- 5. game end → finish match (race-to-N) or spawn the next game
  if fin then
    for g in select id from games where match_id = v_match loop
      gs := game_state(g.id);
      if gs->>'winner' = 'A' then w_a := w_a + 1;
      elsif gs->>'winner' = 'B' then w_b := w_b + 1; end if;
    end loop;
    select race_to into v_race_to from matches where id = v_match;
    if w_a >= v_race_to or w_b >= v_race_to then
      update matches set status = 'finished' where id = v_match;
    else
      select coalesce(max(game_number),0)+1 into v_gnum from games where match_id = v_match;
      insert into games (match_id, game_number) values (v_match, v_gnum);
    end if;
  end if;

  return match_state(v_match);
end $$;

-- ============ rewind_to (authz via can_act; body otherwise unchanged) ============
create or replace function rewind_to(p_game_id uuid, p_seq int, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid; v_gnum int; v_race_to int;
  w_a int := 0; w_b int := 0; g record; gs jsonb;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select match_id, game_number into v_match, v_gnum from games where id = p_game_id;
  if v_match is null then raise exception 'game_not_found'; end if;

  -- authz: you may rewind a match you play in (either side you can act for)
  if not (can_act(v_match, 'A') or can_act(v_match, 'B')) then raise exception 'forbidden'; end if;

  update turns set voided_at = now()
   where game_id = p_game_id and seq >= p_seq and voided_at is null;

  delete from games gx
   where gx.match_id = v_match and gx.game_number > v_gnum
     and not exists (select 1 from turns t where t.game_id = gx.id and t.voided_at is null);

  for g in select id from games where match_id = v_match loop
    gs := game_state(g.id);
    if gs->>'winner' = 'A' then w_a := w_a + 1;
    elsif gs->>'winner' = 'B' then w_b := w_b + 1; end if;
  end loop;
  select race_to into v_race_to from matches where id = v_match;
  update matches
     set status = case when w_a >= v_race_to or w_b >= v_race_to then 'finished' else 'live' end
   where id = v_match and status <> 'abandoned';

  return match_state(v_match);
end $$;
