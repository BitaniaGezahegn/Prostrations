import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const video = document.getElementById('webcam');
const canvas = document.getElementById('output_canvas');
const canvasCtx = canvas.getContext('2d');
const webcamButton = document.getElementById('webcamButton');
const drawingUtils = new DrawingUtils(canvasCtx);

let stream = null;
let poseLandmarker = undefined;
let lastVideoTime = -1;

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
    if (stream) {
        stopCamera();
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
        
        if (results.landmarks) {
            for (const landmarks of results.landmarks) {
                drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
                drawingUtils.drawLandmarks(landmarks, { radius: 4 });
            }
        }
        canvasCtx.restore();
    }

    window.requestAnimationFrame(predictWebcam);
}