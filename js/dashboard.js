import {
    getSettings, saveSettings,
    getKey, saveKey, saveKeyVersion, getKeyVersion, hasKey, generateKey,
    norm,
} from './storage.js';
import { createBridge } from './bridge.js';

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
    goalLabel: 'Meta Partner Plus 2',
    goalTarget: 200,
    goalBarColor: '#946ef9',
    goalBarEnabled: true,
    overlayWidth: 600,
    subTier1Points: 1,
    subTier2Points: 2,
    subTier3Points: 6,
    hideGiftedInOverlay: false,
    hidePrimeInOverlay: false,
    hideCommunityInOverlay: false,
    showSpyroIndicator: true,
    goalStyle: 'grape',
    eventsFade: false,
    eventsFadeAfterMs: 10000,
};

// DOM refs
const $channel = document.getElementById('channel');
const $goalLabel = document.getElementById('goal-label');
const $goalTarget = document.getElementById('goal-target');
const $subTier1 = document.getElementById('sub-tier1');
const $subTier2 = document.getElementById('sub-tier2');
const $subTier3 = document.getElementById('sub-tier3');
const $hideGiftedOverlay = document.getElementById('hide-gifted-overlay');
const $hidePrimeOverlay = document.getElementById('hide-prime-overlay');
const $hideCommunityOverlay = document.getElementById('hide-community-overlay');
const $showSpyroIndicator = document.getElementById('show-spyro-indicator');
const $goalStyle = document.getElementById('goal-style');
const $overlayWidth = document.getElementById('overlay-width');
const $eventsFade = document.getElementById('events-fade');
const $eventsFadeMs = document.getElementById('events-fade-ms');
const $manualPoints = document.getElementById('manual-points');
const $btnSetPoints = document.getElementById('btn-set-points');
const $keyNone = document.getElementById('key-none');
const $keyVal = document.getElementById('key-val');
const $btnCopyUrl = document.getElementById('btn-copy-url');
const $btnKey = document.getElementById('btn-key');
const $btnSave = document.getElementById('btn-save');
const $btnTestTier1 = document.getElementById('btn-test-tier1');
const $btnTestTier2 = document.getElementById('btn-test-tier2');
const $btnTestTier3 = document.getElementById('btn-test-tier3');
const $btnTestGift1 = document.getElementById('btn-test-gift1');
const $btnTestGift2 = document.getElementById('btn-test-gift2');
const $btnTestReset = document.getElementById('btn-test-reset');
const $testUsername = document.getElementById('test-username');
const $dotOv = document.getElementById('dot-ov');
const $statusOv = document.getElementById('status-ov');
const $msg = document.getElementById('msg');
const $preview = document.getElementById('preview');
const $previewNote = document.getElementById('preview-note');

let channel = '';
let key = '';
let keyVersion = '';
let settings = { ...DEFAULTS };
let bridge = null;
let roomGen = 0;

function flash(text, kind = 'accent') {
    $msg.textContent = text;
    $msg.className = 'msg ' + kind;
    $msg.hidden = false;
    clearTimeout(window._flashTimer);
    window._flashTimer = setTimeout(() => { $msg.hidden = true; }, 4000);
}

function setOverlay(kind, text) {
    $dotOv.className = 'dot' + (kind ? ' ' + kind : '');
    $statusOv.textContent = text;
}

function showKey() {
    const has = !!key;
    $keyVal.textContent = key;
    $keyVal.hidden = !has;
    $keyNone.hidden = has;
    $btnCopyUrl.disabled = !has || !channel;
    $btnKey.textContent = has ? 'Change key' : 'Generate key';
    if (channel) {
        setOverlay(has ? 'live' : '', 'Channel: ' + channel);
    }
}

function buildOverlayUrl(ch, k) {
    const base = new URL('index.html', location.href);
    base.hash = 'c=' + encodeURIComponent(norm(ch)) + '&k=' + encodeURIComponent(k);
    return base.href;
}

function updatePreview() {
    if (channel && key) {
        $preview.src = buildOverlayUrl(channel, key);
        $preview.hidden = false;
        $previewNote.textContent = 'Live preview: what you see is what goes into OBS.';
    } else {
        $preview.hidden = true;
        $previewNote.textContent = 'Generate a key to preview the overlay.';
    }
}

