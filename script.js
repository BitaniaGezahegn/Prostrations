import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

import { auth, db, googleProvider } from "./firebase_config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, arrayUnion, increment, collection, addDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const video = document.getElementById('webcam');
const canvas = document.getElementById('output_canvas');
const canvasCtx = canvas.getContext('2d');
const webcamButton = document.getElementById('webcamButton');
const toggleSkeletonButton = document.getElementById('toggleSkeletonButton');
const calibrateButton = document.getElementById('calibrateButton');
const calibrationSection = document.getElementById('calibrationSection');
const calibrationStatus = document.getElementById('calibrationStatus');
const muteButton = document.getElementById('muteButton');
const clearButton = document.getElementById('clearButton');
const resetTotalButton = document.getElementById('resetTotalButton');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const totalDisplay = document.getElementById('totalDisplay');
const goalDisplay = document.getElementById('goalDisplay');
const goalActionBtn = document.getElementById('goalActionBtn');
const ringMorning = document.getElementById('ringMorning');
const ringNight = document.getElementById('ringNight');
const dailyTotalDisplay = document.getElementById('dailyTotalDisplay');
const dailyQuestCard = document.getElementById('dailyQuestCard');
const sessionCountDisplay = document.getElementById('sessionCountDisplay');
const successOverlay = document.getElementById('successOverlay');
const closeSuccess = document.getElementById('closeSuccess');
const setNewGoalSuccess = document.getElementById('setNewGoalSuccess');
const goalModal = document.getElementById('goalModal');
const modalGoalInput = document.getElementById('modalGoalInput');
const saveGoalBtn = document.getElementById('saveGoal');
const cancelGoalBtn = document.getElementById('cancelGoal');
const goalError = document.getElementById('goalError');
const currentSessionRef = document.getElementById('currentSessionRef');
const goalProgressBarContainer = document.getElementById('goalProgressBarContainer');
const goalProgressBarFill = document.getElementById('goalProgressBarFill');
const goalProgressText = document.getElementById('goalProgressText');
const drawingUtils = new DrawingUtils(canvasCtx);
const loginBtn = document.getElementById('loginBtn');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const signOutBtn = document.getElementById('signOutBtn');
const streakContainer = document.getElementById('streakContainer');
const streakCountDisplay = document.getElementById('streakCount');
const heatmapGrid = document.getElementById('heatmapGrid');
const heatmapContainer = document.getElementById('heatmapContainer');
const streakModal = document.getElementById('streakModal');
const closeStreakModal = document.getElementById('closeStreakModal');
const modalStreakCount = document.getElementById('modalStreakCount');
const streakHistoryGrid = document.getElementById('streakHistoryGrid');
const weeklyChartCanvas = document.getElementById('weeklyChart');
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let stream = null;
let poseLandmarker = undefined;
let lastVideoTime = -1;
let currentPose = null;

// Calibration State
let calibrationStep = 0; // 0: Idle, 1: Set Up, 2: Set Down
let upY = 0;
let downY = 0;
let thresholdY = 0;

// Counter State
let totalCount = 0;
let sessionCount = 0;

totalDisplay.innerText = totalCount;

let isDown = false; // false = UP, true = DOWN
let lastStateChangeTime = 0;
let lastCountTime = 0;
const MIN_CYCLE_TIME = 1500;
let yHistory = [];
let smoothedNoseY = null;
let showSkeleton = true;
let isMuted = false;
let targetGoal = 0;
let successInterval;

// Firebase State
let currentUser = null;
let currentSessionId = null;
let unsubscribeUserDoc = null;

// Daily Quest State
let dailyQuest = { morning: 0, night: 0, total: 0, date: "" };
const QUEST_GOAL = 41;
const MORNING_GOAL = 20;
const NIGHT_GOAL = 21;
let userHistory = [];
let weeklyChartInstance = null;

// Initialize MediaPipe Pose Landmarker
const createPoseLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            delegate: "CPU"
        },
        runningMode: "LIVE_STREAM",
        numPoses: 1
    });
    console.log("PoseLandmarker loaded");
};
createPoseLandmarker();

// Check if browser supports getUserMedia
function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
    webcamButton.addEventListener('click', toggleCamera);
} else {
    if (window.isSecureContext === false) {
        console.warn('getUserMedia() requires a secure context (HTTPS or localhost)');
        webcamButton.innerText = 'HTTPS Required';
    } else {
        console.warn('getUserMedia() is not supported by your browser');
        webcamButton.innerText = 'Browser Not Supported';
    }
    webcamButton.disabled = true;
}

