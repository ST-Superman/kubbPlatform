-- SCRATCH — Phase 2 verification. NOT a migration (kept out of migrations/).
-- Paste blocks into the Supabase SQL editor. Each check is independent.

-- ============================================================================
-- CHECK 1 — game_state replay (W10 acceptance). No auth needed; pure function.
-- Seeds a known 1v1 game A wins in 3 turns (field play, an advantage line, a
-- base-kubb-double +1 baseline, and a king-shot win). Fixed UUIDs + re-runnable:
-- the cleanup deletes turns BEFORE the match so the participant FK never blocks it.
-- ============================================================================

delete from turns   where game_id in (select id from games where match_id = '11111111-1111-1111-1111-111111111111');
delete from matches where id = '11111111-1111-1111-1111-111111111111';
delete from players where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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
-- seq2: B throws 3 at field, fells 1, leaves 1 standing → advantage line 6ft, A gets it + 1 field kubb
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

-- EXPECTED game1_state: winner "A", baseline {A:5,B:0}, field {A:0,B:5}, king_shots {A:2,B:0}, round_cap 6
-- EXPECTED match_state: status "live", games_won {A:1,B:0}, current_game_id null, lag winner_side "A"
select game_state('22222222-2222-2222-2222-222222222222') as game1_state,
       match_state('11111111-1111-1111-1111-111111111111') as match_state;

-- cleanup when done (uncomment; turns first, then match):
-- delete from turns   where game_id = '22222222-2222-2222-2222-222222222222';
-- delete from matches where id = '11111111-1111-1111-1111-111111111111';
-- delete from players where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');


-- ============================================================================
-- CHECK 2 — setup RPCs with a simulated auth.uid(). Replace the UUIDs/handle with
-- two real accounts you signed up (each has a players row + profile handle).
-- ============================================================================
-- begin;
--   select set_config('request.jwt.claims', json_build_object('sub','<USER1_UUID>')::text, true);
--   select create_match(2, '<USER2_HANDLE>');            -- { match_id }
--   select submit_lag('<MATCH_ID>', 'A', '3');           -- { status: "waiting" }
--   select set_config('request.jwt.claims', json_build_object('sub','<USER2_UUID>')::text, true);
--   select submit_lag('<MATCH_ID>', 'B', '8');           -- { status: "live", lag_winner_side: "A" }
--   select match_state('<MATCH_ID>');                    -- status live, game 1, first thrower A
-- rollback;


-- ============================================================================
-- CHECK 3 — write path: play a legal race-to-1 game via submit_turn (increment 2).
-- One rollback transaction (nothing persists). Acts as the match creator (implicit
-- scorekeeper → may score both sides). Only the final SELECT shows — that's the
-- assertion. Any rejected turn aborts the batch with its error code.
-- ============================================================================
-- begin;
--   select set_config('request.jwt.claims',
--          json_build_object('sub', (select id from auth.users limit 1))::text, true);
--   insert into players (id, user_id, display_name) values
--     ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null, 'Test C'),
--     ('ffffffff-ffff-ffff-ffff-ffffffffffff', null, 'Test D');
--   insert into matches (id, race_to, status, lag_winner_side, created_by)
--     values ('33333333-3333-3333-3333-333333333333', 1, 'live', 'A', (select id from auth.users limit 1));
--   insert into match_participants (id, match_id, side, player_id) values
--     (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'A', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
--     (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'B', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
--   insert into games (id, match_id, game_number)
--     values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 1);
--   -- args: (turn_id, game_id, token, expected_seq, bf, bb, bl, double, pen, fl, adv_line, ks, king_hit, king_early)
--   select submit_turn(gen_random_uuid(), '44444444-4444-4444-4444-444444444444', null, 1, 0,2,2,false,0,0,null,0,false,false);
--   select submit_turn(gen_random_uuid(), '44444444-4444-4444-4444-444444444444', null, 2, 3,0,0,false,0,1,'6',0,false,false);
--   select submit_turn(gen_random_uuid(), '44444444-4444-4444-4444-444444444444', null, 3, 1,3,2,true,0,0,null,2,true,false);
--   -- EXPECT: status "finished", games_won {A:1,B:0}, current_game_id null
--   select match_state('33333333-3333-3333-3333-333333333333');
-- rollback;


-- ============================================================================
-- CHECK 3b — undo: same as CHECK 3, then rewind the winning turn. Self-contained.
-- Final SELECT should show the match healed back to live.
-- ============================================================================
-- begin;
--   select set_config('request.jwt.claims',
--          json_build_object('sub', (select id from auth.users limit 1))::text, true);
--   insert into players (id, user_id, display_name) values
--     ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null, 'Test C'),
--     ('ffffffff-ffff-ffff-ffff-ffffffffffff', null, 'Test D');
--   insert into matches (id, race_to, status, lag_winner_side, created_by)
--     values ('33333333-3333-3333-3333-333333333333', 1, 'live', 'A', (select id from auth.users limit 1));
--   insert into match_participants (id, match_id, side, player_id) values
--     (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'A', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
--     (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'B', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
--   insert into games (id, match_id, game_number)
--     values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 1);
--   select submit_turn(gen_random_uuid(), '44444444-4444-4444-4444-444444444444', null, 1, 0,2,2,false,0,0,null,0,false,false);
--   select submit_turn(gen_random_uuid(), '44444444-4444-4444-4444-444444444444', null, 2, 3,0,0,false,0,1,'6',0,false,false);
--   select submit_turn(gen_random_uuid(), '44444444-4444-4444-4444-444444444444', null, 3, 1,3,2,true,0,0,null,2,true,false);
--   select rewind_to('44444444-4444-4444-4444-444444444444', 3, null);   -- void the winning turn
--   -- EXPECT: status back to "live", games_won {A:0,B:0}, current game reopened (next_side A)
--   select match_state('33333333-3333-3333-3333-333333333333');
-- rollback;
