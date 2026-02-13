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

# Role
You are a High-End Frontend UI/UX Designer and CSS Expert.

# Objective
Perform a complete visual overhaul of the Prostration Counter. Transform it from a basic utility into a premium, modern, gamified dashboard.

# Visual Requirements
1. **Glassmorphism Aesthetic:** Use a dark, sleek background with semi-transparent "glass" cards for controls and stats. Use a color palette of Deep Charcoal (#121212), Electric Blue (#00d2ff), and Emerald Green (#00ff88).
2. **The "Live View" Container:** - Add a subtle neon glow to the video feed.
   - Overlay the canvas perfectly so the "skeleton" looks like a high-tech HUD.
3. **Circular Progress Indicator:**
   - Create a large, beautiful circular progress ring (SVG/CSS) in the center or side.
   - This ring should fill up dynamically based on the current Y-coordinate relative to the 'Up' and 'Down' thresholds.
4. **Gamified Stat Cards:**
   - Create 3 distinct cards: [Current Session], [Daily Total], and [Target Goal].
   - Use modern typography (e.g., 'Inter' or 'Poppins') and icons (you can use FontAwesome or simple SVG icons).
5. **Animation Effects:**
   - Add a "Pulse" animation to the counter number every time it increments.
   - Add a "Success" flash or confetti effect when the Goal is reached.
6. **Responsive Layout:**
   - Use CSS Grid/Flexbox to ensure the camera feed is large on desktop but stacks nicely on mobile.
   - Hide the "Control Panel" behind a sleek "Settings" gear icon or a sliding sidebar to keep the main view clean.

# Technical Instructions
- Use Modern CSS (Variables, Flexbox, Grid, and Backdrop-filter).
- Keep the existing MediaPipe and State Machine logic intact, but wrap it in this new UI structure.
- Ensure the UI doesn't lag the camera processing (use GPU-accelerated CSS transitions).

# Deliverable
Provide the complete updated HTML and CSS files. For the JavaScript, show me how to link the new UI elements (like the progress ring) to the existing coordinate logic.

----------------------

