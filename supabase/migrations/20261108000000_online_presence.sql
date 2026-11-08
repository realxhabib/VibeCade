-- =============================================================================
-- Who's online.
--
-- Signed-in players share what they're doing (around the site, in a lobby, in
-- a game, watching) on one private Realtime channel, `online`, using presence
-- only. That powers the "online" list in the top bar (Join their open lobby,
-- or challenge them), "Online now" invites in a lobby, and the "@x is waiting
-- in the lobby" toast. Nothing is stored: presence lives in Realtime.
--
-- Realtime private channels check realtime.messages policies: until this runs
-- the client's join is refused and the online list simply stays empty.
-- Broadcast is not allowed on this channel (presence only). Safe to re-run.
-- =============================================================================

drop policy if exists "signed-in players see who's online" on realtime.messages;
create policy "signed-in players see who's online" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'presence' and (select realtime.topic()) = 'online');

drop policy if exists "signed-in players share that they're online" on realtime.messages;
create policy "signed-in players share that they're online" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'presence' and (select realtime.topic()) = 'online');
