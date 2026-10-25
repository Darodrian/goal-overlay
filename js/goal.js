import {
    getSettings, saveSettings,
    getKey, saveKey, hasKey,
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
    countGiftedSubs: true,
    countPrimeSubs: true,
    countCommunityGiftSubs: true,
    displayGiftedSubs: true,
    displayPrimeSubs: true,
    displayCommunityGiftSubs: true,
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

// DOM refs
const $goalLabel = document.getElementById('goal-label');
const $goalProgress = document.getElementById('goal-progress');
const $goalFill = document.getElementById('goal-fill');
const $goalContainer = document.getElementById('goal-container');
const $setupNotice = document.getElementById('setup-notice');
const $obsUrl = document.getElementById('obs-url');

function pointsForTier(tier) {
    const t = String(tier);
    if (t === '3000' || t === '3') return settings.subTier3Points;
    if (t === '2000' || t === '2') return settings.subTier2Points;
    return settings.subTier1Points;
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

    // listen for settings changes from dashboard (BroadcastChannel, same origin)
    const bc = new BroadcastChannel('goal_overlay_settings');
    bc.onmessage = (ev) => {
        if (ev.data && ev.data.channel === channel) {
            settings = getSettings(channel, DEFAULTS);
            $goalLabel.textContent = settings.goalLabel;
            goalEnabled = settings.goalBarEnabled !== false;
            document.querySelector('.goal-bar').style.display = goalEnabled ? '' : 'none';
            document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
            applySize();
            updateBar();
        }
    };
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

function handleSubscriber(username, userstate) {
    const isGifted = isGiftedSub({}, userstate);
    const isCommunity = isCommunityGift({}, userstate);
    const isPrime = isPrimeSub(userstate);

    // Counting logic
    let shouldCount = true;
    if (isCommunity && !settings.countCommunityGiftSubs) shouldCount = false;
    if (isGifted && !settings.countGiftedSubs) shouldCount = false;
    if (isPrime && !settings.countPrimeSubs) shouldCount = false;

    if (shouldCount) addPoints(userstate['sub-plan']);
}

function initComfy() {
    if (!window.ComfyJS) {
        console.error('Goal Overlay: ComfyJS not loaded');
        return;
    }

    window.ComfyJS.onSubscriber = (channelName, username, message, userstate, methods) => {
        handleSubscriber(username, userstate);
    };

    window.ComfyJS.onSubGift = (channelName, username, sender, userstate, methods) => {
        handleSubscriber(username, userstate);
    };

    window.ComfyJS.onCommunitySubGift = (channelName, username, userstate, methods) => {
        handleSubscriber(username, userstate);
    };

    window.ComfyJS.onPrime = (channelName, username, message, userstate, methods) => {
        handleSubscriber(username, userstate);
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
    // key validation: if a key exists for this channel, it must match
    const storedKey = getKey(channel);
    if (storedKey && storedKey !== key) {
        $setupNotice.classList.add('show');
        $obsUrl.textContent = location.origin + location.pathname + '?c=' + channel + '&k=' + storedKey;
    } else {
        if (key && !storedKey) {
            saveKey(channel, key);
        }
        initGoal();
        initComfy();
    }
}

window.addPoints = addPoints;
window.resetGoalPoints = resetGoalPoints;

// ---- test panel toggle (for offline testing without real Twitch events) ----
const $testPanel = document.getElementById('test-panel');
const $testToggle = document.getElementById('test-toggle');
const $testBox = document.getElementById('test-box');
if ($testPanel && $testToggle && $testBox) {
    $testToggle.addEventListener('click', () => {
        $testBox.hidden = !$testBox.hidden;
    });
}
