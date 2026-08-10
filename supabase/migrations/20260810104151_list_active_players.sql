-- Kubb Platform — Players tab: directory of active (account-backed) players
-- list_active_players() → every player with a real account (user_id not null), with
-- their match W-L record (via match_winner, so forfeits count). Powers the new
-- "Current Players" tab. Read-only, additive.
--
-- Apply with: supabase db push

create or replace function list_active_players() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  arr jsonb := '[]'::jsonb;
  p record; m record; my text; w text; wins int; losses int;
begin
  for p in
    select pl.id, pl.display_name, pr.handle::text as handle, pr.avatar_url
    from players pl
    join profiles pr on pr.id = pl.user_id
    where pl.user_id is not null
    order by pr.handle
  loop
    wins := 0; losses := 0;
    for m in
      select mm.id from matches mm
      where exists (select 1 from match_participants mp
                    where mp.match_id = mm.id and mp.player_id = p.id)
    loop
      select mp.side into my from match_participants mp
      where mp.match_id = m.id and mp.player_id = p.id limit 1;
      w := match_winner(m.id);
      if w is not null and my is not null then
        if w = my then wins := wins + 1; else losses := losses + 1; end if;
      end if;
    end loop;

    arr := arr || jsonb_build_object(
      'player_id', p.id,
      'handle', p.handle,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'wins', wins,
      'losses', losses);
  end loop;
  return arr;
end $$;

revoke all on function list_active_players() from public;
grant execute on function list_active_players() to authenticated;
