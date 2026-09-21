-- Kubb Platform — Pass 3 (Q5) fix: uuid has no min()/max() aggregate
--
--   sweep_match_rollups() used min(player_id)/max(player_id) to pick the two players,
--   which errors ("function min(uuid) does not exist"). Use array_agg(... order by)
--   instead. Otherwise identical to 20260920140000 (keeps the new-only v_since cutoff).
--
--   Supersedes the sweep definition from 20260920130000 + 20260920140000. Manual apply.

create or replace function sweep_match_rollups()
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; v_players uuid[]; pa uuid; pb uuid; v_dm uuid; v_anchor timestamptz; v_n int := 0;
  -- New-only cutoff: matches created before this are left as-is (visible match rows).
  -- To run the one-time historical backfill later, lower this (e.g. to '2000-01-01').
  v_since constant timestamptz := '2026-09-20T00:00:00Z';
begin
  for r in
    select c.id as conv_id, c.match_id
    from conversations c
    join matches m on m.id = c.match_id
    where c.type = 'match' and c.hidden = false and c.merged_into is null
      and m.status = 'finished'
      and m.created_at >= v_since
      and (select count(*) from match_participants mp where mp.match_id = c.match_id and mp.player_id is not null) = 2
      and (select count(*) from match_participants mp join players p on p.id = mp.player_id
           where mp.match_id = c.match_id and p.user_id is not null) = 2
  loop
    select array_agg(mp.player_id order by mp.player_id) into v_players
    from match_participants mp
    where mp.match_id = r.match_id and mp.player_id is not null;
    pa := v_players[1];
    pb := v_players[2];

    if exists (select 1 from player_blocks b
               where (b.blocker_player_id = pa and b.blocked_player_id = pb)
                  or (b.blocker_player_id = pb and b.blocked_player_id = pa)) then
      update conversations set hidden = true where id = r.conv_id;
      v_n := v_n + 1;
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtext(least(pa::text, pb::text) || greatest(pa::text, pb::text)));
    select c.id into v_dm from conversations c
     where c.type = 'dm'
       and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.player_id = pa)
       and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.player_id = pb)
     limit 1;
    if v_dm is null then
      insert into conversations (type, created_by) values ('dm', null) returning id into v_dm;
      insert into conversation_members (conversation_id, player_id) values (v_dm, pa), (v_dm, pb);
    end if;

    select max(created_at) into v_anchor from messages where conversation_id = r.conv_id;
    if v_anchor is not null then
      with ordered as (
        select id, row_number() over (order by created_at, id) as rn
        from messages where conversation_id = r.conv_id
      )
      update messages msg
         set conversation_id = v_dm,
             from_match_id = r.match_id,
             sort_at = v_anchor + (o.rn * interval '1 microsecond')
      from ordered o
      where msg.id = o.id;
    end if;

    update conversations set merged_into = v_dm, hidden = true where id = r.conv_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function sweep_match_rollups() from public, anon, authenticated;
grant execute on function sweep_match_rollups() to service_role;
