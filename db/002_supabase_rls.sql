-- OPTIONAL, Supabase only (uses auth.uid()). Defense in depth: the API already checks farm
-- membership in code and connects as the table owner, which bypasses RLS. These policies matter
-- if anyone ever queries the tables with the anon/authenticated keys (supabase-js, PostgREST):
-- members can read their farm's data, owners/editors can write; secrets tables stay closed.

create or replace function public.geoviva_has_role(fid uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where farm_id = fid and user_id = auth.uid() and role = any(roles))
$$;

alter table users               enable row level security;
alter table farms               enable row level security;
alter table farm_members        enable row level security;
alter table zones               enable row level security;
alter table sensors             enable row level security;
alter table sensor_readings     enable row level security;
alter table irrigation_events   enable row level security;
alter table lorawan_connections enable row level security; -- no policies: server only
alter table device_claims       enable row level security; -- no policies: server only
alter table ingestion_log       enable row level security; -- no policies: server only

create policy users_self on users for select using (id = auth.uid());

create policy farms_read  on farms for select using (geoviva_has_role(id, array['owner','editor','viewer']));
create policy farms_write on farms for update using (geoviva_has_role(id, array['owner','editor']));

create policy members_read on farm_members for select using (geoviva_has_role(farm_id, array['owner','editor','viewer']));
create policy members_owner on farm_members for all using (geoviva_has_role(farm_id, array['owner'])) with check (geoviva_has_role(farm_id, array['owner']));

create policy zones_read  on zones for select using (geoviva_has_role(farm_id, array['owner','editor','viewer']));
create policy zones_write on zones for all using (geoviva_has_role(farm_id, array['owner','editor'])) with check (geoviva_has_role(farm_id, array['owner','editor']));

create policy sensors_read  on sensors for select using (geoviva_has_role(farm_id, array['owner','editor','viewer']));
create policy sensors_write on sensors for all using (geoviva_has_role(farm_id, array['owner','editor'])) with check (geoviva_has_role(farm_id, array['owner','editor']));

create policy readings_read on sensor_readings for select using (geoviva_has_role(farm_id, array['owner','editor','viewer']));
create policy readings_manual_insert on sensor_readings for insert
  with check (geoviva_has_role(farm_id, array['owner','editor']) and source in ('manual', 'csv'));

create policy events_read  on irrigation_events for select using (geoviva_has_role(farm_id, array['owner','editor','viewer']));
create policy events_write on irrigation_events for all using (geoviva_has_role(farm_id, array['owner','editor'])) with check (geoviva_has_role(farm_id, array['owner','editor']));
