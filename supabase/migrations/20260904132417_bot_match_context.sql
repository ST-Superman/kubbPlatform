-- Kubb Platform — Bot opponents (simulated matches) · Phase 5: bot_match_context
--   One read the match UI needs to auto-play the bot: for a simulated match, which SIDE is
--   the bot and the bot's stat block. Returns null for a normal (human) match, so the client
--   simply skips all bot behavior.
--
--   NOTE: only resolves the 3 fixed bots (bot_profiles row joined by player_id). The per-user
--   clone bot (Phase 6) has no shared bot_profiles row yet; Phase 6 extends this to source the
--   clone's stats (materialized row or match snapshot).
--
-- Apply by pasting into the Supabase SQL editor.

create or replace function bot_match_context(p_match_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bot_side',        mp.side,
    'slug',            bp.slug,
    'display_name',    bp.display_name,
    'acc_8m',          bp.acc_8m,
    'king_acc',        bp.king_acc,
    'field_eff_early', bp.field_eff_early,
    'field_eff_mid',   bp.field_eff_mid,
    'field_eff_late',  bp.field_eff_late,
    'consistency',     bp.consistency
  )
  from matches m
  join match_participants mp on mp.match_id = m.id
  join players p            on p.id = mp.player_id and p.is_bot
  join bot_profiles bp      on bp.player_id = p.id
  where m.id = p_match_id and m.is_simulated
  limit 1;
$$;

revoke all on function bot_match_context(uuid)  from public;
grant execute on function bot_match_context(uuid) to authenticated;
