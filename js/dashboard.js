import {
    getSettings, saveSettings,
} from './storage.js';
import { createBridge } from './bridge.js';
import {
    fetchCloudState,
    saveCloudState,
} from './cloud.js';
import { TWITCH_OAUTH_BASE } from './config.js';
import { getAccessToken, fetchGoals } from './twitch.js';

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
    eventsFade: false,
    eventsFadeAfterMs: 10000,
};

// DOM refs
const $goalLabel = document.getElementById('goal-label');
const $goalStyle = document.getElementById('goal-style');
const $overlayWidth = document.getElementById('overlay-width');
const $eventsFade = document.getElementById('events-fade');
const $eventsFadeMs = document.getElementById('events-fade-ms');
const $btnConnect = document.getElementById('btn-connect');
const $btnCopyUrl = document.getElementById('btn-copy-url');
const $btnSave = document.getElementById('btn-save');
const $dotOv = document.getElementById('dot-ov');
const $statusOv = document.getElementById('status-ov');
const $msg = document.getElementById('msg');
const $preview = document.getElementById('preview');
const $previewNote = document.getElementById('preview-note');
const $goalsList = document.getElementById('goals-list');
const $connectionPanel = document.getElementById('connection-panel');
const $connectionTitle = document.getElementById('connection-title');
const $connectionConnected = document.getElementById('connection-connected');
const $connectionStatus = document.getElementById('connection-status');
const $goalsSection = document.getElementById('goals-section');
const $settingsSection = document.getElementById('settings-section');

let broadcasterId = '';
let broadcasterLogin = '';
let settings = { ...DEFAULTS };
let bridge = null;
let roomGen = 0;
let goals = [];

function flash(text, kind = 'accent') {
    $msg.textContent = text;
    $msg.className = 'msg ' + kind;
    $msg.hidden = false;
    clearTimeout(window._flashTimer);
    window._flashTimer = setTimeout(() => { $msg.hidden = true; }, 4000);
}

function setOverlay(kind, text) {
    if ($dotOv) { $dotOv.className = 'dot' + (kind ? ' ' + kind : ''); }
    if ($statusOv) { $statusOv.textContent = text; }
}

function showConnected(connected) {
    if ($connectionPanel) $connectionPanel.hidden = false;
    if ($connectionTitle) $connectionTitle.textContent = connected ? 'Connected' : 'Connect Twitch';
    if ($btnConnect) $btnConnect.hidden = connected;
    if ($connectionConnected) $connectionConnected.hidden = !connected;
    if ($connectionStatus) {
        $connectionStatus.textContent = connected ? ('Connected: ' + broadcasterLogin) : '';
    }
    if ($goalsSection) $goalsSection.hidden = !connected;
    if ($settingsSection) $settingsSection.hidden = !connected;
    setOverlay(connected ? 'live' : '', connected ? ('Channel: ' + broadcasterLogin) : 'No channel');
}

function buildOverlayUrl(broadcasterId) {
    const base = new URL('index.html', location.href);
    base.search = 'broadcaster_id=' + encodeURIComponent(broadcasterId);
    return base.href;
}

function updatePreview() {
    if (broadcasterId) {
        $preview.src = buildOverlayUrl(broadcasterId);
        $preview.hidden = false;
        $previewNote.textContent = 'Live preview: what you see is what goes into OBS.';
    } else {
        $preview.hidden = true;
        $previewNote.textContent = 'Connect your Twitch account to preview the overlay.';
    }
}

function buildLivePreviewSettings() {
    const style = $goalStyle ? $goalStyle.value : (settings.goalStyle || 'grape');
    const pal = PALETTES[style] || PALETTES.grape;
    return {
        goalLabel: $goalLabel ? $goalLabel.value : (settings.goalLabel || ''),
        goalTarget: settings.goalTarget || 100,
        goalBarColor: pal.colors[1] || '#946ef9',
        goalBarEnabled: true,
        overlayWidth: parseInt($overlayWidth ? $overlayWidth.value : 600, 10) || 600,
        overlayHeight: 100,
        goalStyle: style,
        eventsFade: $eventsFade ? $eventsFade.checked : (settings.eventsFade === true),
        eventsFadeAfterMs: $eventsFadeMs ? (parseInt($eventsFadeMs.value, 10) || 10000) : (settings.eventsFadeAfterMs || 10000),
        selected_goal_id: settings.selected_goal_id || '',
    };
}

