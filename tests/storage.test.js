import test from 'node:test';
import assert from 'node:assert/strict';

import { getKey, saveKey, syncKeyFromUrl } from '../js/storage.js';

function useFakeStorage() {
    const data = new Map();
    globalThis.localStorage = {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { data.set(key, String(value)); },
        removeItem: (key) => { data.delete(key); },
    };
}

test('a top-level overlay adopts the key from its URL', () => {
    useFakeStorage();
    try {
        saveKey('chan', 'old');
        syncKeyFromUrl('chan', 'new', true);
        assert.equal(getKey('chan'), 'new');
    } finally {
        delete globalThis.localStorage;
    }
});

test('an embedded preview does not overwrite the dashboard key', () => {
    useFakeStorage();
    try {
        saveKey('chan', 'new');
        syncKeyFromUrl('chan', 'old', false);
        assert.equal(getKey('chan'), 'new');
    } finally {
        delete globalThis.localStorage;
    }
});
