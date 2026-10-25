import {
    getSettings, saveSettings,
    getKey, saveKey, hasKey, generateKey,
    norm,
} from './storage.js';

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
    countGiftedSubs: true,
    countPrimeSubs: true,
    countCommunityGiftSubs: true,
    displayGiftedSubs: true,
    displayPrimeSubs: true,
    displayCommunityGiftSubs: true,
    goalDataSource: 'persist',
    startingPoints: 0,
    goalManualPoints: 0,
};

// DOM refs
const $channel = document.getElementById('channel');
const $goalLabel = document.getElementById('goal-label');
const $goalTarget = document.getElementById('goal-target');
const $goalColor = document.getElementById('goal-color');
const $subTier1 = document.getElementById('sub-tier1');
const $subTier2 = document.getElementById('sub-tier2');
const $subTier3 = document.getElementById('sub-tier3');
const $countGifted = document.getElementById('count-gifted');
const $countPrime = document.getElementById('count-prime');
const $countCommunity = document.getElementById('count-community');
const $displayGifted = document.getElementById('display-gifted');
const $displayPrime = document.getElementById('display-prime');
const $displayCommunity = document.getElementById('display-community');
const $goalDataSource = document.getElementById('goal-data-source');
const $startingPoints = document.getElementById('starting-points');
const $goalManualPoints = document.getElementById('goal-manual-points');
const $overlayWidth = document.getElementById('overlay-width');
const $overlayHeight = document.getElementById('overlay-height');
const $keyNone = document.getElementById('key-none');
const $keyVal = document.getElementById('key-val');
const $btnCopyUrl = document.getElementById('btn-copy-url');
const $btnKey = document.getElementById('btn-key');
const $btnSave = document.getElementById('btn-save');
const $btnResetPoints = document.getElementById('btn-reset-points');
const $btnTestTier1 = document.getElementById('btn-test-tier1');
const $btnTestTier2 = document.getElementById('btn-test-tier2');
const $btnTestTier3 = document.getElementById('btn-test-tier3');
const $btnTestGift1 = document.getElementById('btn-test-gift1');
const $btnTestGift2 = document.getElementById('btn-test-gift2');
const $btnTestReset = document.getElementById('btn-test-reset');
const $dotOv = document.getElementById('dot-ov');
const $statusOv = document.getElementById('status-ov');
const $msg = document.getElementById('msg');
const $preview = document.getElementById('preview');
const $previewNote = document.getElementById('preview-note');

let channel = '';
let key = '';
let settings = { ...DEFAULTS };
let bc = new BroadcastChannel('goal_overlay_settings');

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
    $goalColor.value = settings.goalBarColor;
    $subTier1.value = settings.subTier1Points;
    $subTier2.value = settings.subTier2Points;
    $subTier3.value = settings.subTier3Points;
    $countGifted.checked = settings.countGiftedSubs !== false;
    $countPrime.checked = settings.countPrimeSubs !== false;
    $countCommunity.checked = settings.countCommunityGiftSubs !== false;
    $displayGifted.checked = settings.displayGiftedSubs !== false;
    $displayPrime.checked = settings.displayPrimeSubs !== false;
    $displayCommunity.checked = settings.displayCommunityGiftSubs !== false;
    $goalDataSource.value = settings.goalDataSource;
    $startingPoints.value = settings.startingPoints;
    $goalManualPoints.value = settings.goalManualPoints;
    $overlayWidth.value = settings.overlayWidth;
    $overlayHeight.value = settings.overlayHeight;
}

function saveSettingsToStorage() {
    if (!channel) { flash('Enter your channel first'); return; }
    const s = {
        goalLabel: $goalLabel.value,
        goalTarget: parseInt($goalTarget.value, 10) || 200,
        goalBarColor: $goalColor.value,
        goalBarEnabled: true,
        overlayWidth: parseInt($overlayWidth.value, 10) || 600,
        overlayHeight: parseInt($overlayHeight.value, 10) || 300,
        subTier1Points: parseInt($subTier1.value, 10) || 1,
        subTier2Points: parseInt($subTier2.value, 10) || 2,
        subTier3Points: parseInt($subTier3.value, 10) || 6,
        countGiftedSubs: $countGifted.checked,
        countPrimeSubs: $countPrime.checked,
        countCommunityGiftSubs: $countCommunity.checked,
        displayGiftedSubs: $displayGifted.checked,
        displayPrimeSubs: $displayPrime.checked,
        displayCommunityGiftSubs: $displayCommunity.checked,
        goalDataSource: $goalDataSource.value,
        startingPoints: parseInt($startingPoints.value, 10) || 0,
        goalManualPoints: parseInt($goalManualPoints.value, 10) || 0,
    };
    saveSettings(channel, s);
    settings = s;
    // notify overlay in real time (same origin BroadcastChannel)
    bc.postMessage({ channel: channel });
    flash('Settings saved for ' + channel);
}

function resetPoints() {
    if (!channel) { flash('Enter your channel first'); return; }
    try { localStorage.removeItem('goal_overlay_' + norm(channel) + '_points'); } catch (e) {}
    flash('Points reset to 0 for ' + channel);
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
    showKey();
    loadSettingsFor(channel);
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
    showKey();
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
$btnResetPoints.addEventListener('click', resetPoints);

$btnTestTier1.addEventListener('click', () => sendTest('1000'));
$btnTestTier2.addEventListener('click', () => sendTest('2000'));
$btnTestTier3.addEventListener('click', () => sendTest('3000'));
$btnTestGift1.addEventListener('click', () => sendTest('1000'));
$btnTestGift2.addEventListener('click', () => sendTest('2000'));
$btnTestReset.addEventListener('click', () => sendTestReset());

function sendTest(tier) {
    if (!channel) { flash('Enter your channel first'); return; }
    bc.postMessage({ channel: channel, type: 'addPoints', tier: tier });
    flash('Test: Tier ' + tier + ' sub');
}

function sendTestReset() {
    if (!channel) { flash('Enter your channel first'); return; }
    bc.postMessage({ channel: channel, type: 'resetPoints' });
    flash('Test: Points reset');
}

// ---- init ----
const savedChannel = localStorage.getItem('goal_overlay_last_channel');
if (savedChannel) {
    $channel.value = savedChannel;
    channel = norm(savedChannel);
    key = getKey(channel);
    showKey();
    loadSettingsFor(channel);
    updatePreview();
}

window.addEventListener('beforeunload', () => {
    if (channel) localStorage.setItem('goal_overlay_last_channel', channel);
});
