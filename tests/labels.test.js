import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGoalLabel } from '../js/labels.js';

test('caption override wins over everything', () => {
    assert.equal(resolveGoalLabel('My caption', 'Follow goal', 'follower'), 'My caption');
});

test('blank override falls back to the goal description from Twitch', () => {
    assert.equal(resolveGoalLabel('', 'Follow goal', 'follower'), 'Follow goal');
    assert.equal(resolveGoalLabel(undefined, 'Follow goal', 'follower'), 'Follow goal');
});

test('whitespace-only override is treated as blank', () => {
    assert.equal(resolveGoalLabel('   ', 'Follow goal', 'follower'), 'Follow goal');
});

test('goals without a description use a friendly goal type', () => {
    assert.equal(resolveGoalLabel('', '', 'follower'), 'Followers');
    assert.equal(resolveGoalLabel('', '', 'subscription_count'), 'Subscribers');
    assert.equal(resolveGoalLabel('', '', 'new_bit'), 'Bits');
});

test('unknown or missing goal type with no description resolves to empty', () => {
    assert.equal(resolveGoalLabel('', '', 'mystery_goal'), '');
    assert.equal(resolveGoalLabel('', '', ''), '');
});
