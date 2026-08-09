-- Kubb Platform — Phase 2 fix: broadcast_match_state trigger
-- The shared trigger referenced new.match_id / new.game_id / new.id in one CASE
-- expression. Postgres plans that expression against the TRIGGERING table's row type,
-- so on a matches UPDATE (no match_id column) it raised
-- 'record "new" has no field "match_id"' BEFORE the exception-guarded realtime.send —
-- aborting submit_lag/submit_turn. Resolve the match id via to_jsonb(NEW) (JSON ->>
-- yields null for absent keys, never errors), and wrap the whole body in the guard so
-- broadcasting can never break the underlying write.
--
-- Apply with: supabase db push

create or replace function broadcast_match_state() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_match uuid; rec jsonb;
begin
  begin
    rec := coalesce(to_jsonb(new), to_jsonb(old));
    if tg_table_name = 'turns' then
      select match_id into v_match from games where id = (rec->>'game_id')::uuid;
    elsif tg_table_name = 'games' then
      v_match := (rec->>'match_id')::uuid;
    else  -- matches
      v_match := (rec->>'id')::uuid;
    end if;
    if v_match is not null then
      perform realtime.send(match_state(v_match), 'state', 'match:' || v_match::text, false);
    end if;
  exception when others then
    null;  -- best-effort: never let broadcasting abort the write
  end;
  return null;
end $$;
