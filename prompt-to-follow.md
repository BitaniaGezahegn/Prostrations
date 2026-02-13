# Role
You are a Senior Full-Stack Engineer and ML Specialist. We are building a "Prostration Counter" web application using MediaPipe Pose.

# Project Objective
Create a single-page web application that uses the webcam to detect a user's body landmarks and count prostrations (Sujud) based on vertical movement logic. The app must be robust, lightweight, and work even if only the upper body is visible.

# Implementation Stages
Please implement this project following these exact stages. Pause after each stage to show the code and explain the logic before moving to the next.

## Stage 1: Camera Setup & UI
- Create a clean HTML5/CSS3 interface.
- Implement a <video> element for the webcam feed and a <canvas> overlay for drawing landmarks.
- Use `navigator.mediaDevices.getUserMedia` to request camera permissions.
- Provide a "Start/Stop" button.

## Stage 2: MediaPipe Integration
- Import MediaPipe Pose Landmarker via CDN (v0.10+).
- Initialize the Pose model in 'LIVE_STREAM' mode.
- Implement the detection loop: process video frames and draw the "skeleton" (landmarks and connectors) on the canvas.

## Stage 3: Dynamic Calibration Logic
- Create a "Calibrate" function.
- Track the 'nose' landmark (index 0) Y-coordinate.
- Record "Up" position (standing/sitting) and "Down" position (prostrating).
- Calculate a 70% threshold between these two points to define the "Down" state.

## Stage 4: State-Machine Counter
- Implement a state-based counter (States: "UP", "GOING_DOWN", "DOWN", "GOING_UP").
- A count is registered only when the sequence completes: UP -> DOWN -> UP.
- Add "Debounce" logic to prevent double-counting due to jitter or slight movements.

## Stage 5: Feedback & UX
- Display the count in a large, readable overlay.
- Implement an Audio Feedback system (a "beep" sound) using the Web Audio API when a count increments.
- Ensure the UI is responsive and works on mobile browsers.

# Technical Constraints
- No external frameworks like React/Vue; use Vanilla JS for simplicity.
- Use 'Pose landmarker (lite)' for maximum performance on all devices.
- Focus specifically on the 'nose' and 'shoulder' landmarks for tracking to ensure "half-body" visibility works.

# Deliverable
Start by proposing a file structure and then provide the code for Stage 1.

----------------------
Great, the core counter is working. Now, let's add three specific enhancements to the existing code without changing the primary logic:

1. **Smoothing (EMA):** Apply an Exponential Moving Average to the nose Y-coordinate (alpha = 0.2) to stop the "jitter" and make the tracking more stable.
2. **Voice Announcements:** Use the `window.speechSynthesis` API to have the app speak the count aloud (e.g., "One", "Two") every time the counter increments. 
3. **Session Persistence:** Save the session's total count to `localStorage` so that if I refresh the page, the number doesn't reset to zero.
4. **UI Toggle:** Add a button to "Hide Skeleton" that stops drawing the lines on the canvas but keeps the tracking running in the background for a cleaner look.

Please provide only the updated JavaScript functions and the new UI buttons needed to integrate these.

----------------------