-- Goal overlay Twitch goals integration.
-- Tokens live server-side in an Edge Function (never in the browser).
-- Settings/state are keyed by broadcaster_id instead of a secret room key.

-- Drop legacy RPCs (parameter names changed from p_room to p_broadcaster_id,
-- which CREATE OR REPLACE does not allow).
drop function if exists public.goal_overlay_get(text);
drop function if exists public.goal_overlay_save(text, jsonb);
drop function if exists public.goal_overlay_initialize_points(text, integer);
drop function if exists public.goal_overlay_set_points(text, integer);
drop function if exists public.goal_overlay_add_points(text, text, integer, boolean, integer);
drop function if exists public.goal_overlay_reset_test_points(text);

create table if not exists public.twitch_tokens (
    broadcaster_id text primary key,
    broadcaster_login text not null,
    access_token text not null,
    refresh_token text not null,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

alter table public.twitch_tokens enable row level security;
revoke all on table public.twitch_tokens from anon, authenticated;

create table if not exists public.goal_overlay_state (
    broadcaster_id text primary key,
    selected_goal_id text,
    settings jsonb check (
        settings is null
        or (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 65536)
    ),
    updated_at timestamptz not null default now()
);

alter table public.goal_overlay_state enable row level security;
revoke all on table public.goal_overlay_state from anon, authenticated;

create or replace function public.goal_overlay_get(p_broadcaster_id text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'selected_goal_id', s.selected_goal_id,
        'settings', s.settings,
        'updated_at', s.updated_at
    )
    from public.goal_overlay_state s
    where s.broadcaster_id = p_broadcaster_id;
$$;

create or replace function public.goal_overlay_save(
    p_broadcaster_id text,
    p_selected_goal_id text,
    p_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_broadcaster_id is null then
        raise exception 'invalid broadcaster_id';
    end if;
    if p_settings is not null
       and (jsonb_typeof(p_settings) <> 'object'
            or pg_column_size(p_settings) > 65536) then
        raise exception 'invalid settings';
    end if;
    if not exists (select 1 from public.goal_overlay_state where broadcaster_id = p_broadcaster_id) then
        insert into public.goal_overlay_state (broadcaster_id, selected_goal_id, settings, updated_at)
        values (p_broadcaster_id, p_selected_goal_id, p_settings, now());
    else
        update public.goal_overlay_state
            set selected_goal_id = p_selected_goal_id,
                settings = p_settings,
                updated_at = now()
        where broadcaster_id = p_broadcaster_id;
    end if;
end;
$$;

revoke all on function public.goal_overlay_get(text) from public, anon, authenticated;
revoke all on function public.goal_overlay_save(text, text, jsonb) from public, anon, authenticated;
grant usage on schema public to anon;
grant execute on function public.goal_overlay_get(text) to anon;
grant execute on function public.goal_overlay_save(text, text, jsonb) to anon;

-- Miguelium Wisdom cheer threshold state, keyed by broadcaster_id.
create table if not exists public.cheer_overlay_state (
    broadcaster_id text primary key,
    cheer_threshold integer not null default 100,
    updated_at timestamptz not null default now()
);

alter table public.cheer_overlay_state enable row level security;
revoke all on table public.cheer_overlay_state from anon, authenticated;

create or replace function public.cheer_overlay_get(p_broadcaster_id text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'cheer_threshold', c.cheer_threshold,
        'updated_at', c.updated_at
    )
    from public.cheer_overlay_state c
    where c.broadcaster_id = p_broadcaster_id;
$$;

create or replace function public.cheer_overlay_save(
    p_broadcaster_id text,
    p_cheer_threshold integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_broadcaster_id is null then
        raise exception 'invalid broadcaster_id';
    end if;
    if p_cheer_threshold is null or p_cheer_threshold < 1 then
        raise exception 'invalid cheer_threshold';
    end if;
    if not exists (select 1 from public.cheer_overlay_state where broadcaster_id = p_broadcaster_id) then
        insert into public.cheer_overlay_state (broadcaster_id, cheer_threshold, updated_at)
        values (p_broadcaster_id, p_cheer_threshold, now());
    else
        update public.cheer_overlay_state
            set cheer_threshold = p_cheer_threshold,
                updated_at = now()
        where broadcaster_id = p_broadcaster_id;
    end if;
end;
$$;

revoke all on function public.cheer_overlay_get(text) from public, anon, authenticated;
revoke all on function public.cheer_overlay_save(text, integer) from public, anon, authenticated;
grant execute on function public.cheer_overlay_get(text) to anon;
grant execute on function public.cheer_overlay_save(text, integer) to anon;

notify pgrst, 'reload schema';
