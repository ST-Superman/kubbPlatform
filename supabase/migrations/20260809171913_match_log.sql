-- Kubb Platform — Phase 2 gold-plating: match_state adds games + current_turns
-- The three-column harness needs a turn log and per-game summaries. Redefine match_state
-- (unchanged body + two additions):
--   games:         [{game_number, winner}] for the match's games
--   current_turns: the latest game's turns (incl. voided, struck-through in the log) with
--                  the fields turnText needs + side + voided flag
-- Board state stays server-authoritative; the client renders these, never derives them.
--
-- Apply with: supabase db push

create or replace function match_state(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m record;
  v_parts jsonb;
  g record; st jsonb;
  w_a int := 0; w_b int := 0;
  cur_game uuid; cur_state jsonb; v_undo jsonb;
  v_games jsonb; v_last_game uuid; v_turns jsonb;
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

  -- per-game winner summaries (for the log's game header lines)
  select coalesce(jsonb_agg(jsonb_build_object(
           'game_number', gg.game_number,
           'winner', game_state(gg.id)->>'winner') order by gg.game_number), '[]'::jsonb)
    into v_games
  from games gg where gg.match_id = p_match_id;

  -- latest game (live or just finished) → its full turn list for the append-only log
  select id into v_last_game from games where match_id = p_match_id
  order by game_number desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'seq', t.seq,
           'side', mp.side,
           'voided', (t.voided_at is not null),
           'batons_field', t.batons_field,
           'batons_baseline', t.batons_baseline,
           'baseline_kubbs', t.baseline_kubbs,
           'base_kubb_double', t.base_kubb_double,
           'penalty_kubbs', t.penalty_kubbs,
           'field_kubbs_left', t.field_kubbs_left,
           'advantage_line', t.advantage_line,
           'king_shots', t.king_shots,
           'king_hit', t.king_hit,
           'king_hit_early', t.king_hit_early,
           'throw_line', t.throw_line) order by t.seq), '[]'::jsonb)
    into v_turns
  from turns t
  join match_participants mp on mp.id = t.participant_id
  where t.game_id = v_last_game;

  -- latest live turn across the match → what "undo last" / FIX targets
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
    'games', v_games,
    'current_game_id', cur_game,
    'current_state', cur_state,
    'current_turns', v_turns,
    'last_game_id', v_last_game,
    'next_seq', (cur_state->>'seq')::int,
    'undo_target', v_undo);
end $$;
