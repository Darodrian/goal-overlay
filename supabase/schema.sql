-- Goal overlay cloud settings + points.
-- Run in the Supabase SQL Editor. Access is RPC-only for anon.

create table if not exists public.goal_overlay_settings (
    room text primary key check (room ~ '^[a-z0-9]{16,64}$'),
    settings jsonb check (
        settings is null
        or (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 65536)
    ),
    points integer check (points is null or points >= 0),
    test_points integer not null default 0 check (test_points >= 0),
    updated_at timestamptz not null default now()
);

create table if not exists public.goal_overlay_point_events (
    room text not null references public.goal_overlay_settings(room) on delete cascade,
    event_id text not null check (length(event_id) between 1 and 128),
    created_at timestamptz not null default now(),
    primary key (room, event_id)
);

create index if not exists goal_overlay_point_events_room_created_idx
    on public.goal_overlay_point_events (room, created_at);

alter table public.goal_overlay_settings enable row level security;
alter table public.goal_overlay_point_events enable row level security;

revoke all on table public.goal_overlay_settings from anon, authenticated;
revoke all on table public.goal_overlay_point_events from anon, authenticated;

create or replace function public.goal_overlay_get(p_room text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'settings', s.settings,
        'points', s.points,
        'test_points', s.test_points
    )
    from public.goal_overlay_settings s
    where s.room = p_room;
$$;

create or replace function public.goal_overlay_save(p_room text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_room is null or p_room !~ '^[a-z0-9]{16,64}$' then
        raise exception 'invalid room';
    end if;
    if p_settings is null
       or jsonb_typeof(p_settings) <> 'object'
       or pg_column_size(p_settings) > 65536 then
        raise exception 'invalid settings';
    end if;
    if not exists (select 1 from public.goal_overlay_settings where room = p_room)
       and (select count(*) from public.goal_overlay_settings) >= 10000 then
        raise exception 'settings capacity reached';
    end if;

    insert into public.goal_overlay_settings (room, settings, updated_at)
    values (p_room, p_settings, now())
    on conflict (room) do update
        set settings = excluded.settings,
            updated_at = now();
end;
$$;

create or replace function public.goal_overlay_initialize_points(p_room text, p_points integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_points integer;
begin
    if p_room is null or p_room !~ '^[a-z0-9]{16,64}$' then
        raise exception 'invalid room';
    end if;
    if p_points is null or p_points < 0 then
        raise exception 'invalid points';
    end if;
    if not exists (select 1 from public.goal_overlay_settings where room = p_room)
       and (select count(*) from public.goal_overlay_settings) >= 10000 then
        raise exception 'settings capacity reached';
    end if;

    insert into public.goal_overlay_settings (room, points, updated_at)
    values (p_room, p_points, now())
    on conflict (room) do nothing;

    update public.goal_overlay_settings
        set points = p_points,
            updated_at = now()
        where room = p_room and points is null
        returning points into v_points;

    if v_points is null then
        select points into v_points
        from public.goal_overlay_settings
        where room = p_room;
    end if;

    return coalesce(v_points, 0);
end;
$$;

create or replace function public.goal_overlay_set_points(p_room text, p_points integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_points integer;
begin
    if p_room is null or p_room !~ '^[a-z0-9]{16,64}$' then
        raise exception 'invalid room';
    end if;
    if p_points is null or p_points < 0 then
        raise exception 'invalid points';
    end if;
    if not exists (select 1 from public.goal_overlay_settings where room = p_room)
       and (select count(*) from public.goal_overlay_settings) >= 10000 then
        raise exception 'settings capacity reached';
    end if;

    insert into public.goal_overlay_settings (room, points, test_points, updated_at)
    values (p_room, p_points, 0, now())
    on conflict (room) do update
        set points = excluded.points,
            test_points = 0,
            updated_at = now()
    returning points into v_points;

    return v_points;
end;
$$;

create or replace function public.goal_overlay_add_points(
    p_room text,
    p_event_id text,
    p_delta integer,
    p_is_test boolean,
    p_initial_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_points integer;
    v_test integer;
    v_inserted integer;
begin
    if p_room is null or p_room !~ '^[a-z0-9]{16,64}$' then
        raise exception 'invalid room';
    end if;
    if p_event_id is null or length(p_event_id) < 1 or length(p_event_id) > 128 then
        raise exception 'invalid event';
    end if;
    if p_delta is null or p_delta < 0 or p_delta > 1000 then
        raise exception 'invalid delta';
    end if;
    if p_initial_points is not null and p_initial_points < 0 then
        raise exception 'invalid initial points';
    end if;
    if not exists (select 1 from public.goal_overlay_settings where room = p_room)
       and (select count(*) from public.goal_overlay_settings) >= 10000 then
        raise exception 'settings capacity reached';
    end if;

    insert into public.goal_overlay_settings (room)
    values (p_room)
    on conflict (room) do nothing;

    insert into public.goal_overlay_point_events (room, event_id)
    values (p_room, p_event_id)
    on conflict (room, event_id) do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
        update public.goal_overlay_settings
            set points = greatest(0, coalesce(points, p_initial_points, 0) + p_delta),
                test_points = case
                    when coalesce(p_is_test, false) then greatest(0, test_points + p_delta)
                    else test_points
                end,
                updated_at = now()
            where room = p_room
            returning points, test_points into v_points, v_test;
    else
        select points, test_points into v_points, v_test
        from public.goal_overlay_settings
        where room = p_room;
    end if;

    delete from public.goal_overlay_point_events
    where room = p_room and created_at < now() - interval '30 days';

    return jsonb_build_object(
        'points', coalesce(v_points, 0),
        'test_points', coalesce(v_test, 0)
    );
end;
$$;

create or replace function public.goal_overlay_reset_test_points(p_room text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_points integer;
begin
    if p_room is null or p_room !~ '^[a-z0-9]{16,64}$' then
        raise exception 'invalid room';
    end if;

    update public.goal_overlay_settings
        set points = greatest(0, coalesce(points, 0) - test_points),
            test_points = 0,
            updated_at = now()
        where room = p_room
        returning points into v_points;

    return coalesce(v_points, 0);
end;
$$;

revoke all on function public.goal_overlay_get(text) from public, anon, authenticated;
revoke all on function public.goal_overlay_save(text, jsonb) from public, anon, authenticated;
revoke all on function public.goal_overlay_initialize_points(text, integer) from public, anon, authenticated;
revoke all on function public.goal_overlay_set_points(text, integer) from public, anon, authenticated;
revoke all on function public.goal_overlay_add_points(text, text, integer, boolean, integer) from public, anon, authenticated;
revoke all on function public.goal_overlay_reset_test_points(text) from public, anon, authenticated;

grant usage on schema public to anon;
grant execute on function public.goal_overlay_get(text) to anon;
grant execute on function public.goal_overlay_save(text, jsonb) to anon;
grant execute on function public.goal_overlay_initialize_points(text, integer) to anon;
grant execute on function public.goal_overlay_set_points(text, integer) to anon;
grant execute on function public.goal_overlay_add_points(text, text, integer, boolean, integer) to anon;
grant execute on function public.goal_overlay_reset_test_points(text) to anon;

notify pgrst, 'reload schema';
