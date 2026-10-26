import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const RPC_URL = SUPABASE_URL + '/rest/v1/rpc/';
const RPC_TIMEOUT_MS = 8000;

async function rpc(name, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
        const res = await fetch(RPC_URL + name, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        const text = await res.text();
        let data;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = text;
            }
        }

        if (!res.ok) {
            const message = data && typeof data === 'object'
                ? (data.message || data.error_description || data.error)
                : data;
            throw new Error(message || 'Supabase RPC ' + name + ' failed (' + res.status + ')');
        }

        return data;
    } finally {
        clearTimeout(timer);
    }
}

export function fetchCloudState(room) {
    return rpc('goal_overlay_get', { p_room: room });
}

export function saveCloudSettings(room, settings) {
    return rpc('goal_overlay_save', { p_room: room, p_settings: settings });
}

export function initializeCloudPoints(room, points) {
    return rpc('goal_overlay_initialize_points', { p_room: room, p_points: points });
}

export function setCloudPoints(room, points) {
    return rpc('goal_overlay_set_points', { p_room: room, p_points: points });
}

export function addCloudPoints(room, eventId, delta, isTest, initialPoints = null) {
    return rpc('goal_overlay_add_points', {
        p_room: room,
        p_event_id: eventId,
        p_delta: delta,
        p_is_test: isTest === true,
        p_initial_points: initialPoints,
    });
}

export function resetCloudTestPoints(room) {
    return rpc('goal_overlay_reset_test_points', { p_room: room });
}