function toggleCamera() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (stream) {
        stopCamera();
        calibrateButton.classList.add('hidden');
    } else {
        startCamera();
    }
}

function startCamera() {
    const constraints = {
        video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints).then((mediaStream) => {
        stream = mediaStream;
        video.srcObject = stream;
        webcamButton.innerText = 'DISABLE WEBCAM';
        
        // Ensure canvas matches video dimensions once metadata loads
        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            calibrateButton.classList.remove('hidden');
            predictWebcam();
        });
    }).catch((err) => {
        console.error('Error accessing camera:', err);
        alert('Could not access camera. Please allow permissions.');
    });
}

function stopCamera() {
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    webcamButton.innerText = 'ENABLE WEBCAM';
    calibrateButton.classList.add('hidden');
}

toggleSkeletonButton.addEventListener('click', () => {
    showSkeleton = !showSkeleton;
    toggleSkeletonButton.innerText = showSkeleton ? "HIDE SKELETON" : "SHOW SKELETON";
});

muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    muteButton.innerText = isMuted ? "UNMUTE" : "MUTE";
});

clearButton.addEventListener('click', () => {
    sessionCount = 0;
    sessionCountDisplay.innerText = sessionCount;
    updateGoalProgress();
    // Resets session only
});

resetTotalButton.addEventListener('click', () => {
    if (confirm("Are you sure you want to reset your total count? This cannot be undone.")) {
        totalCount = 0;
        totalDisplay.innerText = totalCount;
    }
});

// --- Firebase Auth & Logic ---

loginBtn.addEventListener('click', () => {
    // Proactive check: Redirect 127.0.0.1 to localhost to avoid auth domain errors
    if (window.location.hostname === '127.0.0.1') {
        if (confirm("Google Login works better on 'localhost'. Switch to localhost now?")) {
            window.location.href = window.location.href.replace('127.0.0.1', 'localhost');
            return;
        }
    }

    signInWithPopup(auth, googleProvider)
        .then(() => {
            window.location.reload();
        })
        .catch((error) => {
            console.error("Login failed:", error);
            if (error.code === 'auth/unauthorized-domain') {
                alert("Firebase Error: Domain not authorized.\n\nPlease add '127.0.0.1' to the Authorized Domains in your Firebase Console (Authentication > Settings).");
            } else if (error.code === 'auth/popup-closed-by-user') {
                // User closed the popup, no alert needed
            } else {
                alert(`Login failed: ${error.message}`);
            }
        });
});

signOutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.reload();
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        loginBtn.classList.add('hidden');
        userProfile.classList.remove('hidden');
        userAvatar.src = user.photoURL;
        streakContainer.classList.remove('hidden');
        
        await checkOrCreateUserDoc(user);
        await startFirestoreSession(user.uid);
        setupRealtimeListener(user.uid);
    } else {
        currentUser = null;
        if (unsubscribeUserDoc) unsubscribeUserDoc();
        loginBtn.classList.remove('hidden');
        userProfile.classList.add('hidden');
        streakContainer.classList.add('hidden');
        // Ensure count is reset on logout/auth loss
        totalCount = 0;
        totalDisplay.innerText = totalCount;
    }
});

function setupRealtimeListener(uid) {
    const userRef = doc(db, "users", uid);
    unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Sync Total
            totalCount = data.totalLifetimeReps || 0;
            totalDisplay.innerText = totalCount;
            userHistory = data.history || [];

            // Sync Streak
            streakCountDisplay.innerText = data.streakCount || 0;

            // Sync Daily Quest
            if (data.dailyQuest) {
                const today = getQuestDate();
                if (data.dailyQuest.date === today) {
                    dailyQuest = data.dailyQuest;
                } else {
                    // Reset local if date changed (server will update on next write)
                    dailyQuest = { morning: 0, night: 0, total: 0, date: today };
                }
                
                // Check for Quest Completion (Server-side logic simulation)
                // We only trigger the modal if it hasn't been shown for this completion yet
                if (dailyQuest.total >= QUEST_GOAL && data.lastCompletionDate !== today && !document.querySelector('.quest-completed')) {
                    handleQuestComplete(today);
                }

                updateRitualRings();
            }

            updateHeatmap(userHistory);
            updateChart(data.dailyCounts || {});
        }
    });
}

