-- Kubb Platform — quick wins: team W/L record (TM-3) + claim match preview (AU-12)
-- Apply with: supabase db push

-- ============ team_stats: add win/loss record (parity with player card) ============
create or replace function team_stats(p_team_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_name text; ids uuid[]; cnt int; members jsonb;
  r record; w text; wins int := 0; losses int := 0;
begin
  select name into v_name from teams where id = p_team_id;
  if v_name is null then return null; end if;

  select array_agg(mp.id), count(*) into ids, cnt
  from match_participants mp
  join matches m on m.id = mp.match_id
  where mp.team_id = p_team_id and m.status = 'finished';

  for r in
    select mp.side, mp.match_id
    from match_participants mp
    join matches m on m.id = mp.match_id
    where mp.team_id = p_team_id and m.status = 'finished'
  loop
    w := match_winner(r.match_id);
    if w is not null then
      if w = r.side then wins := wins + 1; else losses := losses + 1; end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
      'player_id', pl.id, 'display_name', pl.display_name, 'handle', pr.handle::text
    ) order by pl.display_name), '[]'::jsonb) into members
  from team_members tmm
  join players  pl on pl.id = tmm.player_id
  left join profiles pr on pr.id = pl.user_id
  where tmm.team_id = p_team_id;

  return jsonb_build_object(
    'team',            jsonb_build_object('id', p_team_id, 'name', v_name),
    'members',         members,
    'metrics',         compute_turn_metrics(coalesce(ids, '{}'::uuid[])),
    'matches_counted', coalesce(cnt, 0),
    'record',          jsonb_build_object('wins', wins, 'losses', losses)
  );
end $$;

-- ============ claim_preview: include the managed player's recent matches ============
create or replace function claim_preview(p_claim_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_handle text;
  v_masked text;
  v_matches jsonb;
begin
  select p.id, p.display_name, p.user_id, p.claimed_at, pc.expires_at
    into c
  from player_claims pc
  join players p on p.id = pc.player_id
  where pc.claim_token = p_claim_token;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if c.claimed_at is not null then
    select handle into v_handle from profiles where id = c.user_id;
    if v_handle is not null and length(v_handle) >= 2 then
      v_masked := left(v_handle, 1)
                  || repeat('•', greatest(length(v_handle) - 2, 1))
                  || right(v_handle, 1);
    end if;
    return jsonb_build_object(
      'status', 'already_claimed',
      'display_name', c.display_name,
      'claimed_at', c.claimed_at,
      'masked_handle', v_masked);
  end if;

  if c.expires_at < now() then
    return jsonb_build_object('status', 'expired', 'display_name', c.display_name);
  end if;

  -- Recent matches recorded under this managed player (most recent 5).
  select coalesce(jsonb_agg(x.obj order by x.created_at desc), '[]'::jsonb)
    into v_matches
  from (
    select m.created_at,
      jsonb_build_object(
        'created_at', m.created_at,
        'opponent', coalesce(op.display_name, tm.name),
        'result', case when match_winner(m.id) is null then null
                       when match_winner(m.id) = mine.side then 'won' else 'lost' end
      ) as obj
    from match_participants mine
    join matches m on m.id = mine.match_id
    join match_participants opp on opp.match_id = m.id and opp.side <> mine.side
    left join players op on op.id = opp.player_id
    left join teams tm on tm.id = opp.team_id
    where mine.player_id = c.id
    order by m.created_at desc
    limit 5
  ) x;

  return jsonb_build_object(
    'status', 'ok',
    'display_name', c.display_name,
    'matches', v_matches);
end $$;