function buildLivePreviewSettings() {
    const style = $goalStyle ? $goalStyle.value : (settings.goalStyle || 'grape');
    const pal = PALETTES[style] || PALETTES.grape;
    return {
        goalLabel: $goalLabel.value,
        goalTarget: parseInt($goalTarget.value, 10) || 200,
        goalBarColor: pal.colors[1] || '#946ef9',
        goalBarEnabled: true,
        overlayWidth: parseInt($overlayWidth.value, 10) || 600,
        overlayHeight: 100,
        subTier1Points: parseInt($subTier1.value, 10) || 1,
        subTier2Points: parseInt($subTier2.value, 10) || 2,
        subTier3Points: parseInt($subTier3.value, 10) || 6,
        hideGiftedInOverlay: $hideGiftedOverlay.checked,
        hidePrimeInOverlay: $hidePrimeOverlay.checked,
        hideCommunityInOverlay: $hideCommunityOverlay.checked,
        showSpyroIndicator: $showSpyroIndicator.checked,
        goalStyle: style,
        eventsFade: $eventsFade ? $eventsFade.checked : (settings.eventsFade === true),
        eventsFadeAfterMs: $eventsFadeMs ? (parseInt($eventsFadeMs.value, 10) || 10000) : (settings.eventsFadeAfterMs || 10000),
    };
}

function updatePreviewLive() {
    if (!channel || !key) return;
    const s = buildLivePreviewSettings();
    if ($preview && !$preview.hidden) {
        try {
            if ($preview.contentWindow && typeof $preview.contentWindow.postMessage === 'function') {
                $preview.contentWindow.postMessage({ type: 'goal-preview', settings: s }, '*');
            }
        } catch (e) {}
    }
}

function loadSettingsFor(ch) {
    settings = getSettings(ch, { ...DEFAULTS });
    $goalLabel.value = settings.goalLabel;
    $goalTarget.value = settings.goalTarget;
    $subTier1.value = settings.subTier1Points;
    $subTier2.value = settings.subTier2Points;
    $subTier3.value = settings.subTier3Points;
    $hideGiftedOverlay.checked = settings.hideGiftedInOverlay === true;
    $hidePrimeOverlay.checked = settings.hidePrimeInOverlay === true;
    $hideCommunityOverlay.checked = settings.hideCommunityInOverlay === true;
    if ($showSpyroIndicator) $showSpyroIndicator.checked = settings.showSpyroIndicator === true;
    if ($goalStyle) $goalStyle.value = settings.goalStyle || 'grape';
    $overlayWidth.value = settings.overlayWidth;
    if ($eventsFade) $eventsFade.checked = settings.eventsFade === true;
    if ($eventsFadeMs) $eventsFadeMs.value = settings.eventsFadeAfterMs || 10000;
    updatePreviewLive();
}

function saveSettingsToStorage() {
    if (!channel) { flash('Enter your channel first'); return; }
    const style = $goalStyle ? $goalStyle.value : 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    const s = {
        goalLabel: $goalLabel.value,
        goalTarget: parseInt($goalTarget.value, 10) || 200,
        goalBarColor: pal.colors[1] || '#946ef9',
        goalBarEnabled: true,
        overlayWidth: parseInt($overlayWidth.value, 10) || 600,
        overlayHeight: 100,
        subTier1Points: parseInt($subTier1.value, 10) || 1,
        subTier2Points: parseInt($subTier2.value, 10) || 2,
        subTier3Points: parseInt($subTier3.value, 10) || 6,
        hideGiftedInOverlay: $hideGiftedOverlay.checked,
        hidePrimeInOverlay: $hidePrimeOverlay.checked,
        hideCommunityInOverlay: $hideCommunityOverlay.checked,
        showSpyroIndicator: $showSpyroIndicator.checked,
        goalStyle: style,
        eventsFade: $eventsFade ? $eventsFade.checked : false,
        eventsFadeAfterMs: $eventsFadeMs ? (parseInt($eventsFadeMs.value, 10) || 10000) : 10000,
    };
    saveSettings(channel, s);
    settings = s;
    // push live to all connected overlays via Supabase
    if (bridge && bridge.isConnected()) {
        bridge.sendSet({ settings: s });
    }
    flash('Settings saved for ' + channel);
}