async function checkOrCreateUserDoc(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const data = userSnap.data();
        // Sync Total Reps
        totalCount = data.totalLifetimeReps || 0;
        totalDisplay.innerText = totalCount;
        
        // Sync Calibration if exists
        if (data.calibrationData) {
            upY = data.calibrationData.upY;
            downY = data.calibrationData.downY;
            thresholdY = upY + (downY - upY) * 0.7;
            
            calibrationStatus.innerText = "Calibrated (Loaded from Profile)";
            calibrationStatus.style.color = "#00ff88";
            calibrateButton.innerText = "RECALIBRATE";
        }
        // Ensure dailyCounts exists (migration for existing users)
        if (!data.dailyCounts) {
            await updateDoc(userRef, { dailyCounts: {} });
        }
    } else {
        // Create new user profile
        await setDoc(userRef, {
            displayName: user.displayName,
            photoURL: user.photoURL,
            email: user.email,
            totalLifetimeReps: 0,
            lastActiveDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            streakCount: 0,
            dailyQuest: { date: getQuestDate(), morning: 0, night: 0, total: 0 },
            history: [],
            dailyCounts: {}
        });
    }
}

async function startFirestoreSession(uid) {
    try {
        const sessionRef = await addDoc(collection(db, "sessions"), {
            userId: uid,
            startTime: serverTimestamp(),
            reps: []
        });
        currentSessionId = sessionRef.id;
        console.log("Session started:", currentSessionId);
    } catch (e) {
        console.error("Error starting session:", e);
    }
}

function saveCalibrationData() {
    if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    // Fire and forget
    updateDoc(userRef, {
        calibrationData: { upY, downY }
    }).catch(e => console.error("Error saving calibration:", e));
}

// --- Quest Logic ---

