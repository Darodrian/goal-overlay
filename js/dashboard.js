import {
    getSettings, saveSettings,
    getKey, saveKey, saveKeyVersion, getKeyVersion, hasKey, generateKey,
    norm,
} from './storage.js';
import { createBridge } from './bridge.js';

const DEFAULTS = {
    goalLabel: 'Meta Partner Plus 2',
    goalTarget: 200,
    goalBarColor: '#946ef9',
    goalBarEnabled: true,
    overlayWidth: 600,
    overlayHeight: 300,
    subTier1Points: 1,
    subTier2Points: 2,
    subTier3Points: 6,
    hideGiftedInOverlay: false,
    hidePrimeInOverlay: false,
    hideCommunityInOverlay: false,
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
const $overlayWidth = document.getElementById('overlay-width');
const $overlayHeight = document.getElementById('overlay-height');
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
    $overlayWidth.value = settings.overlayWidth;
    $overlayHeight.value = settings.overlayHeight;
}

function saveSettingsToStorage() {
    if (!channel) { flash('Enter your channel first'); return; }
    const s = {
        goalLabel: $goalLabel.value,
        goalTarget: parseInt($goalTarget.value, 10) || 200,
        goalBarColor: '#946ef9',
        goalBarEnabled: true,
        overlayWidth: parseInt($overlayWidth.value, 10) || 600,
        overlayHeight: parseInt($overlayHeight.value, 10) || 300,
        subTier1Points: parseInt($subTier1.value, 10) || 1,
        subTier2Points: parseInt($subTier2.value, 10) || 2,
        subTier3Points: parseInt($subTier3.value, 10) || 6,
        hideGiftedInOverlay: $hideGiftedOverlay.checked,
        hidePrimeInOverlay: $hidePrimeOverlay.checked,
        hideCommunityInOverlay: $hideCommunityOverlay.checked,
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
    const ch = norm($channel.value.trim());
    if (!ch) return;
    channel = ch;
    key = getKey(channel);
    keyVersion = getKeyVersion(channel);
    showKey();
    loadSettingsFor(channel);
    startRoom();
    updatePreview();
});

$btnKey.addEventListener('click', async () => {
    if (!channel) { flash('Enter your channel first'); return; }
    const had = hasKey(channel);
    if (had) {
        if (!confirm('Generate a new key? The old overlay URL will stop working until you paste the new one in OBS.')) return;
    }
    key = generateKey();
    saveKey(channel, key);
    keyVersion = (parseInt(keyVersion || '0', 10) + 1).toString();
    saveKeyVersion(channel, keyVersion);
    showKey();
    // tell any connected overlay its session is invalid, then rotate the room
    if (bridge && bridge.isConnected()) {
        bridge.sendKeyChanged({ version: keyVersion });
    }
    await startRoom();
    updatePreview();
    await copyText(buildOverlayUrl(channel, key));
    flash(had ? 'New key generated and URL copied. Update OBS.' : 'Key generated and URL copied. Paste in OBS.');
});

$btnCopyUrl.addEventListener('click', async () => {
    const url = buildOverlayUrl(channel, key);
    await copyText(url);
    flash('Overlay URL copied');
});

$btnSave.addEventListener('click', saveSettingsToStorage);

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
        bridge.sendResetPoints({});
        flash('Test: Points reset');
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
    loadSettingsFor(channel);
    startRoom();
    updatePreview();
}

window.addEventListener('beforeunload', () => {
    if (channel) localStorage.setItem('goal_overlay_last_channel', channel);
});
