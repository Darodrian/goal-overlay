import test from 'node:test';
import assert from 'node:assert/strict';

import {
    fetchCloudState,
    saveCloudState,
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

test('fetchCloudState posts the broadcaster_id and returns the state object', async () => {
    const calls = await captureFetch({ selected_goal_id: 'goal-1', settings: { goalStyle: 'grape' } });
    try {
        const state = await fetchCloudState('12345678');
        assert.deepEqual(state, { selected_goal_id: 'goal-1', settings: { goalStyle: 'grape' } });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_get');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.headers.apikey, SUPABASE_KEY);
        assert.deepEqual(JSON.parse(calls[0].options.body), { p_broadcaster_id: '12345678' });
    } finally {
        delete globalThis.fetch;
    }
});

test('saveCloudState posts the settings payload and accepts an empty response', async () => {
    const calls = await captureFetch(undefined, 204);
    try {
        const result = await saveCloudState('12345678', 'goal-1', { goalStyle: 'grape' });
        assert.equal(result, undefined);
        assert.equal(calls[0].url, SUPABASE_URL + '/rest/v1/rpc/goal_overlay_save');
        assert.deepEqual(JSON.parse(calls[0].options.body), {
            p_broadcaster_id: '12345678',
            p_selected_goal_id: 'goal-1',
            p_settings: { goalStyle: 'grape' },
        });
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
        const pending = fetchCloudState('12345678');
        t.mock.timers.tick(8000);
        await assert.rejects(pending, /aborted/);
    } finally {
        delete globalThis.fetch;
    }
});

test('RPC errors throw the server message', async () => {
    await captureFetch({ message: 'invalid broadcaster_id' }, 400);
    try {
        await assert.rejects(
            () => fetchCloudState('bad'),
            /invalid broadcaster_id/,
        );
    } finally {
        delete globalThis.fetch;
    }
});
