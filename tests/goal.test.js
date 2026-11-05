import test from 'node:test';
import assert from 'node:assert/strict';

// ---- minimal DOM/window mock so goal.js can load ----
const elements = [];

function makeEl() {
    const el = {
        className: '',
        style: {},
        textContent: '',
        children: [],
        parentNode: null,
        appendChild(child) {
            this.children.push(child);
            if (child) child.parentNode = this;
            return child;
        },
        removeChild(child) {
            const i = this.children.indexOf(child);
            if (i >= 0) this.children.splice(i, 1);
            if (child) child.parentNode = null;
            return child;
        },
        setAttribute() {},
        classList: { add() {}, remove() {}, contains() { return false; } },
    };
    elements.push(el);
    return el;
}

const goalsListEl = makeEl();
const goalContainerEl = makeEl();
const subEventsEl = makeEl();
const setupNoticeEl = makeEl();

globalThis.document = {
    getElementById(id) {
        if (id === 'goals-list') return goalsListEl;
        if (id === 'goal-container') return goalContainerEl;
        if (id === 'sub-events') return subEventsEl;
        if (id === 'setup-notice') return setupNoticeEl;
        return null;
    },
    createElement(tag) {
        return makeEl();
    },
    querySelector() {
        return null;
    },
    querySelectorAll() {
        return [];
    },
    documentElement: {
        style: { setProperty() {} },
    },
    body: { dataset: {} },
};

globalThis.window = {
    parent: null,
    addEventListener() {},
};

globalThis.location = { hash: '', search: '' };

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const mod = await import('../js/goal.js');
const { renderGoal, goalsById, settings, applyLiveSettings } = mod;

function reset() {
    elements.length = 0;
    goalsListEl.children.length = 0;
    goalsById.clear();
}

test('renderGoal stores per-goal state keyed by id', () => {
    reset();
    renderGoal({ id: 'g1', description: 'Followers goal', type: 'follower', target_amount: 100, current_amount: 40 });
    assert.ok(goalsById.has('g1'));
    const g = goalsById.get('g1');
    assert.equal(g.targetAmount, 100);
    assert.equal(g.currentAmount, 40);
    assert.equal(g.label.textContent, 'Followers goal');
    assert.ok(g.bar);
    assert.ok(g.fill);
    assert.ok(g.progress);
});

test('renderGoal is idempotent: same id is not duplicated', () => {
    reset();
    renderGoal({ id: 'g1', description: 'A', type: 'follower', target_amount: 100, current_amount: 10 });
    renderGoal({ id: 'g1', description: 'B', type: 'subscription', target_amount: 200, current_amount: 20 });
    assert.equal(goalsById.size, 1);
    assert.equal(goalsById.get('g1').label.textContent, 'A');
    assert.equal(goalsListEl.children.length, 1);
});

test('multiple goals render as separate bars', () => {
    reset();
    renderGoal({ id: 'g1', description: 'Followers', type: 'follower', target_amount: 100, current_amount: 40 });
    renderGoal({ id: 'g2', description: 'Plus Program L2', type: 'subscription', target_amount: 300, current_amount: 150 });
    assert.equal(goalsById.size, 2);
    assert.equal(goalsListEl.children.length, 2);
    assert.equal(goalsById.get('g1').label.textContent, 'Followers');
    assert.equal(goalsById.get('g2').label.textContent, 'Plus Program L2');
    assert.equal(goalsById.get('g2').targetAmount, 300);
    assert.equal(goalsById.get('g2').currentAmount, 150);
});

test('subscription type resolves to "Subscribers" when no description', () => {
    reset();
    renderGoal({ id: 'g1', description: '', type: 'subscription', target_amount: 300, current_amount: 150 });
    assert.equal(goalsById.get('g1').label.textContent, 'Subscribers');
});

test('caption override updates labels on all existing bars when settings change', () => {
    reset();
    renderGoal({ id: 'g1', description: 'Followers', type: 'follower', target_amount: 100, current_amount: 40 });
    renderGoal({ id: 'g2', description: 'Plus Program', type: 'subscription', target_amount: 300, current_amount: 150 });

    // simulate dashboard changing the caption override
    settings.goalLabel = 'Custom caption';
    applyLiveSettings({ goalLabel: 'Custom caption' });

    assert.equal(goalsById.get('g1').label.textContent, 'Custom caption');
    assert.equal(goalsById.get('g2').label.textContent, 'Custom caption');
});
