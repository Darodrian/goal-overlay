import { createBridge } from './bridge.js';
import { resolveGoalLabel } from './labels.js';
import { getSettings, saveSettings, broadcasterId as getBroadcasterId } from './storage.js';
import { fetchCloudState, saveCloudState } from './cloud.js';
import { getAccessToken, fetchGoals, EventSubClient } from './twitch.js';

const PALETTES = {
    default: { name: "Default", colors: ["#efa0d7", "#ec90be", "#e1719b", "#c54e69", "#9c2e34", "#511914", "#f6d1f4", "#e53a79", "#bb2a4a", "#9b2227", "#000000"] },
    yellow: { name: "Yellow", colors: ["#f6ce32", "#f0ad2b", "#d8a328", "#9c711c", "#745916", "#4f4210", "#fef83c", "#e53714", "#c32e11", "#94200c", "#000000"] },
    red: { name: "Red", colors: ["#e43236", "#c32b28", "#9b241b", "#7c1e10", "#58170f", "#3c0d03", "#ee9e9d", "#e43699", "#c32c60", "#9b2227", "#000000"] },
    green: { name: "Green", colors: ["#96f444", "#8be33a", "#79c92f", "#4f8d21", "#3c6d19", "#274e12", "#ccf79a", "#c86d1d", "#b64b15", "#77380f", "#000000"] },
    snow: { name: "Snow", colors: ["#fefbff", "#d9d7da", "#b5b3b6", "#8a898b", "#69686a", "#4a494a", "#fefbff", "#e6525b", "#bc333c", "#9b2227", "#000000"] },
    carbon: { name: "Carbon", colors: ["#69686a", "#5a585a", "#4a494a", "#3b3b3c", "#333334", "#262526", "#7a797a", "#ed9528", "#e97720", "#b65116", "#000000"] },
    ocean: { name: "Ocean", colors: ["#97d5fd", "#77b2fb", "#5e92fa", "#3e72f9", "#2c59bb", "#282e6f", "#b3f8fe", "#5a57f8", "#4341d4", "#2b22a8", "#000000"] },
    sapphire: { name: "Sapphire", colors: ["#7992e9", "#627ad6", "#5269c4", "#224ba9", "#18358f", "#0f216e", "#b3c5fc", "#431cb1", "#361687", "#2f105f", "#000000"] },
    grape: { name: "Grape", colors: ["#a995fa", "#946ef9", "#7a53f8", "#6025cb", "#532d8f", "#3e235f", "#c5b5fb", "#9e4478", "#7d2a60", "#661848", "#000000"] },
    emerald: { name: "Emerald", colors: ["#92f5ba", "#66c98f", "#449665", "#35765c", "#2b5e4b", "#214735", "#c5f8dc", "#ee9d4c", "#c9752b", "#a75617", "#000000"] },
    orange: { name: "Orange", colors: ["#f0ad31", "#ed952d", "#ea772c", "#e75d2d", "#ad441f", "#6f2b16", "#fae738", "#e65118", "#ad3911", "#6f2b16", "#000000"] },
    chocolate: { name: "Chocolate", colors: ["#c37d5d", "#a8644c", "#884d3d", "#70372e", "#592921", "#431c19", "#c69484", "#842a1b", "#6e1e10", "#5f1508", "#000000"] },
    cherry: { name: "Cherry", colors: ["#ed91d7", "#ea7abd", "#e0649a", "#c43e68", "#842334", "#511914", "#f6d1f4", "#479556", "#43764d", "#365e37", "#000000"] },
    chalk: { name: "Chalk", colors: ["#d9d7da", "#b5b3b6", "#939193", "#69686a", "#4a494a", "#2d2c2d", "#fefbff", "#717071", "#515151", "#3b3b3c", "#000000"] }
};

const DEFAULTS = {
    goalLabel: '',
    goalTarget: 100,
    goalBarColor: '#946ef9',
    goalBarEnabled: true,
    overlayWidth: 600,
    overlayHeight: 100,
    goalStyle: 'grape',
};

let broadcasterId = '';
export let settings = { ...DEFAULTS };
let bridge = null;
let eventSub = null;
let pointsDirty = false;
const embedded = window.parent !== window;

// Per-goal state, keyed by Twitch goal id.
export const goalsById = new Map();

// DOM refs
const $goalsList = document.getElementById('goals-list');
const $goalContainer = document.getElementById('goal-container');
const $subEvents = document.getElementById('sub-events');
const $setupNotice = document.getElementById('setup-notice');

function isPointsValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function normalizePoints(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function updateBar(goal) {
    const { currentAmount, targetAmount, fill: fillEl, progress: progressEl } = goal;
    const pct = targetAmount > 0
        ? Math.min(currentAmount / targetAmount, 1) * 100
        : 0;
    fillEl.style.width = pct + '%';
    progressEl.textContent = currentAmount + ' / ' + targetAmount;
    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
}

function applySize() {
    $goalContainer.style.width = settings.overlayWidth + 'px';
    const wrap = document.getElementById('sub-events-wrap');
    if (wrap) wrap.style.width = settings.overlayWidth + 'px';
    const hist = document.querySelector('.sub-events-history');
    if (hist) hist.style.width = '100%';
}

function applyPalette(styleName) {
    const style = styleName || 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    if (!pal) return;
    document.documentElement.style.setProperty('--goal-color-1', pal.colors[1] || '#946ef9');
    document.documentElement.style.setProperty('--goal-color-2', pal.colors[2] || pal.colors[1] || '#7a53f8');
    document.documentElement.style.setProperty('--goal-color-3', pal.colors[7] || '#c5b5fb');
    document.documentElement.style.setProperty('--goal-color-border', pal.colors[10] || '#000000');
    document.documentElement.style.setProperty('--goal-color-track', pal.colors[5] || 'rgba(62, 35, 95, 0.6)');
    document.documentElement.style.setProperty('--goal-color-bg', pal.colors[5] ? 'rgba(' + parseInt(pal.colors[5].slice(1,3),16) + ', ' + parseInt(pal.colors[5].slice(3,5),16) + ', ' + parseInt(pal.colors[5].slice(5,7),16) + ', 0.35)' : 'rgba(62, 35, 95, 0.35)');
    document.documentElement.style.setProperty('--goal-color-text', pal.colors[6] || '#c5b5fb');
    document.documentElement.style.setProperty('--goal-color-text-shadow', pal.colors[10] || '#000000');
    document.body.dataset.goalStyle = style;
}

export function applyLiveSettings(s) {
    if (!s) return;
    settings = { ...settings, ...s };
    const style = settings.goalStyle || 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    if (!settings.goalBarColor) {
        settings.goalBarColor = pal.colors[1] || '#946ef9';
    }
    const goalEnabled = settings.goalBarEnabled !== false;
    document.querySelectorAll('.goal-bar').forEach((bar) => {
        bar.style.display = goalEnabled ? '' : 'none';
    });
    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
    applyPalette(style);
    document.documentElement.style.setProperty('--goal-font-family', settings.goalFont || 'zpix');
    applySize();
    goalsById.forEach((goal) => {
        goal.label.textContent = resolveGoalLabel(settings.goalLabel, goal.description, goal.type);
        updateBar(goal);
    });
}

function buildGoalBar(goal) {
    const bar = document.createElement('div');
    bar.className = 'goal-bar';

    const header = document.createElement('div');
    header.className = 'goal-header';
    const label = document.createElement('span');
    label.className = 'goal-label';
    const progress = document.createElement('span');
    progress.className = 'goal-progress';
    header.appendChild(label);
    header.appendChild(progress);

    const track = document.createElement('div');
    track.className = 'goal-track';
    const fill = document.createElement('div');
    fill.className = 'goal-fill';
    track.appendChild(fill);

    bar.appendChild(header);
    bar.appendChild(track);

    return { bar, label, progress, fill };
}

export function renderGoal(goal) {
    if (!goal) return;
    if (goalsById.has(goal.id)) return;

    const description = goal.description || '';
    const type = goal.type || '';
    const targetAmount = normalizePoints(goal.target_amount) || 100;
    const currentAmount = normalizePoints(goal.current_amount) || 0;

    const { bar, label, progress, fill } = buildGoalBar(goal);
    label.textContent = resolveGoalLabel(settings.goalLabel, description, type);
    progress.textContent = currentAmount + ' / ' + targetAmount;

    $goalsList.appendChild(bar);

    goalsById.set(goal.id, {
        id: goal.id,
        description,
        type,
        targetAmount,
        currentAmount,
        bar,
        label,
        progress,
        fill,
    });

    updateBar(goalsById.get(goal.id));
}

function handleGoalProgress(event, info) {
    if (info && info.revoked) {
        console.warn('[overlay] eventsub revoked');
        return;
    }
    if (!event) return;

    const goalId = event.id;
    const current = normalizePoints(event.current_amount);
    const target = normalizePoints(event.target_amount);
    const goal = goalsById.get(goalId);
    if (!goal) {
        console.warn('[overlay] goal progress for unknown goal id:', goalId);
        return;
    }
    if (current === goal.currentAmount && target === goal.targetAmount) return;

    goal.currentAmount = current;
    goal.targetAmount = target;
    updateBar(goal);

    // Fade-out style flash on change
    const item = document.createElement('div');
    item.className = 'sub-event';
    const text = document.createElement('span');
    text.className = 'sub-event-text';
    text.textContent = 'Goal updated: ' + goal.label.textContent + ' ' + current + ' / ' + target;
    const pts = document.createElement('span');
    pts.className = 'sub-event-points';
    pts.textContent = '';
    item.appendChild(text);
    item.appendChild(pts);
    if ($subEvents) {
        $subEvents.insertBefore(item, $subEvents.firstChild);
        while ($subEvents.children.length > 20) {
            $subEvents.removeChild($subEvents.lastChild);
        }
    }

    setTimeout(() => {
        if (item.parentNode) item.remove();
    }, 5000);
}

// ---- supabase room (overlay <- dashboard settings) ----
async function connectRoom() {
    if (!broadcasterId) return;

    try {
        const state = await fetchCloudState(broadcasterId);
        if (state) {
            if (state.selected_goal_id) {
                settings.selected_goal_id = state.selected_goal_id;
            }
            if (state.settings && Object.keys(state.settings).length > 0) {
                applyLiveSettings(state.settings);
                saveSettings(broadcasterId, settings);
            }
        }
    } catch (e) {
        console.warn('[overlay] cloud state unavailable, using defaults', e?.message ?? e);
    }

    try {
        const b = createBridge(broadcasterId);
        b.onSet((payload) => {
            const s = payload && payload.settings;
            if (!s) return;
            applyLiveSettings(s);
            saveSettings(broadcasterId, settings);
        });
        b.onKeyChanged((payload) => {
            disconnectOverlay('Key changed.');
        });
        b.onDisconnect(() => {
            disconnectOverlay('Panel desconectó la sesión.');
        });
        await b.connect();
        bridge = b;
        b.sendHello();
    } catch (e) {
        bridge = null;
        console.warn('[overlay] room unavailable, continuing without live settings', e?.message ?? e);
    }
}

function disconnectOverlay(reason) {
    try {
        if (bridge) { bridge.leave(); bridge = null; }
    } catch (e) {}
    if (eventSub) {
        eventSub.disconnect();
        eventSub = null;
    }
    console.log('Goal Overlay session invalid: ' + reason);
}

async function startEventSub() {
    if (!broadcasterId) return;
    try {
        const token = await getAccessToken(broadcasterId);
        eventSub = new EventSubClient(broadcasterId, handleGoalProgress);
        eventSub.connect(token);
    } catch (e) {
        console.warn('[overlay] eventsub start failed', e?.message ?? e);
        // Still render from the REST fetch below
    }
}

async function loadGoalsFromTwitch() {
    if (!broadcasterId) return;
    try {
        const token = await getAccessToken(broadcasterId);
        const goals = await fetchGoals(broadcasterId, token);
        const activeIds = new Set();

        for (const goal of goals) {
            activeIds.add(goal.id);
            renderGoal(goal);
        }

        // Remove goal bars that are no longer active on Twitch.
        for (const [id, goal] of goalsById.entries()) {
            if (!activeIds.has(id)) {
                if (goal.bar && goal.bar.parentNode) {
                    goal.bar.parentNode.removeChild(goal.bar);
                }
                goalsById.delete(id);
            }
        }

        // Keep selected_goal_id in sync with whatever is active (for dashboard state).
        if (settings.selected_goal_id && !activeIds.has(settings.selected_goal_id) && goals.length > 0) {
            settings.selected_goal_id = goals[0].id;
            saveSettings(broadcasterId, settings);
        }

        if (goals.length === 0) {
            console.warn('[overlay] no active goals found for broadcaster', broadcasterId);
        }
    } catch (e) {
        console.warn('[overlay] goals load failed', e?.message ?? e);
    }
}

function initGoal() {
    settings = getSettings(broadcasterId, { ...DEFAULTS });

    const style = settings.goalStyle || 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    if (!settings.goalBarColor) {
        settings.goalBarColor = pal.colors[1] || '#946ef9';
    }

    const goalEnabled = settings.goalBarEnabled !== false;
    document.querySelectorAll('.goal-bar').forEach((bar) => {
        bar.style.display = goalEnabled ? '' : 'none';
    });

    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
    applyPalette(style);
    document.documentElement.style.setProperty('--goal-font-family', settings.goalFont || 'zpix');
    applySize();

    connectRoom();
    startEventSub();
    loadGoalsFromTwitch();
}

// ---- live preview (dashboard iframe) ----
window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    if (ev.source !== window.parent && ev.source !== window) return;
    if (!ev.data || ev.data.type !== 'goal-preview') return;
    applyLiveSettings(ev.data.settings);
});

// ---- entry point ----
broadcasterId = getBroadcasterId();

if (!broadcasterId) {
    $setupNotice.classList.add('show');
    settings = { ...DEFAULTS };
    initGoal();
} else {
    initGoal();
}

window.addPoints = () => {};
window.resetGoalPoints = () => {};
