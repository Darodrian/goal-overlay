import { createBridge } from './bridge.js';
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
let settings = { ...DEFAULTS };
let goalCurrentAmount = 0;
let goalTargetAmount = 100;
let goalDescription = '';
let goalType = '';
let goalEnabled = true;
let bridge = null;
let eventSub = null;
let pointsDirty = false;
const embedded = window.parent !== window;

// DOM refs
const $goalLabel = document.getElementById('goal-label');
const $goalProgress = document.getElementById('goal-progress');
const $goalFill = document.getElementById('goal-fill');
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

function updateBar() {
    const pct = goalTargetAmount > 0
        ? Math.min(goalCurrentAmount / goalTargetAmount, 1) * 100
        : 0;
    $goalFill.style.width = pct + '%';
    $goalProgress.textContent = goalCurrentAmount + ' / ' + goalTargetAmount;
    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
}

function applySize() {
    $goalContainer.style.width = settings.overlayWidth + 'px';
    $goalContainer.style.height = settings.overlayHeight + 'px';
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

function applyLiveSettings(s) {
    if (!s) return;
    settings = { ...settings, ...s };
    const style = settings.goalStyle || 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    if (!settings.goalBarColor) {
        settings.goalBarColor = pal.colors[1] || '#946ef9';
    }
    if ($goalLabel && goalDescription) {
        $goalLabel.textContent = settings.goalLabel || goalDescription;
    }
    if ($goalProgress) {
        $goalProgress.textContent = goalCurrentAmount + ' / ' + goalTargetAmount;
    }
    goalEnabled = settings.goalBarEnabled !== false;
    const bar = document.querySelector('.goal-bar');
    if (bar) bar.style.display = goalEnabled ? '' : 'none';
    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
    applyPalette(style);
    applySize();
    updateBar();
}

function renderGoal(goal) {
    if (!goal) return;
    goalDescription = goal.description || '';
    goalType = goal.type || '';
    goalTargetAmount = normalizePoints(goal.target_amount) || 100;
    goalCurrentAmount = normalizePoints(goal.current_amount) || 0;

    if ($goalLabel) {
        $goalLabel.textContent = settings.goalLabel || goalDescription;
    }
    if ($goalProgress) {
        $goalProgress.textContent = goalCurrentAmount + ' / ' + goalTargetAmount;
    }
    updateBar();
}

function handleGoalProgress(event, info) {
    if (info && info.revoked) {
        console.warn('[overlay] eventsub revoked');
        return;
    }
    if (!event) return;

    const current = normalizePoints(event.current_amount);
    const target = normalizePoints(event.target_amount);
    if (current === goalCurrentAmount && target === goalTargetAmount) return;

    goalCurrentAmount = current;
    goalTargetAmount = target;
    updateBar();

    // Fade-out style flash on change
    const item = document.createElement('div');
    item.className = 'sub-event';
    const text = document.createElement('span');
    text.className = 'sub-event-text';
    text.textContent = 'Goal updated: ' + current + ' / ' + target;
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
    $setupNotice.classList.add('show');
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
        // Find the selected goal from cloud state, or use the first active one
        let selected = null;
        if (settings.selected_goal_id) {
            selected = goals.find(g => g.id === settings.selected_goal_id);
        }
        if (!selected && goals.length > 0) {
            selected = goals[0];
        }
        if (selected) {
            renderGoal(selected);
            settings.selected_goal_id = selected.id;
            saveSettings(broadcasterId, settings);
        } else {
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

    if ($goalLabel) $goalLabel.textContent = settings.goalLabel || '';
    if ($goalProgress) $goalProgress.textContent = '0 / ' + settings.goalTarget;

    goalEnabled = settings.goalBarEnabled !== false;
    if (!goalEnabled) {
        document.querySelector('.goal-bar').style.display = 'none';
    }

    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
    applyPalette(style);
    applySize();
    updateBar();

    connectRoom();
    startEventSub();
    loadGoalsFromTwitch();
}

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
