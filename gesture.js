// MediaPipe Hands & Webcam Gesture Tracking Engine

export class GestureTracker {
  constructor() {
    this.videoElement = null;
    this.hands = null;
    this.cameraInstance = null;
    this.videoDevices = [];
    this.currentDeviceIndex = 0;

    this.handDetected = false;
    this.aiGesture = "STOP";
    this.fingerStates = {
      THUMB: false,
      INDEX: false,
      MIDDLE: false,
      RING: false,
      PINKY: false
    };
    this.history = [];
    this.camError = "";
    this.camReady = false;

    // Dedicated 360x210 preview canvas for the sidebar HUD
    this.previewCanvas = document.createElement("canvas");
    this.previewCanvas.width = 360;
    this.previewCanvas.height = 210;
    this.previewCtx = this.previewCanvas.getContext("2d");

    // Clean snapshot canvas for player photo registration
    this.snapCanvas = document.createElement("canvas");
    this.snapCanvas.width = 320;
    this.snapCanvas.height = 240;
    this.snapCtx = this.snapCanvas.getContext("2d");
  }

  async init(videoElement) {
    this.videoElement = videoElement;

    // Discover video input devices
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.videoDevices = devices.filter((d) => d.kind === "videoinput");
      }
    } catch (e) {
      console.warn("Could not enumerate video devices", e);
    }

    if (!window.Hands) {
      this.camError = "MEDIAPIPE NOT LOADED";
      return;
    }

    try {
      this.hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.hands.onResults((results) => this.onResults(results));

      await this.startCamera();
    } catch (err) {
      console.error("Camera init error:", err);
      this.camError = (err.message || "CAMERA ERROR").toUpperCase().slice(0, 28);
    }
  }

  async startCamera(deviceId = null) {
    if (this.cameraInstance) {
      try {
        await this.cameraInstance.stop();
      } catch (e) {}
    }

    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      }
    };
    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      if (window.Camera) {
        this.cameraInstance = new window.Camera(this.videoElement, {
          onFrame: async () => {
            if (this.hands && this.videoElement.readyState >= 2) {
              await this.hands.send({ image: this.videoElement });
            }
          },
          width: 640,
          height: 480
        });
        await this.cameraInstance.start();
      } else {
        // Fallback animation frame loop
        const processLoop = async () => {
          if (this.hands && this.videoElement.readyState >= 2) {
            await this.hands.send({ image: this.videoElement });
          }
          requestAnimationFrame(processLoop);
        };
        requestAnimationFrame(processLoop);
      }

      this.camReady = true;
      this.camError = "";
    } catch (e) {
      console.warn("Webcam start failed:", e);
      this.camError = "CAMERA ACCESS DENIED";
      this.camReady = false;
    }
  }

  async switchCamera() {
    if (this.videoDevices.length <= 1) return;
    this.currentDeviceIndex = (this.currentDeviceIndex + 1) % this.videoDevices.length;
    const nextDev = this.videoDevices[this.currentDeviceIndex];
    if (nextDev && nextDev.deviceId) {
      await this.startCamera(nextDev.deviceId);
    }
  }

  landmarkDist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  analyzeHand(landmarks) {
    const lm = landmarks;
    const wrist = lm[0];
    const specs = [
      ["INDEX", 8, 6, 5],
      ["MIDDLE", 12, 10, 9],
      ["RING", 16, 14, 13],
      ["PINKY", 20, 18, 17]
    ];
    const states = {};

    for (const [name, tipI, pipI, mcpI] of specs) {
      const tipD = this.landmarkDist(lm[tipI], wrist);
      const pipD = this.landmarkDist(lm[pipI], wrist);
      const mcpD = this.landmarkDist(lm[mcpI], wrist);
      states[name] = tipD > pipD * 1.07 && tipD > mcpD * 1.14;
    }

    const palmW = Math.max(0.05, this.landmarkDist(lm[5], lm[17]));
    states["THUMB"] =
      this.landmarkDist(lm[4], lm[17]) > palmW * 1.22 &&
      this.landmarkDist(lm[4], lm[5]) > palmW * 0.52;

    const upCount = Object.values(states).filter(Boolean).length;
    const { INDEX: idx, MIDDLE: mid, RING: rng, PINKY: pnk, THUMB: thb } = states;

    let gesture = "STOP";
    if (upCount >= 4 || (idx && mid && rng && pnk)) {
      gesture = "RUN RIGHT";
    } else if ((idx && mid && rng && !pnk) || (thb && idx && mid && !rng && !pnk)) {
      gesture = "JUMP + RIGHT";
    } else if (idx && mid && !rng && !pnk) {
      gesture = "RUN LEFT";
    } else if ((idx && !mid && !rng && !pnk) || (thb && !mid && !rng && !pnk)) {
      gesture = "JUMP";
    } else {
      gesture = "STOP";
    }

    return { gesture, states, upCount };
  }

  onResults(results) {
    const ctx = this.previewCtx;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Draw mirrored video frame
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    if (results.image) {
      ctx.drawImage(results.image, 0, 0, w, h);
    }
    ctx.restore();

    let rawGesture = "STOP";
    let fStates = { THUMB: false, INDEX: false, MIDDLE: false, RING: false, PINKY: false };
    let detected = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      detected = true;
      const landmarks = results.multiHandLandmarks[0];

      // Draw hand landmarks & connections
      this.drawLandmarks(ctx, landmarks, w, h);

      const analyzed = this.analyzeHand(landmarks);
      rawGesture = analyzed.gesture;
      fStates = analyzed.states;
    }

    // 3-frame majority vote smoothing
    this.history.push(rawGesture);
    if (this.history.length > 3) this.history.shift();

    const counts = {};
    for (const g of this.history) {
      counts[g] = (counts[g] || 0) + 1;
    }
    let smoothed = rawGesture;
    let maxC = 0;
    for (const [g, count] of Object.entries(counts)) {
      if (count > maxC) {
        maxC = count;
        smoothed = g;
      }
    }

    this.handDetected = detected;
    this.aiGesture = smoothed;
    this.fingerStates = fStates;
  }

  drawLandmarks(ctx, landmarks, w, h) {
    ctx.save();
    // Connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17]
    ];

    ctx.strokeStyle = "#80D010"; // PIPE_HIGHLIGHT
    ctx.lineWidth = 2;
    for (const [i, j] of connections) {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo((1 - p1.x) * w, p1.y * h);
      ctx.lineTo((1 - p2.x) * w, p2.y * h);
      ctx.stroke();
    }

    // Joint points
    ctx.fillStyle = "#FC9838"; // COIN_GOLD / Q_ORANGE
    for (const p of landmarks) {
      ctx.beginPath();
      ctx.arc((1 - p.x) * w, p.y * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  captureSnapshot() {
    if (!this.videoElement || this.videoElement.readyState < 2) {
      // Fallback Mario placeholder
      const off = document.createElement("canvas");
      off.width = 48;
      off.height = 36;
      const octx = off.getContext("2d");
      octx.fillStyle = "#D82800";
      octx.fillRect(0, 0, 48, 36);
      return {
        thumbnailDataUrl: off.toDataURL("image/jpeg", 0.7),
        previewDataUrl: off.toDataURL("image/jpeg", 0.7),
        canvasThumb: off
      };
    }

    const vw = this.videoElement.videoWidth || 640;
    const vh = this.videoElement.videoHeight || 480;

    // Crop centered 4:3
    const cropW = Math.min(vw, vh * 1.25);
    const cropH = cropW * 0.75;
    const sx = Math.max(0, (vw - cropW) / 2);
    const sy = Math.max(0, (vh - cropH) / 2);

    // 160x120 preview canvas
    const prevC = document.createElement("canvas");
    prevC.width = 160;
    prevC.height = 120;
    const pctx = prevC.getContext("2d");
    pctx.translate(160, 0);
    pctx.scale(-1, 1);
    pctx.drawImage(this.videoElement, sx, sy, cropW, cropH, 0, 0, 160, 120);

    // 48x36 thumbnail canvas (< 4KB jpeg)
    const thumbC = document.createElement("canvas");
    thumbC.width = 48;
    thumbC.height = 36;
    const tctx = thumbC.getContext("2d");
    tctx.translate(48, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(this.videoElement, sx, sy, cropW, cropH, 0, 0, 48, 36);

    const b64Thumb = thumbC.toDataURL("image/jpeg", 0.6);
    const b64Prev = prevC.toDataURL("image/jpeg", 0.7);

    return {
      thumbnailDataUrl: b64Thumb,
      previewDataUrl: b64Prev,
      canvasThumb: thumbC,
      canvasPrev: prevC
    };
  }
}

