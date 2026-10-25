import { createBridge } from './bridge.js';
import {
    getSettings, saveSettings,
    getKey, saveKey, getKeyVersion, hasKey,
    getPoints, savePoints,
    normChannel, overlayKey,
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
    hideGiftedInOverlay: false,
    hidePrimeInOverlay: false,
    hideCommunityInOverlay: false,
    goalDataSource: 'persist',
    startingPoints: 0,
    goalManualPoints: 0,
    fontColor: '#c5b5fb',
    backgroundColor: 'rgba(62, 35, 95, 0.35)',
};

let channel = '';
let settings = { ...DEFAULTS };
let goalCurrentPoints = 0;
let goalEnabled = true;
let overlayKeyVersion = '';
let validateTimer = null;
let bridge = null;

// DOM refs
const $goalLabel = document.getElementById('goal-label');
const $goalProgress = document.getElementById('goal-progress');
const $goalFill = document.getElementById('goal-fill');
const $goalContainer = document.getElementById('goal-container');
const $subEvents = document.getElementById('sub-events');
const $setupNotice = document.getElementById('setup-notice');
const $obsUrl = document.getElementById('obs-url');

function pointsForTier(tier) {
    const t = String(tier);
    if (t === '3000' || t === '3') return settings.subTier3Points;
    if (t === '2000' || t === '2') return settings.subTier2Points;
    return settings.subTier1Points;
}

function tierName(tier) {
    const t = String(tier);
    if (t === '3000' || t === '3') return 'Tier 3';
    if (t === '2000' || t === '2') return 'Tier 2';
    if (t === '1000' || t === '1') return 'Tier 1';
    if (t === 'Prime' || t.toLowerCase() === 'prime') return 'Prime';
    return 'Tier ' + t;
}

function addSubEvent(username, tier, isGifted, isCommunity) {
    if (!$subEvents) return;

    const isPrime = String(tier).toLowerCase() === 'prime';
    if (isCommunity && settings.hideCommunityInOverlay) return;
    if (isGifted && !isCommunity && settings.hideGiftedInOverlay) return;
    if (isPrime && !isGifted && !isCommunity && settings.hidePrimeInOverlay) return;

    const name = tierName(tier);
    let text;
    if (isCommunity) {
        text = 'Community gifted ' + name + ' sub';
    } else if (isGifted) {
        text = username + ' gifted ' + name + ' sub';
    } else if (isPrime) {
        text = username + ' subscribed with Prime';
    } else {
        text = username + ' subscribed ' + name;
    }

    const item = document.createElement('div');
    item.className = 'sub-event';
    item.textContent = text;

    $subEvents.insertBefore(item, $subEvents.firstChild);

    while ($subEvents.children.length > 5) {
        $subEvents.removeChild($subEvents.lastChild);
    }

    setTimeout(() => {
        item.style.opacity = '0';
        setTimeout(() => { if (item.parentNode) item.remove(); }, 500);
    }, 10000);
}

function isPrimeSub(userstate) {
    return userstate['sub-plan'] === 'Prime' ||
           userstate['isPrime'] === true ||
           String(userstate['sub-plan']).toLowerCase() === 'prime';
}

function isCommunityGift(event, userstate) {
    return event.communityGift === true ||
           event.isCommunityGift === true ||
           event.giftType === 'community' ||
           event.isCommunity === true ||
           event.community_gift === true ||
           (userstate && (userstate['msg-param-gifted'] === 'community' || userstate['msg-param-promogift'] === '1'));
}

function isGiftedSub(event, userstate) {
    const gifted = event.gifted === true || event.amount === 'gift' ||
                   (userstate && (userstate['msg-param-gifted'] === '1' || userstate['msg-param-gifted'] === true));
    return gifted && !isCommunityGift(event, userstate);
}

function updateBar() {
    const pct = settings.goalTarget > 0
        ? Math.min(goalCurrentPoints / settings.goalTarget, 1) * 100
        : 0;
    $goalFill.style.width = pct + '%';
    $goalProgress.textContent = goalCurrentPoints + ' / ' + settings.goalTarget;
    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
}

function applySize() {
    $goalContainer.style.width = settings.overlayWidth + 'px';
    $goalContainer.style.height = settings.overlayHeight + 'px';
}

function initGoal() {
    settings = getSettings(channel, DEFAULTS);

    $goalLabel.textContent = settings.goalLabel;
    $goalProgress.textContent = '0 / ' + settings.goalTarget;

    goalEnabled = settings.goalBarEnabled !== false;
    if (!goalEnabled) {
        document.querySelector('.goal-bar').style.display = 'none';
    }

    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
    applySize();
    updateBar();

    const manual = parseInt(settings.goalManualPoints, 10) || 0;
    if (manual > 0) {
        goalCurrentPoints = manual;
    } else if (settings.goalDataSource === 'reset') {
        goalCurrentPoints = 0;
    } else if (settings.goalDataSource === 'manual') {
        goalCurrentPoints = parseInt(settings.startingPoints, 10) || 0;
    } else {
        // persist
        goalCurrentPoints = getPoints(channel);
    }
    savePoints(channel, goalCurrentPoints);
    updateBar();

    overlayKeyVersion = getKeyVersion(channel);

    connectRoom();

    // Poll session validity so OBS (no BroadcastChannel from dashboard) also
    // gets invalidated when the dashboard regenerates the key.
    if (validateTimer) clearInterval(validateTimer);
    validateTimer = setInterval(validateSession, 3000);
}

