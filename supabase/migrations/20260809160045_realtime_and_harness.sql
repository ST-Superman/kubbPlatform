-- Kubb Platform — Phase 2 (Increment 3): realtime broadcast + harness helpers
--   1. game_state: expose next `seq` (client needs it for submit_turn p_expected_seq)
--   2. match_state: expose next_seq + undo_target (latest live turn) for the harness
--   3. Broadcast-from-DB: AFTER triggers on turns/games/matches push fresh match_state
--      on topic 'match:<id>' via realtime.send (public topic → no realtime.messages RLS).
--      Best-effort (exception-swallowed) so a realtime hiccup never fails a write.
--   4. list_my_matches(): the /matches list.
--
-- Triggers (not RPC edits) so the verified submit_turn/rewind_to/submit_lag bodies are
-- untouched and ANY state change broadcasts regardless of which path caused it.
--
-- Apply with: supabase db push

-- ============ game_state (+ seq) ============
create or replace function game_state(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  base_a int := 5; base_b int := 5;
  field_a int := 0; field_b int := 0;
  adv_a text; adv_b text;
  ks_a int := 0; ks_b int := 0;
  rounds int := 0;
  winner text; next_side text;
  x text; felled_field int; bl_total int;
begin
  select case when g2.game_number % 2 = 1 then m.lag_winner_side
              when m.lag_winner_side = 'A' then 'B' else 'A' end
    into next_side
  from games g2 join matches m on m.id = g2.match_id where g2.id = p_game_id;

  for t in
    select tu.*, mp.side from turns tu
    join match_participants mp on mp.id = tu.participant_id
    where tu.game_id = p_game_id and tu.voided_at is null
    order by tu.seq
  loop
    x := t.side; rounds := rounds + 1;
    if x = 'A' then ks_a := ks_a + t.king_shots; else ks_b := ks_b + t.king_shots; end if;
    if t.king_hit_early and t.finished then
      winner := case when x = 'A' then 'B' else 'A' end; exit;
    end if;
    bl_total := t.baseline_kubbs + (t.base_kubb_double)::int;
    if x = 'A' then
      felled_field := field_a - t.field_kubbs_left;
      base_b := base_b - bl_total;
      field_a := t.field_kubbs_left;
      field_b := field_b + felled_field + bl_total;
      adv_a := null;
      adv_b := case when t.field_kubbs_left > 0 then t.advantage_line end;
    else
      felled_field := field_b - t.field_kubbs_left;
      base_a := base_a - bl_total;
      field_b := t.field_kubbs_left;
      field_a := field_a + felled_field + bl_total;
      adv_b := null;
      adv_a := case when t.field_kubbs_left > 0 then t.advantage_line end;
    end if;
    if t.king_hit and t.finished then winner := x; exit; end if;
    next_side := case when x = 'A' then 'B' else 'A' end;
  end loop;

  return jsonb_build_object(
    'baseline', jsonb_build_object('A', base_a, 'B', base_b),
    'field',    jsonb_build_object('A', field_a, 'B', field_b),
    'advantage',jsonb_build_object('A', adv_a, 'B', adv_b),
    'king_shots',jsonb_build_object('A', ks_a, 'B', ks_b),
    'winner', winner, 'next_side', next_side,
    'seq', rounds + 1,                                  -- NEW: next expected turn seq
    'round_cap', case when rounds + 1 = 1 then 2 when rounds + 1 = 2 then 4 else 6 end);
end $$;

-- ============ match_state (+ next_seq, undo_target) ============
create or replace function match_state(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m record;
  v_parts jsonb;
  g record; st jsonb;
  w_a int := 0; w_b int := 0;
  cur_game uuid; cur_state jsonb; v_undo jsonb;
begin
  select * into m from matches where id = p_match_id;
  if not found then raise exception 'not_found'; end if;

  select jsonb_object_agg(mp.side, jsonb_build_object(
           'participant_id', mp.id,
           'player_id', mp.player_id,
           'team_id', mp.team_id,
           'display_name', pl.display_name,
           'user_id', pl.user_id))
    into v_parts
  from match_participants mp
  left join players pl on pl.id = mp.player_id
  where mp.match_id = p_match_id;

  for g in select id from games where match_id = p_match_id order by game_number loop
    st := game_state(g.id);
    if st->>'winner' = 'A' then w_a := w_a + 1;
    elsif st->>'winner' = 'B' then w_b := w_b + 1;
    else cur_game := g.id; cur_state := st;
    end if;
  end loop;

  -- latest live turn across the match → what "undo last" targets (works even when finished)
  select jsonb_build_object('game_id', t.game_id, 'seq', t.seq)
    into v_undo
  from turns t join games g2 on g2.id = t.game_id
  where g2.match_id = p_match_id and t.voided_at is null
  order by g2.game_number desc, t.seq desc
  limit 1;

  return jsonb_build_object(
    'match_id', m.id,
    'race_to', m.race_to,
    'status', m.status,
    'lag', jsonb_build_object('winner_side', m.lag_winner_side, 'a', m.lag_value_a, 'b', m.lag_value_b),
    'participants', coalesce(v_parts, '{}'::jsonb),
    'games_won', jsonb_build_object('A', w_a, 'B', w_b),
    'current_game_id', cur_game,
    'current_state', cur_state,
    'next_seq', (cur_state->>'seq')::int,               -- NEW
    'undo_target', v_undo);                              -- NEW
end $$;

-- ============ broadcast_match_state (trigger) ============
create or replace function broadcast_match_state() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_match uuid;
begin
  v_match := case tg_table_name
    when 'matches' then coalesce(new.id, old.id)
    when 'games'   then coalesce(new.match_id, old.match_id)
    when 'turns'   then (select match_id from games where id = coalesce(new.game_id, old.game_id))
  end;
  if v_match is not null then
    begin
      perform realtime.send(match_state(v_match), 'state', 'match:' || v_match::text, false);
    exception when others then
      null;  -- best-effort: a realtime failure must never abort the underlying write
    end;
  end if;
  return null;
end $$;

drop trigger if exists trg_broadcast_turns on turns;
create trigger trg_broadcast_turns after insert or update or delete on turns
  for each row execute function broadcast_match_state();

drop trigger if exists trg_broadcast_games on games;
create trigger trg_broadcast_games after insert or delete on games
  for each row execute function broadcast_match_state();

drop trigger if exists trg_broadcast_matches on matches;
create trigger trg_broadcast_matches after update on matches
  for each row execute function broadcast_match_state();

-- ============ list_my_matches ============
create or replace function list_my_matches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'match_id', m.id,
      'status', m.status,
      'race_to', m.race_to,
      'created_at', m.created_at,
      'my_side', (select mp.side from match_participants mp join players p on p.id = mp.player_id
                  where mp.match_id = m.id and p.user_id = auth.uid() limit 1),
      'opponent', (select pl.display_name from match_participants mp2 join players pl on pl.id = mp2.player_id
                   where mp2.match_id = m.id and pl.user_id is distinct from auth.uid() limit 1)
    ) as row
    from matches m
    where m.created_by = auth.uid()
       or exists (select 1 from match_participants mp join players p on p.id = mp.player_id
                  where mp.match_id = m.id and p.user_id = auth.uid())
  ) sub;
$$;

revoke all on function list_my_matches() from public;
grant execute on function list_my_matches() to authenticated;
