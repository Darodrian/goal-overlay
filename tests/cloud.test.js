import test from 'node:test';
import assert from 'node:assert/strict';

import {
    fetchCloudState,
    saveCloudSettings,
    initializeCloudPoints,
    setCloudPoints,
    addCloudPoints,
    resetCloudTestPoints,
} from '../js/cloud.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../js/config.js';

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (body === undefined ? '' : JSON.stringify(body)),
    };
}

async function captureFetch(body, status = 200) {
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return jsonResponse(body, status);
    };
    return calls;
}

test('fetchCloudState posts the room and returns the state object', async () => {
    const calls = await captureFetch({ settings: { goalTarget: 10 }, points: 4, test_points: 1 });
    try {
        const state = await fetchCloudState('abcdefghijklmnop');
        assert.deepEqual(state, { settings: { goalTarget: 10 }, points: 4, test_points: 1 });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_get');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.headers.apikey, SUPABASE_KEY);
        assert.equal(calls[0].options.headers.Authorization, undefined);
        assert.deepEqual(JSON.parse(calls[0].options.body), { p_room: 'abcdefghijklmnop' });
    } finally {
        delete globalThis.fetch;
    }
});

test('fetchCloudState returns null when the room has no row', async () => {
    await captureFetch(null);
    try {
        assert.equal(await fetchCloudState('abcdefghijklmnop'), null);
    } finally {
        delete globalThis.fetch;
    }
});

test('saveCloudSettings posts the settings payload and accepts an empty response', async () => {
    const calls = await captureFetch(undefined, 204);
    try {
        const result = await saveCloudSettings('abcdefghijklmnop', { goalTarget: 20 });
        assert.equal(result, undefined);
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_save');
        assert.deepEqual(JSON.parse(calls[0].options.body), {
            p_room: 'abcdefghijklmnop',
            p_settings: { goalTarget: 20 },
        });
    } finally {
        delete globalThis.fetch;
    }
});

test('initializeCloudPoints posts the seed and returns the number', async () => {
    const calls = await captureFetch(7);
    try {
        assert.equal(await initializeCloudPoints('abcdefghijklmnop', 7), 7);
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_initialize_points');
        assert.deepEqual(JSON.parse(calls[0].options.body), {
            p_room: 'abcdefghijklmnop',
            p_points: 7,
        });
    } finally {
        delete globalThis.fetch;
    }
});

test('setCloudPoints posts the absolute total and returns the number', async () => {
    const calls = await captureFetch(12);
    try {
        assert.equal(await setCloudPoints('abcdefghijklmnop', 12), 12);
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_set_points');
        assert.deepEqual(JSON.parse(calls[0].options.body), {
            p_room: 'abcdefghijklmnop',
            p_points: 12,
        });
    } finally {
        delete globalThis.fetch;
    }
});

test('addCloudPoints posts the event and returns points plus test points', async () => {
    const calls = await captureFetch({ points: 9, test_points: 2 });
    try {
        const state = await addCloudPoints('abcdefghijklmnop', 'event-1', 3, true, 6);
        assert.deepEqual(state, { points: 9, test_points: 2 });
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_add_points');
        assert.deepEqual(JSON.parse(calls[0].options.body), {
            p_room: 'abcdefghijklmnop',
            p_event_id: 'event-1',
            p_delta: 3,
            p_is_test: true,
            p_initial_points: 6,
        });
    } finally {
        delete globalThis.fetch;
    }
});

test('resetCloudTestPoints posts the room and returns the new total', async () => {
    const calls = await captureFetch(9);
    try {
        assert.equal(await resetCloudTestPoints('abcdefghijklmnop'), 9);
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_reset_test_points');
        assert.deepEqual(JSON.parse(calls[0].options.body), { p_room: 'abcdefghijklmnop' });
    } finally {
        delete globalThis.fetch;
    }
});

test('RPC calls abort after the timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
        assert.ok(options.signal, 'fetch receives an AbortSignal');
        options.signal.addEventListener('abort', () => reject(new Error('request aborted')));
    });
    try {
        const pending = fetchCloudState('abcdefghijklmnop');
        t.mock.timers.tick(8000);
        await assert.rejects(pending, /aborted/);
    } finally {
        delete globalThis.fetch;
    }
});

test('RPC errors throw the server message', async () => {
    await captureFetch({ message: 'invalid room' }, 400);
    try {
        await assert.rejects(
            () => fetchCloudState('bad'),
            /invalid room/,
        );
    } finally {
        delete globalThis.fetch;
    }
});