// ---- supabase room (dashboard <-> overlay) ----
async function startRoom() {
    const gen = ++roomGen;
    if (bridge) { await bridge.leave(); bridge = null; }
    if (!channel || !key) { setOverlay('', 'No channel'); return; }
    setOverlay('busy', 'Connecting...');
    try {
        const b = createBridge(key);
        b.onStatus((s) => {
            if (s === 'CHANNEL_ERROR') setOverlay('err', 'Key rejected');
            else if (s === 'CLOSED') setOverlay('', 'Room closed');
        });
        b.onHello(() => {
            setOverlay('live', 'Overlay connected');
            // confirm current settings to any overlay that just joined
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
        setOverlay('err', m === 'CHANNEL_ERROR' ? 'Key rejected' : m === 'TIMED_OUT' ? 'No response' : 'Could not connect to room');
    }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        ta.remove();
    }
}

// ---- channel input ----
$channel.addEventListener('change', () => {
    // Intentionally no-op: channel changes only take effect when
    // "Change key" is clicked and the page reloads.
});

$btnKey.addEventListener('click', async () => {
    const ch = norm($channel.value.trim());
    if (!ch) { flash('Enter your channel first'); return; }
    channel = ch;
    const had = hasKey(channel);
    if (had) {
        if (!confirm('Generate a new key? The old overlay URL will stop working until you paste the new one in OBS.')) return;
    }
    key = generateKey();
    saveKey(channel, key);
    keyVersion = (parseInt(keyVersion || '0', 10) + 1).toString();
    saveKeyVersion(channel, keyVersion);
    showKey();
    // Store a one-shot flash so the reload can show it once then clear it.
    sessionStorage.setItem('key-generated', had ? 'New key generated and URL copied. Update OBS.' : 'Key generated and URL copied. Paste in OBS.');
    localStorage.setItem('goal_overlay_last_channel', channel);
    await copyText(buildOverlayUrl(channel, key));
    location.reload();
});

$btnCopyUrl.addEventListener('click', async () => {
    const url = buildOverlayUrl(channel, key);
    await copyText(url);
    flash('Overlay URL copied');
});

$btnSave.addEventListener('click', saveSettingsToStorage);

if ($btnSetPoints) {
    $btnSetPoints.addEventListener('click', () => {
        if (!channel) { flash('Enter your channel first'); return; }
        const pts = Math.max(0, parseInt($manualPoints && $manualPoints.value, 10) || 0);
        if (bridge && bridge.isConnected()) {
            bridge.send('setPoints', { points: pts });
            flash('Points set to ' + pts);
        } else {
            flash('Overlay not connected to room');
        }
    });
}

if ($goalLabel) $goalLabel.addEventListener('input', updatePreviewLive);
if ($goalTarget) $goalTarget.addEventListener('input', updatePreviewLive);
if ($subTier1) $subTier1.addEventListener('input', updatePreviewLive);
if ($subTier2) $subTier2.addEventListener('input', updatePreviewLive);
if ($subTier3) $subTier3.addEventListener('input', updatePreviewLive);
if ($overlayWidth) $overlayWidth.addEventListener('input', updatePreviewLive);
if ($goalStyle) $goalStyle.addEventListener('change', updatePreviewLive);
if ($hideGiftedOverlay) $hideGiftedOverlay.addEventListener('change', updatePreviewLive);
if ($hidePrimeOverlay) $hidePrimeOverlay.addEventListener('change', updatePreviewLive);
if ($hideCommunityOverlay) $hideCommunityOverlay.addEventListener('change', updatePreviewLive);
if ($showSpyroIndicator) $showSpyroIndicator.addEventListener('change', updatePreviewLive);
if ($eventsFade) $eventsFade.addEventListener('change', updatePreviewLive);
if ($eventsFadeMs) $eventsFadeMs.addEventListener('input', updatePreviewLive);

// ---- test events ----
$btnTestTier1.addEventListener('click', () => sendTest('1000', false));
$btnTestTier2.addEventListener('click', () => sendTest('2000', false));
$btnTestTier3.addEventListener('click', () => sendTest('3000', false));
$btnTestGift1.addEventListener('click', () => sendTest('1000', true));
$btnTestGift2.addEventListener('click', () => sendTest('2000', true));
$btnTestReset.addEventListener('click', () => sendTestReset());

function sendTest(tier, isGifted) {
    if (!channel) { flash('Enter your channel first'); return; }
    const username = $testUsername.value.trim() || 'Viewer';
    if (bridge && bridge.isConnected()) {
        bridge.sendAddPoints({ tier, username, isGifted });
        flash('Test: ' + (isGifted ? 'Gifted ' : '') + 'Tier ' + tier + ' sub by ' + username);
    } else {
        flash('Overlay not connected to room');
    }
}

function sendTestReset() {
    if (!channel) { flash('Enter your channel first'); return; }
    if (bridge && bridge.isConnected()) {
        bridge.sendResetPoints({ type: 'test' });
        flash('Test events cleared from history');
    } else {
        flash('Overlay not connected to room');
    }
}

// ---- init ----
const savedChannel = localStorage.getItem('goal_overlay_last_channel');
if (savedChannel) {
    $channel.value = savedChannel;
    channel = norm(savedChannel);
    key = getKey(channel);
    keyVersion = getKeyVersion(channel);
    showKey();
    // Show one-shot flash from key-generation reload, then clear it.
    const pending = sessionStorage.getItem('key-generated');
    if (pending) { flash(pending); sessionStorage.removeItem('key-generated'); }
    loadSettingsFor(channel);
    startRoom();
    updatePreview();
}

window.addEventListener('beforeunload', () => {
    if (channel) localStorage.setItem('goal_overlay_last_channel', channel);
});
