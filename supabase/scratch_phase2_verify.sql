-- SCRATCH — Phase 2 Increment 1 verification. NOT a migration (kept out of migrations/).
-- Paste into the Supabase SQL editor. Two independent checks below.

-- ============================================================================
-- CHECK 1 — game_state replay (W10 acceptance). No auth needed; pure function.
-- Seeds a known 1v1 game A wins in 3 turns, exercising field play, an advantage
-- line, a base-kubb-double (+1 baseline), and a king-shot win. Fixed UUIDs so it's
-- re-runnable; a cleanup runs first. Leaves the test rows in place — remove with
-- the DELETEs at the very bottom when done.
-- ============================================================================

-- cleanup any prior run (cascade from matches clears participants/games/turns/lineups)
delete from matches  where id = '11111111-1111-1111-1111-111111111111';
delete from players   where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                                   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into players (id, user_id, display_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Test A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'Test B');

insert into matches (id, race_to, status, lag_winner_side, lag_value_a, lag_value_b, created_by)
values ('11111111-1111-1111-1111-111111111111', 2, 'live', 'A', '2', '5',
        (select id from auth.users limit 1));

insert into match_participants (id, match_id, side, player_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'A',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'B',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into games (id, match_id, game_number)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 1);

-- seq1: A throws 2 batons at B's baseline, hits 2  → B baseline 5→3, B gains 2 field kubbs
-- seq2: B throws 3 at field, fells 1, leaves 1 standing → sets advantage line 6ft, A gets it + 1 field kubb
-- seq3: A clears its field kubb (1 baton), then from the advantage line: 2 baseline hits + a
--        base-kubb-double (=3, clears B's remaining baseline), then 2 king shots, KING DOWN → A wins
insert into turns (id, game_id, participant_id, seq, batons_field, batons_baseline, throw_line,
                   baseline_kubbs, base_kubb_double, penalty_kubbs, field_kubbs_left,
                   advantage_line, king_shots, king_hit, king_hit_early, finished) values
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   1, 0, 2, '8m', 2, false, 0, 0, null, 0, false, false, false),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   2, 3, 0, '8m', 0, false, 0, 1, '6', 0, false, false, false),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   3, 1, 3, 'advantage', 2, true, 0, 0, null, 2, true, false, true);

-- EXPECTED game1_state:
--   winner "A", baseline {A:5,B:0}, field {A:0,B:5}, king_shots {A:2,B:0}, round_cap 6
-- EXPECTED match_state: status "live", games_won {A:1,B:0}, current_game_id null,
--   participants A=Test A / B=Test B, lag winner_side "A"
select game_state('22222222-2222-2222-2222-222222222222') as game1_state,
       match_state('11111111-1111-1111-1111-111111111111') as match_state;

-- cleanup when finished (uncomment):
-- delete from matches where id = '11111111-1111-1111-1111-111111111111';
-- delete from players  where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');


-- ============================================================================
-- CHECK 2 — setup RPCs with a simulated auth.uid() (run separately).
-- Replace the two UUIDs with real auth.users ids that HAVE a players row + profile
-- handle (any two accounts you signed up). Run the whole block as one statement batch.
-- ============================================================================
-- begin;
--   -- act as user 1
--   select set_config('request.jwt.claims', json_build_object('sub','<USER1_UUID>')::text, true);
--   select create_match(2, '<USER2_HANDLE>');            -- returns { match_id }
--   -- grab the match_id from the result, then (still as user 1) submit A's lag:
--   select submit_lag('<MATCH_ID>', 'A', '3');           -- { status: "waiting" }
--   -- act as user 2 and submit B's lag:
--   select set_config('request.jwt.claims', json_build_object('sub','<USER2_UUID>')::text, true);
--   select submit_lag('<MATCH_ID>', 'B', '8');           -- { status: "live", lag_winner_side: "A" }
--   select match_state('<MATCH_ID>');                    -- status live, game 1 exists, first thrower A
--   -- tie check: two equal values → { status: "tie" } and both lag values cleared
-- rollback;   -- nothing persists
