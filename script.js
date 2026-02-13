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
let count = parseInt(localStorage.getItem('prostrationCount') || '0');
countDisplay.innerText = count;
let isDown = false; // false = UP, true = DOWN
let lastStateChangeTime = 0;
let smoothedNoseY = null;
let showSkeleton = true;

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
        calibrationSection.classList.add('hidden');
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
            calibrationSection.classList.remove('hidden');
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
    calibrationSection.classList.add('hidden');
}

toggleSkeletonButton.addEventListener('click', () => {
    showSkeleton = !showSkeleton;
    toggleSkeletonButton.innerText = showSkeleton ? "HIDE SKELETON" : "SHOW SKELETON";
});

function speakCount(number) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(number.toString());
        window.speechSynthesis.speak(utterance);
    }
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
        calibrationStatus.innerText = "Step 1: Sit/Stand upright, then click button.";
    } else if (calibrationStep === 1) {
        // Record UP position
        upY = nose.y;
        calibrationStep = 2;
        calibrateButton.innerText = "SET DOWN POSITION";
        calibrationStatus.innerText = "Step 2: Perform Sujud (Prostrate), then click button.";
    } else if (calibrationStep === 2) {
        // Record DOWN position
        downY = nose.y;
        
        // Calculate Threshold (70% of the way down)
        // Note: In MediaPipe, Y increases downwards (0 is top, 1 is bottom)
        thresholdY = upY + (downY - upY) * 0.7;
        
        count = 0;
        localStorage.setItem('prostrationCount', count);
        countDisplay.innerText = count;
        calibrationStep = 0;
        calibrateButton.innerText = "RECALIBRATE";
        calibrationStatus.innerText = `Calibrated! (Thresh: ${thresholdY.toFixed(2)})`;
    }
});

function playBeep() {
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
                            count++;
                            localStorage.setItem('prostrationCount', count);
                            countDisplay.innerText = count;
                            playBeep();
                            speakCount(count);
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