function getLocalQuestDateString(dateObj = new Date()) {
    const d = new Date(dateObj);
    // Day starts at 4:00 AM
    if (d.getHours() < 4) {
        d.setDate(d.getDate() - 1);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getQuestDate() {
    return getLocalQuestDateString();
}

function getTimeSlot() {
    const hour = new Date().getHours();
    // Morning: 04:00 to 11:59
    if (hour >= 4 && hour < 12) return 'morning';
    // Night: 12:00 to 03:59 (next day)
    return 'night';
}

function logProstrationEvent() {
    if (!currentUser || !currentSessionId) return;
    
    const sessionRef = doc(db, "sessions", currentSessionId);
    const userRef = doc(db, "users", currentUser.uid);
    const timestamp = new Date(); // Use client time for immediate array push
    const today = getQuestDate();
    const slot = getTimeSlot();

    // Update Session
    updateDoc(sessionRef, {
        reps: arrayUnion(timestamp)
    }).catch(e => console.error("Error logging rep:", e));

    // Prepare User Update
    let updateData = {
        totalLifetimeReps: increment(1),
        lastActiveDate: serverTimestamp(),
        [`dailyCounts.${today}`]: increment(1)
    };

    // Handle Daily Quest Logic
    if (dailyQuest.date !== today || dailyQuest.total === 0) {
        // New Day Reset OR First Rep of Day (ensures date is synced)
        const newQuestState = {
            date: today,
            morning: slot === 'morning' ? 1 : 0,
            night: slot === 'night' ? 1 : 0,
            total: 1
        };
        updateData.dailyQuest = newQuestState;

        // OPTIMISTIC UPDATE: Update local state immediately to prevent race conditions
        dailyQuest = newQuestState;
        updateRitualRings();
    } else if (dailyQuest.total < QUEST_GOAL) {
        let targetSlot = slot;
        
        // Spillover Logic: If current slot is full, fill the other one
        if (slot === 'night' && dailyQuest.night >= NIGHT_GOAL) {
            targetSlot = 'morning';
        } else if (slot === 'morning' && dailyQuest.morning >= MORNING_GOAL) {
            targetSlot = 'night';
        }

        updateData[`dailyQuest.${targetSlot}`] = increment(1);
        updateData[`dailyQuest.total`] = increment(1);

        // OPTIMISTIC UPDATE
        dailyQuest[targetSlot]++;
        dailyQuest.total++;
        updateRitualRings();
    }

    updateDoc(userRef, updateData).catch(e => console.error("Error updating user stats:", e));
}

function handleQuestComplete(today) {
    // Optimistic update to prevent double firing
    const currentStreak = parseInt(streakCountDisplay.innerText) || 0;
    const newStreak = currentStreak + 1;
    streakCountDisplay.innerText = newStreak;

    const userRef = doc(db, "users", currentUser.uid);
    
    updateDoc(userRef, {
        streakCount: increment(1),
        lastCompletionDate: today,
        history: arrayUnion(today)
    });

    // Optimistically add today to history so it lights up in the modal immediately
    if (!userHistory.includes(today)) {
        userHistory.push(today);
    }

    // Show Reward Modal
    openStreakModal(true);
}

function updateRitualRings() {
    dailyTotalDisplay.innerText = `${dailyQuest.total} / ${QUEST_GOAL}`;

    // Morning Ring (Inner) - Max 20
    const mRadius = 75;
    const mCircumference = 2 * Math.PI * mRadius;
    const mProgress = Math.min(dailyQuest.morning / MORNING_GOAL, 1);
    ringMorning.style.strokeDashoffset = mCircumference - (mProgress * mCircumference);
    
    // Morning Glow Logic
    if (dailyQuest.morning >= MORNING_GOAL) {
        ringMorning.classList.add('glow-complete');
    } else {
        ringMorning.classList.remove('glow-complete');
    }

    // Night Ring (Outer) - Max 21
    const nRadius = 100;
    const nCircumference = 2 * Math.PI * nRadius;
    const nProgress = Math.min(dailyQuest.night / NIGHT_GOAL, 1);
    ringNight.style.strokeDashoffset = nCircumference - (nProgress * nCircumference);

    // If Total >= 41, fill both completely (Visual Reward)
    if (dailyQuest.total >= QUEST_GOAL) {
        ringMorning.style.stroke = "#00ff88"; // Turn green on complete
        ringNight.style.stroke = "#00ff88";
        ringMorning.style.strokeDashoffset = 0;
        ringNight.style.strokeDashoffset = 0;
        ringNight.classList.add('glow-complete');
        
        // If modal is closed, show completed state
        if (streakModal.classList.contains('hidden')) {
            dailyQuestCard.classList.add('completed-hidden');
        }
    } else {
        ringMorning.style.stroke = ""; // Reset to CSS default
        ringNight.style.stroke = "";
        ringNight.classList.remove('glow-complete');
        dailyQuestCard.classList.remove('completed-hidden');
    }
}

function updateHeatmap(history, targetGrid = heatmapGrid) {
    targetGrid.innerHTML = '';
    // Generate last 7 days. i=0 is Today (Left), i=6 is 6 days ago (Right)
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        if (d.getHours() < 4) d.setDate(d.getDate() - 1); // Adjust for quest day
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const dot = document.createElement('div');
        dot.className = 'heatmap-dot';
        if (history.includes(dateStr)) {
            dot.classList.add('active');
            dot.innerHTML = '<i class="fas fa-fire"></i>';
        }
        dot.title = dateStr;
        targetGrid.appendChild(dot);
    }
}

function updateChart(dailyCounts) {
    if (!weeklyChartCanvas) return;

    const labels = [];
    const dataPoints = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Determine "Today's" Quest Date Object
    const todayQuestDate = new Date();
    if (todayQuestDate.getHours() < 4) {
        todayQuestDate.setDate(todayQuestDate.getDate() - 1);
    }

    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
        const d = new Date(todayQuestDate);
        d.setDate(d.getDate() - i);
        
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        labels.push(days[d.getDay()]);
        dataPoints.push(dailyCounts[dateStr] || 0);
    }

    if (weeklyChartInstance) {
        weeklyChartInstance.data.labels = labels;
        weeklyChartInstance.data.datasets[0].data = dataPoints;
        weeklyChartInstance.update();
    } else {
        weeklyChartInstance = new Chart(weeklyChartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Reps',
                    data: dataPoints,
                    backgroundColor: (context) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                        gradient.addColorStop(0, 'rgba(0, 210, 255, 0.4)');
                        gradient.addColorStop(1, 'rgba(0, 210, 255, 0.0)');
                        return gradient;
                    },
                    borderColor: '#00d2ff',
                    borderWidth: 2,
                    pointBackgroundColor: '#121212',
                    pointBorderColor: '#00d2ff',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, 
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }, 
                        ticks: { color: '#a0a0a0', precision: 0 } },
                    x: { grid: { display: false }, 
                        ticks: { color: '#a0a0a0' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// Streak Modal Logic
function openStreakModal(isReward = false) {
    streakModal.classList.remove('hidden');
    modalStreakCount.innerText = streakCountDisplay.innerText;
    
    // Render history in modal using global data
    updateHeatmap(userHistory, streakHistoryGrid);

    if (isReward) {
        playChurchBell();
        playFanfare();
        triggerCelebration();
    }
}

heatmapContainer.addEventListener('click', () => {
    openStreakModal(false);
});

closeStreakModal.addEventListener('click', () => {
    streakModal.classList.add('hidden');
    // If quest is complete, update UI to "Completed" state
    updateRitualRings();
});

// Goal Modal Logic
goalActionBtn.addEventListener('click', () => {
    goalModal.classList.remove('hidden');
    modalGoalInput.value = targetGoal > 0 ? targetGoal : '';
    modalGoalInput.focus();
    goalError.classList.add('hidden');
    currentSessionRef.innerText = sessionCount;
});

cancelGoalBtn.addEventListener('click', () => {
    goalModal.classList.add('hidden');
});

saveGoalBtn.addEventListener('click', () => {
    const goalValue = parseInt(modalGoalInput.value, 10);
    
    if (isNaN(goalValue) || goalValue <= 0) {
        alert('Please enter a valid number greater than 0.');
        return;
    }

    if (goalValue <= sessionCount) {
        goalError.classList.remove('hidden');
        currentSessionRef.innerText = sessionCount;
    } else {
        targetGoal = goalValue;
        goalDisplay.innerText = targetGoal;
        goalActionBtn.innerText = "Edit Goal";
        goalModal.classList.add('hidden');
        updateGoalProgress();
    }
});

// Settings UI Handlers
function toggleSettings() {
    settingsPanel.classList.toggle('hidden');
    settingsBackdrop.classList.toggle('hidden');
}

settingsToggle.addEventListener('click', toggleSettings);
closeSettings.addEventListener('click', toggleSettings);
settingsBackdrop.addEventListener('click', toggleSettings);

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    themeToggleBtn.innerText = isLight ? "SWITCH TO DARK MODE" : "SWITCH TO DAY MODE";
});

