-- Kubb Platform — Phase 2 fix: cascade participant FKs
-- turns.participant_id and match_tokens.participant_id referenced match_participants
-- WITHOUT on-delete cascade. Deleting/abandoning a match cascades matches→match_participants,
-- but those child rows still point at the participants → FK violation depending on cascade
-- order. match_lineups.participant_id already cascades; bring these two in line so a match
-- deletes cleanly in one shot.
--
-- Apply with: supabase db push

alter table turns drop constraint turns_participant_id_fkey;
alter table turns add constraint turns_participant_id_fkey
  foreign key (participant_id) references match_participants(id) on delete cascade;

alter table match_tokens drop constraint match_tokens_participant_id_fkey;
alter table match_tokens add constraint match_tokens_participant_id_fkey
  foreign key (participant_id) references match_participants(id) on delete cascade;
