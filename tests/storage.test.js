import test from 'node:test';
import assert from 'node:assert/strict';

import { norm, broadcasterId } from '../js/storage.js';

test('norm lowercases and trims the channel name', () => {
    assert.equal(norm('  MyChannel  '), 'mychannel');
    assert.equal(norm(''), '');
});

test('broadcasterId reads from URL search param', () => {
    const origLocation = globalThis.location;
    try {
        globalThis.location = new URL('https://example.com/index.html?broadcaster_id=12345678');
        assert.equal(broadcasterId(), '12345678');
    } finally {
        globalThis.location = origLocation;
    }
});

test('broadcasterId reads from URL hash param', () => {
    const origLocation = globalThis.location;
    try {
        globalThis.location = new URL('https://example.com/index.html#broadcaster_id=87654321');
        assert.equal(broadcasterId(), '87654321');
    } finally {
        globalThis.location = origLocation;
    }
});

test('broadcasterId returns empty string when no param', () => {
    const origLocation = globalThis.location;
    try {
        globalThis.location = new URL('https://example.com/index.html');
        assert.equal(broadcasterId(), '');
    } finally {
        globalThis.location = origLocation;
    }
});
