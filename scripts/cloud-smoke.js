import assert from 'node:assert/strict';

import {
    fetchCloudState,
    saveCloudSettings,
    initializeCloudPoints,
    setCloudPoints,
    addCloudPoints,
    resetCloudTestPoints,
} from '../js/cloud.js';

function newRoom() {
    return crypto.randomUUID().replace(/-/g, '');
}

const room = process.argv[2] || newRoom();
const otherRoom = newRoom();

console.log('goal-overlay cloud smoke');
console.log('room:', room);
console.log('other room:', otherRoom);

try {
    assert.equal(await fetchCloudState(room), null, 'new room should be empty');

    await saveCloudSettings(room, { goalTarget: 123, goalLabel: 'Smoke' });
    let state = await fetchCloudState(room);
    assert.deepEqual(state.settings, { goalTarget: 123, goalLabel: 'Smoke' });
    assert.equal(state.points, null);
    assert.equal(state.test_points, 0);

    assert.equal(await initializeCloudPoints(room, 10), 10);
    assert.equal(await initializeCloudPoints(room, 999), 10, 'points must only seed once');

    assert.deepEqual(
        await addCloudPoints(room, 'evt-1', 2, false, null),
        { points: 12, test_points: 0 },
    );
    assert.deepEqual(
        await addCloudPoints(room, 'evt-1', 2, false, null),
        { points: 12, test_points: 0 },
        'duplicate event must not increment',
    );
    assert.deepEqual(
        await addCloudPoints(room, 'evt-test', 3, true, null),
        { points: 15, test_points: 3 },
    );

    assert.equal(await resetCloudTestPoints(room), 12);
    assert.equal(await setCloudPoints(room, 5), 5);

    state = await fetchCloudState(room);
    assert.equal(state.points, 5);
    assert.equal(state.test_points, 0);

    await saveCloudSettings(otherRoom, { goalTarget: 1 });
    assert.equal(await initializeCloudPoints(otherRoom, 1), 1);
    assert.equal((await addCloudPoints(otherRoom, 'evt-other', 1, false, null)).points, 2);

    state = await fetchCloudState(room);
    assert.equal(state.points, 5, 'second room must not affect the first');
    assert.equal((await fetchCloudState(otherRoom)).points, 2);

    console.log('ok: settings, seed, dedupe, test reset, absolute set, room isolation');
} catch (e) {
    console.error('smoke failed:', e?.message ?? e);
    process.exitCode = 1;
}