function dismissSuccessOverlay() {
    clearInterval(successInterval);
    successOverlay.classList.add('hidden');
    // Reset goal to prevent loop
    targetGoal = 0;
    goalDisplay.innerText = "--";
    goalActionBtn.innerText = "Set Goal";
    updateGoalProgress();
    closeSuccess.innerText = "CONTINUE";
}

closeSuccess.addEventListener('click', dismissSuccessOverlay);

setNewGoalSuccess.addEventListener('click', () => {
    dismissSuccessOverlay();
    
    // Open Goal Modal
    goalModal.classList.remove('hidden');
    modalGoalInput.value = '';
    modalGoalInput.focus();
    goalError.classList.add('hidden');
    currentSessionRef.innerText = sessionCount;
});

function speakCount(number) {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(number.toString());
        window.speechSynthesis.speak(utterance);
    }
}

function updateGoalProgress() {
    if (targetGoal > 0) {
        goalProgressBarContainer.classList.remove('hidden');
        const percentage = Math.min(100, (sessionCount / targetGoal) * 100);
        goalProgressBarFill.style.width = `${percentage}%`;
        goalProgressText.innerText = `${sessionCount} / ${targetGoal}`;
    } else {
        goalProgressBarContainer.classList.add('hidden');
        goalProgressBarFill.style.width = '0%';
    }
}

function playSuccessSound() {
    if (isMuted) return;
    playFanfare();
}

function handleGoalReached() {
    playSuccessSound();
    triggerCelebration();
    successOverlay.classList.remove('hidden');
    
    let seconds = 5;
    closeSuccess.innerText = `CONTINUE (${seconds})`;
    
    clearInterval(successInterval);
    successInterval = setInterval(() => {
        seconds--;
        closeSuccess.innerText = `CONTINUE (${seconds})`;
        if (seconds <= 0) {
            dismissSuccessOverlay();
        }
    }, 1000);
}

calibrateButton.addEventListener('click', () => {
    if (!currentPose) {
        alert("No pose detected. Please stand in front of the camera.");
        return;
    }

    const nose = currentPose[0]; // Landmark 0 is the nose

    if (calibrationStep === 0) {
        // Start Calibration
        calibrationStep = 1;
        calibrateButton.innerText = "SET UP POSITION";
        calibrationStatus.innerText = "Step 1: Stand upright, then click button.";
    } else if (calibrationStep === 1) {
        // Record UP position
        upY = nose.y;
        calibrationStep = 2;
        calibrateButton.innerText = "SET DOWN POS";
        calibrationStatus.innerText = "Step 2: Perform full Prostration, then click button.";
    } else if (calibrationStep === 2) {
        // Record DOWN position
        downY = nose.y;
        
        // Calculate Threshold (70% of the way down)
        // Note: In MediaPipe, Y increases downwards (0 is top, 1 is bottom)
        thresholdY = upY + (downY - upY) * 0.7;
        
        sessionCount = 0;
        updateGoalProgress();
        
        calibrationStep = 0;
        calibrateButton.innerText = "RECALIBRATE";
        calibrationStatus.innerText = `Calibrated`;
        calibrationStatus.style.color = "#00ff88";
        saveCalibrationData(); // Save to Firestore
    }
});