function updatePreviewLive() {
    if (!broadcasterId) return;
    const s = buildLivePreviewSettings();
    if ($preview && !$preview.hidden) {
        try {
            if ($preview.contentWindow && typeof $preview.contentWindow.postMessage === 'function') {
                $preview.contentWindow.postMessage({ type: 'goal-preview', settings: s }, '*');
            }
        } catch (e) {}
    }
}

function applySettingsToForm(s) {
    if ($goalLabel) $goalLabel.value = s.goalLabel || '';
    if ($goalStyle) $goalStyle.value = s.goalStyle || 'grape';
    if ($overlayWidth) $overlayWidth.value = s.overlayWidth || 600;
    if ($eventsFade) $eventsFade.checked = s.eventsFade === true;
    if ($eventsFadeMs) $eventsFadeMs.value = s.eventsFadeAfterMs || 10000;
    updatePreviewLive();
}

function renderGoals() {
    if (!$goalsList) return;
    $goalsList.innerHTML = '';
    if (goals.length === 0) {
        $goalsList.textContent = 'No active goals found for this channel.';
        return;
    }
    for (const goal of goals) {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.padding = '8px';
        label.style.border = '1px solid rgba(255,255,255,0.08)';
        label.style.borderRadius = '8px';
        label.style.marginBottom = '8px';
        label.style.cursor = 'pointer';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'goal';
        radio.value = goal.id;
        radio.checked = goal.id === settings.selected_goal_id;
        radio.style.marginRight = '8px';

        const span = document.createElement('span');
        span.textContent = goal.description || goal.type || 'Untitled goal';
        span.style.fontWeight = '600';

        const sub = document.createElement('div');
        sub.style.fontSize = '11px';
        sub.style.color = 'var(--muted)';
        sub.textContent = goal.current_amount + ' / ' + goal.target_amount + '  ·  ' + goal.type;

        label.appendChild(radio);
        label.appendChild(span);
        label.appendChild(sub);

        radio.addEventListener('change', () => {
            settings.selected_goal_id = goal.id;
            // Update preview
            updatePreviewLive();
        });

        $goalsList.appendChild(label);
    }
}

async function loadGoals() {
    if (!broadcasterId) return;
    try {
        setOverlay('busy', 'Loading goals...');
        const token = await getAccessToken(broadcasterId);
        goals = await fetchGoals(broadcasterId, token);
        renderGoals();
        setOverlay('live', 'Goals loaded');
    } catch (e) {
        console.warn('[dashboard] load goals failed', e);
        flash('Could not load goals: ' + (e?.message ?? e), 'err');
        setOverlay('err', 'Goals load failed');
    }
}

async function loadSettingsFor(broadcasterId) {
    let cloud = null;
    try {
        cloud = await fetchCloudState(broadcasterId);
    } catch (e) {
        console.warn('[dashboard] cloud settings unavailable', e?.message ?? e);
    }

    if (cloud && cloud.settings && Object.keys(cloud.settings).length > 0) {
        settings = { ...DEFAULTS, ...cloud.settings };
        if (cloud.selected_goal_id) {
            settings.selected_goal_id = cloud.selected_goal_id;
        }
        saveSettings(broadcasterId, settings);
    } else {
        const local = getSettings(broadcasterId, { ...DEFAULTS });
        settings = local;
    }

    applySettingsToForm(settings);
}

async function saveSettingsToStorage() {
    if (!broadcasterId) { flash('Connect your Twitch account first'); return; }

    const style = $goalStyle ? $goalStyle.value : 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    const s = {
        goalLabel: $goalLabel ? $goalLabel.value : '',
        goalTarget: settings.goalTarget || 100,
        goalBarColor: pal.colors[1] || '#946ef9',
        goalBarEnabled: true,
        overlayWidth: parseInt($overlayWidth ? $overlayWidth.value : 600, 10) || 600,
        overlayHeight: 100,
        goalStyle: style,
        eventsFade: $eventsFade ? $eventsFade.checked : false,
        eventsFadeAfterMs: $eventsFadeMs ? (parseInt($eventsFadeMs.value, 10) || 10000) : 10000,
        selected_goal_id: settings.selected_goal_id || '',
    };
    saveSettings(broadcasterId, s);
    settings = s;

    // push live to overlay via Supabase Realtime
    if (bridge && bridge.isConnected()) {
        bridge.sendSet({ settings: s });
    }

    try {
        await saveCloudState(broadcasterId, settings.selected_goal_id, s);
        flash('Settings saved for ' + broadcasterLogin);
    } catch (e) {
        console.warn('[dashboard] cloud settings save failed', e?.message ?? e);
        flash('Settings saved locally; cloud save failed', 'err');
    }
}