// ---- supabase room (overlay <- dashboard) ----
async function connectRoom() {
    if (!channel || !key) return;
    try {
        const b = createBridge(key);
        b.onStatus((s) => {
            if (s === 'CHANNEL_ERROR') {
                $setupNotice.classList.add('show');
                $obsUrl.textContent = location.origin + location.pathname + '?c=' + channel + '&k=' + getKey(channel);
            }
        });
        b.onSet((payload) => {
            if (!validateSession()) return;
            const s = payload && payload.settings;
            if (!s) return;
            settings = { ...DEFAULTS, ...s };
            $goalLabel.textContent = settings.goalLabel;
            goalEnabled = settings.goalBarEnabled !== false;
            document.querySelector('.goal-bar').style.display = goalEnabled ? '' : 'none';
            document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
            applySize();
            updateBar();
        });
        b.onAddPoints((payload) => {
            if (!validateSession()) return;
            addPoints(payload.tier);
            addSubEvent(payload.username || 'Viewer', payload.tier, payload.isGifted === true, false);
        });
        b.onResetPoints((payload) => {
            if (!validateSession()) return;
            resetGoalPoints();
        });
        b.onKeyChanged((payload) => {
            disconnectOverlay('Key regenerated by dashboard.');
        });
        await b.connect();
        bridge = b;
        b.sendHello();
    } catch (e) {
        bridge = null;
        console.warn('[overlay] room unavailable, continuing without live updates', e?.message ?? e);
    }
}

function addPoints(tier) {
    goalCurrentPoints += pointsForTier(tier);
    savePoints(channel, goalCurrentPoints);
    updateBar();
}

function resetGoalPoints() {
    goalCurrentPoints = 0;
    savePoints(channel, goalCurrentPoints);
    updateBar();
}

// ---- session validation ----
// Ensures the overlay's key/version still matches what the dashboard has
// stored. If the dashboard generated a new key, this overlay's session is
// invalid and it must disconnect. Runs on BroadcastChannel messages and via
// polling so OBS (which doesn't receive BroadcastChannel from the dashboard)
// also gets invalidated.
function validateSession() {
    const storedKey = getKey(channel);
    const storedVersion = getKeyVersion(channel);
    if (!channel || !key) {
        disconnectOverlay('Missing key.');
        return false;
    }
    if (key !== storedKey) {
        // URL key is authoritative - sync it (important for OBS cross-context)
        saveKey(channel, key);
        overlayKeyVersion = getKeyVersion(channel);
        return true;
    }
    if (overlayKeyVersion !== storedVersion) {
        disconnectOverlay('Key changed. Generate a new overlay URL in the dashboard.');
        return false;
    }
    return true;
}

function disconnectOverlay(reason) {
    try {
        if (bridge) { bridge.leave(); bridge = null; }
    } catch (e) {}
    try {
        if (window.ComfyJS && window.ComfyJS.Disconnect) {
            window.ComfyJS.Disconnect();
        }
    } catch (e) {}
    $setupNotice.classList.add('show');
    $obsUrl.textContent = location.origin + location.pathname + '?c=' + channel + '&k=' + getKey(channel);
    if (validateTimer) { clearInterval(validateTimer); validateTimer = null; }
    console.log('Goal Overlay session invalid: ' + reason);
}

function handleSubscriber(actor, tier, isGifted, isCommunity) {
    const isPrime = isPrimeSub({ 'sub-plan': tier });
    // If hidden in overlay, don't count for goal
    if (isCommunity && settings.hideCommunityInOverlay) {
        addSubEvent(actor, tier, isGifted, isCommunity);
        return;
    }
    if (isGifted && !isCommunity && settings.hideGiftedInOverlay) {
        addSubEvent(actor, tier, isGifted, isCommunity);
        return;
    }
    if (isPrime && !isGifted && !isCommunity && settings.hidePrimeInOverlay) {
        addSubEvent(actor, tier, isGifted, isCommunity);
        return;
    }
    addPoints(tier);
    addSubEvent(actor, tier, isGifted, isCommunity);
}

function initComfy() {
    if (!window.ComfyJS) {
        console.error('Goal Overlay: ComfyJS not loaded');
        return;
    }

    window.ComfyJS.onSubscriber = (channelName, username, message, userstate, methods) => {
        handleSubscriber(username, userstate['sub-plan'], false, false);
    };

    window.ComfyJS.onSubGift = (channelName, username, sender, userstate, methods) => {
        handleSubscriber(sender, userstate['sub-plan'], true, false);
    };

    window.ComfyJS.onCommunitySubGift = (channelName, username, userstate, methods) => {
        handleSubscriber('Community', userstate['sub-plan'], true, true);
    };

    window.ComfyJS.onPrime = (channelName, username, message, userstate, methods) => {
        handleSubscriber(username, 'Prime', false, false);
    };

    window.ComfyJS.Init(channel);
}

// ---- entry point ----
channel = normChannel();
const key = overlayKey();

if (!channel) {
    $setupNotice.classList.add('show');
    $obsUrl.textContent = location.origin + location.pathname + '?c=yourchannel&k=yourkey';
    // still init with defaults for preview
    settings = { ...DEFAULTS };
    initGoal();
} else {
    // Use URL key as source of truth (critical for OBS Browser Source where localStorage may differ)
    const storedKey = getKey(channel);
    if (key) {
        if (storedKey !== key) {
            saveKey(channel, key);
            // also update key version to match
        }
        overlayKeyVersion = getKeyVersion(channel);
        initGoal();
        initComfy();
    } else if (storedKey) {
        $setupNotice.classList.add('show');
        $obsUrl.textContent = location.origin + location.pathname + '?c=' + channel + '&k=' + storedKey;
    } else {
        $setupNotice.classList.add('show');
        $obsUrl.textContent = location.origin + location.pathname + '?c=yourchannel&k=yourkey';
        settings = { ...DEFAULTS };
        initGoal();
    }
}

window.addPoints = addPoints;
window.resetGoalPoints = resetGoalPoints;
