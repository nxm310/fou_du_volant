-- =========================================================
-- Radars PWA — Setup Supabase
-- À exécuter une seule fois dans le SQL Editor de ton projet
-- =========================================================

-- 1. Table principale des radars communautaires
create table if not exists public.community_radars (
  id           bigserial primary key,
  lat          double precision not null,
  lng          double precision not null,
  kind         text not null check (kind in ('mobile','nouveau','controle','danger')),
  note         text default '',
  user_id      text not null,
  votes        integer not null default 1,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Index pour requêtes géographiques et tri
create index if not exists idx_community_radars_geo
  on public.community_radars (lat, lng) where active = true;
create index if not exists idx_community_radars_created
  on public.community_radars (created_at desc);

-- 2. Table des votes (pour éviter qu'un même user vote plusieurs fois)
create table if not exists public.community_votes (
  radar_id   bigint references public.community_radars(id) on delete cascade,
  user_id    text not null,
  delta      integer not null check (delta in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (radar_id, user_id)
);

-- 3. Row Level Security
alter table public.community_radars enable row level security;
alter table public.community_votes enable row level security;

-- Tout le monde peut lire les radars actifs
drop policy if exists "read active radars" on public.community_radars;
create policy "read active radars"
  on public.community_radars for select
  using (active = true);

-- Tout le monde peut insérer (rate limiting géré via RPC ci-dessous)
drop policy if exists "insert radars" on public.community_radars;
create policy "insert radars"
  on public.community_radars for insert
  with check (true);

-- Pas de update/delete direct depuis le client : tout passe par RPC
-- (les votes et auto-expiration se font côté serveur)

drop policy if exists "read votes" on public.community_votes;
create policy "read votes"
  on public.community_votes for select using (true);

drop policy if exists "insert votes" on public.community_votes;
create policy "insert votes"
  on public.community_votes for insert with check (true);

-- 4. RPC de vote atomique (empêche les doubles votes, recalcule le compteur,
--    désactive automatiquement les radars trop downvotés)
create or replace function public.vote_radar(radar_id bigint, delta integer)
returns void
language plpgsql
security definer
as $$
declare
  v_user text;
  v_new_votes integer;
begin
  -- récupère user_id depuis le header (ou génère un id unique par requête si absent)
  v_user := coalesce(current_setting('request.headers', true)::json->>'x-user-id', '');
  if v_user = '' then
    v_user := encode(gen_random_bytes(8), 'hex');
  end if;

  -- insère le vote (ignore si déjà voté)
  insert into public.community_votes (radar_id, user_id, delta)
  values (radar_id, v_user, delta)
  on conflict (radar_id, user_id) do nothing;

  -- recalcule le total
  update public.community_radars
  set votes = (select coalesce(sum(delta), 0) + 1 from public.community_votes where community_votes.radar_id = vote_radar.radar_id),
      updated_at = now(),
      active = case when (select coalesce(sum(delta), 0) + 1 from public.community_votes where community_votes.radar_id = vote_radar.radar_id) < -2 then false else active end
  where id = vote_radar.radar_id;
end;
$$;

grant execute on function public.vote_radar(bigint, integer) to anon, authenticated;

-- 5. Job d'expiration automatique : radars mobiles > 48h désactivés,
--    zones de contrôle > 24h désactivées
create or replace function public.expire_old_radars()
returns void
language sql
as $$
  update public.community_radars set active = false
  where active = true and (
    (kind = 'mobile' and created_at < now() - interval '48 hours') or
    (kind = 'controle' and created_at < now() - interval '24 hours')
  );
$$;

-- Pour exécuter périodiquement, utilise l'extension pg_cron (activable dans
-- Database > Extensions) puis :
-- select cron.schedule('expire-radars', '*/30 * * * *', 'select public.expire_old_radars()');
