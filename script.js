import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const video = document.getElementById('webcam');
const canvas = document.getElementById('output_canvas');
const canvasCtx = canvas.getContext('2d');
const webcamButton = document.getElementById('webcamButton');
const toggleSkeletonButton = document.getElementById('toggleSkeletonButton');
const calibrateButton = document.getElementById('calibrateButton');
const calibrationSection = document.getElementById('calibrationSection');
const calibrationStatus = document.getElementById('calibrationStatus');
const countDisplay = document.getElementById('countDisplay');
const muteButton = document.getElementById('muteButton');
const clearButton = document.getElementById('clearButton');
const resetTotalButton = document.getElementById('resetTotalButton');
const goalInput = document.getElementById('goalInput');
const setGoalButton = document.getElementById('setGoalButton');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const totalDisplay = document.getElementById('totalDisplay');
const goalDisplay = document.getElementById('goalDisplay');
const progressRingCircle = document.getElementById('progressRingCircle');
const successOverlay = document.getElementById('successOverlay');
const closeSuccess = document.getElementById('closeSuccess');
const drawingUtils = new DrawingUtils(canvasCtx);
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
let totalCount = parseInt(localStorage.getItem('prostrationCount') || '0');
let sessionCount = 0;

countDisplay.innerText = sessionCount;
totalDisplay.innerText = totalCount;

let isDown = false; // false = UP, true = DOWN
let lastStateChangeTime = 0;
let smoothedNoseY = null;
let showSkeleton = true;
let isMuted = false;
let targetGoal = 0;

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
    countDisplay.innerText = sessionCount;
    // Resets session only
});

resetTotalButton.addEventListener('click', () => {
    if (confirm("Are you sure you want to reset your total count? This cannot be undone.")) {
        totalCount = 0;
        localStorage.setItem('prostrationCount', '0');
        totalDisplay.innerText = totalCount;
    }
});

setGoalButton.addEventListener('click', () => {
    const goalValue = parseInt(goalInput.value, 10);
    if (goalValue > 0) {
        targetGoal = goalValue;
        goalDisplay.innerText = targetGoal;
        goalInput.value = ''; // Clear input
    } else {
        alert('Please enter a valid goal number greater than 0.');
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

closeSuccess.addEventListener('click', () => {
    successOverlay.classList.add('hidden');
    // Reset goal to prevent loop
    targetGoal = 0;
    goalDisplay.innerText = "--";
});

function speakCount(number) {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(number.toString());
        window.speechSynthesis.speak(utterance);
    }
}

function playSuccessSound() {
    if (isMuted) return;
    // For simplicity, we will use an alert as the primary notification
    // and re-use the beep sound.
    playBeep();
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
        countDisplay.innerText = sessionCount;
        
        calibrationStep = 0;
        calibrateButton.innerText = "RECALIBRATE";
        calibrationStatus.innerText = `Calibrated`;
        calibrationStatus.style.color = "#00ff88";
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

                // Update Progress Ring
                if (thresholdY > 0) {
                    // Calculate progress (0 at upY, 1 at downY)
                    let progress = (smoothedNoseY - upY) / (downY - upY);
                    // Clamp between 0 and 1
                    progress = Math.max(0, Math.min(1, progress));
                    
                    // Update SVG Stroke Offset
                    const radius = progressRingCircle.r.baseVal.value;
                    const circumference = radius * 2 * Math.PI;
                    const offset = circumference - (progress * circumference);
                    progressRingCircle.style.strokeDashoffset = offset;
                }

                // Counting Logic
                if (thresholdY > 0) {
                    const nose = landmarks[0];
                    
                    // EMA Smoothing (Alpha = 0.2)
                    if (smoothedNoseY === null) {
                        smoothedNoseY = nose.y;
                    } else {
                        smoothedNoseY = 0.2 * nose.y + 0.8 * smoothedNoseY;
                    }

                    const now = performance.now();
                    const DEBOUNCE_DELAY = 300; // ms

                    if (!isDown && smoothedNoseY > thresholdY) {
                        // Transition UP -> DOWN
                        if (now - lastStateChangeTime > DEBOUNCE_DELAY) {
                            isDown = true;
                            lastStateChangeTime = now;
                        }
                    } else if (isDown && smoothedNoseY < thresholdY) {
                        // Transition DOWN -> UP (Complete Rep)
                        if (now - lastStateChangeTime > DEBOUNCE_DELAY) {
                            isDown = false;
                            lastStateChangeTime = now;
                            
                            sessionCount++;
                            totalCount++;
                            localStorage.setItem('prostrationCount', totalCount);
                            
                            countDisplay.innerText = sessionCount;
                            totalDisplay.innerText = totalCount;
                            
                            // Pulse Animation
                            countDisplay.classList.add('pulse-anim');
                            setTimeout(() => countDisplay.classList.remove('pulse-anim'), 300);

                            playBeep();
                            speakCount(sessionCount);

                            // Goal Check
                            if (targetGoal > 0 && sessionCount === targetGoal) {
                                playSuccessSound();
                                triggerCelebration();
                                successOverlay.classList.remove('hidden');
                            }
                        }
                    }
                }
            }
        } else {
            currentPose = null;
            smoothedNoseY = null;
        }
        canvasCtx.restore();
    }

    window.requestAnimationFrame(predictWebcam);
}