async function startRoom() {
    const gen = ++roomGen;
    if (bridge) { await bridge.leave(); bridge = null; }
    if (!broadcasterId) { setOverlay('', 'No channel'); return; }
    setOverlay('busy', 'Connecting...');
    try {
        const b = createBridge(broadcasterId);
        b.onStatus((s) => {
            if (s === 'CHANNEL_ERROR') setOverlay('err', 'Connection error');
            else if (s === 'CLOSED') setOverlay('', 'Room closed');
        });
        b.onHello(() => {
            setOverlay('live', 'Overlay connected');
            b.sendSet({ settings });
        });
        await b.connect();
        if (gen !== roomGen) { await b.leave(); return; }
        bridge = b;
        b.sendSet({ settings });
        setOverlay('busy', 'Waiting for overlay...');
    } catch (e) {
        if (gen !== roomGen) return;
        const m = e?.message ?? '';
        setOverlay('err', m === 'CHANNEL_ERROR' ? 'Connection error' : m === 'TIMED_OUT' ? 'No response' : 'Could not connect to room');
    }
}

function copyText(text) {
    try {
        return navigator.clipboard.writeText(text);
    } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        ta.remove();
        return Promise.resolve();
    }
}

// ---- OAuth connect ----
if ($btnConnect) {
    $btnConnect.addEventListener('click', () => {
        const authUrl = `${TWITCH_OAUTH_BASE}/authorize`;
        location.href = authUrl;
    });
}

if ($btnCopyUrl) {
    $btnCopyUrl.addEventListener('click', async () => {
        if (!broadcasterId) { flash('Connect your Twitch account first'); return; }
        const url = buildOverlayUrl(broadcasterId);
        await copyText(url);
        flash('Overlay URL copied');
    });
}

if ($btnSave) {
    $btnSave.addEventListener('click', saveSettingsToStorage);
}

if ($goalLabel) $goalLabel.addEventListener('input', updatePreviewLive);
if ($goalStyle) $goalStyle.addEventListener('change', updatePreviewLive);
if ($overlayWidth) $overlayWidth.addEventListener('input', updatePreviewLive);
if ($eventsFade) $eventsFade.addEventListener('change', updatePreviewLive);
if ($eventsFadeMs) $eventsFadeMs.addEventListener('input', updatePreviewLive);

// ---- init ----
async function init() {
    // Handle OAuth return
    const urlParams = new URLSearchParams(location.search);
    const connected = urlParams.get('connected');
    const broadcasterIdFromUrl = urlParams.get('broadcaster_id');
    const error = urlParams.get('error');

    if (error) {
        flash('Twitch connection failed: ' + error, 'err');
        // Clean the URL
        window.history.replaceState({}, document.title, location.pathname);
    }

    if (connected && broadcasterIdFromUrl) {
        broadcasterLogin = connected;
        broadcasterId = broadcasterIdFromUrl;
        // Persist so returning users don't need to re-OAuth on every reload
        localStorage.setItem('goal_overlay_broadcaster_id', broadcasterId);
        localStorage.setItem('goal_overlay_broadcaster_login', broadcasterLogin);
        showConnected(true);
        await loadSettingsFor(broadcasterId);
        await loadGoals();
        startRoom();
        updatePreview();
        // Clean the URL
        window.history.replaceState({}, document.title, location.pathname);
        return;
    }

    // Restore from localStorage (returning user)
    const savedBroadcasterId = localStorage.getItem('goal_overlay_broadcaster_id');
    const savedBroadcasterLogin = localStorage.getItem('goal_overlay_broadcaster_login');
    if (savedBroadcasterId) {
        broadcasterId = savedBroadcasterId;
        broadcasterLogin = savedBroadcasterLogin || '';
        showConnected(true);
    }

    if (broadcasterId) {
        await loadSettingsFor(broadcasterId);
        await loadGoals();
        startRoom();
    }
    updatePreview();
}

init();

window.addEventListener('beforeunload', () => {
    if (broadcasterId) localStorage.setItem('goal_overlay_broadcaster_id', broadcasterId);
    if (broadcasterLogin) localStorage.setItem('goal_overlay_broadcaster_login', broadcasterLogin);
});