function triggerCelebration() {
    const colors = ['#FFD700', '#FFFFFF', '#00d2ff']; // Gold, White, Electric Blue
    
    // Fire from left
    confetti({
        particleCount: 100,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: colors,
        zIndex: 1001
    });
    
    // Fire from right
    confetti({
        particleCount: 100,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: colors,
        zIndex: 1001
    });
}

function playFanfare() {
    if (isMuted) return;
    const audio = new Audio('Assets/uppbeat-io.mp3');
    audio.play().catch(e => console.error("Error playing audio:", e));
}

function playChurchBell() {
    if (isMuted) return;
    const audio = new Audio('Assets/church_bell.mp3'); // Ensure this file exists
    audio.play().catch(e => console.warn("Church bell audio missing"));
}

function playBeep() {
    if (isMuted) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
    oscillator.stop(audioCtx.currentTime + 0.1);
}

async function predictWebcam() {
    // If stream is null, stop the loop
    if (!stream) return;

    if (poseLandmarker && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const startTimeMs = performance.now();
        
        const results = poseLandmarker.detectForVideo(video, startTimeMs);

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (results.landmarks && results.landmarks.length > 0) {
            for (const landmarks of results.landmarks) {
                currentPose = landmarks;
                
                if (showSkeleton) {
                    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
                    drawingUtils.drawLandmarks(landmarks, { radius: 4 });
                }

                // Counting Logic
                if (thresholdY > 0) {
                    const nose = landmarks[0];
                    const leftShoulder = landmarks[11];
                    const rightShoulder = landmarks[12];

                    // 1. Coordinate Smoothing (Centroid)
                    // Calculate stableY based on Nose and Shoulders
                    let stableY = 0;
                    const noseConf = nose.visibility !== undefined ? nose.visibility : 1.0;

                    if (noseConf < 0.5) {
                        // Nose unreliable, use shoulders
                        stableY = (leftShoulder.y + rightShoulder.y) / 2;
                    } else {
                        // Use centroid of triangle
                        stableY = (nose.y + leftShoulder.y + rightShoulder.y) / 3;
                    }

                    // 4. Velocity Check History
                    yHistory.push(stableY);
                    if (yHistory.length > 5) yHistory.shift();

                    // 2. Schmitt Trigger Thresholds
                    const range = downY - upY;
                    const downThreshold = upY + (range * 0.80); // 80% down
                    const upThreshold = upY + (range * 0.30);   // 30% up (return point)

                    const now = performance.now();

                    if (!isDown) {
                        // State: UP -> GOING DOWN
                        // 4. Velocity Check: Ensure directional intent (increasing Y)
                        const hasDownwardIntent = yHistory.length === 5 && (yHistory[4] > yHistory[0]);

                        if (stableY > downThreshold && hasDownwardIntent) {
                            isDown = true;
                        }
                    } else if (isDown) {
                        // State: DOWN -> GOING UP
                        if (stableY < upThreshold) {
                            // 3. Temporal Debouncing
                            if (now - lastCountTime > MIN_CYCLE_TIME) {
                                isDown = false;
                                lastCountTime = now;
                                
                                // Trigger Count
                                sessionCount++;
                                totalCount++;
                                sessionCountDisplay.innerText = sessionCount;
                                
                                totalDisplay.innerText = totalCount;
                                updateGoalProgress();
                                
                                // Pulse Animation
                                sessionCountDisplay.classList.add('pulse-anim');
                                setTimeout(() => sessionCountDisplay.classList.remove('pulse-anim'), 300);

                                playBeep();
                                speakCount(sessionCount);
                                logProstrationEvent(); // Log to Firestore

                                // Goal Check
                                if (targetGoal > 0 && sessionCount === targetGoal) {
                                    handleGoalReached();
                                }
                            }
                        }
                    }
                }
            }
        } else {
            currentPose = null;
            smoothedNoseY = null;
            yHistory = [];
        }
        canvasCtx.restore();
    }

    window.requestAnimationFrame(predictWebcam);
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js');
    });
}