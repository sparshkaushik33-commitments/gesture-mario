// Super Mario Bros Arcade - 60 FPS Web Client
// Complete replication of main.py with 4 worlds, sub-pixel physics, and MediaPipe AI hand tracking

import { drawBlockText } from "./font.js";
import { audio } from "./audio.js";
import { getLevelConfig, GROUND_Y, TOTAL_LEVELS } from "./levels.js";
import { GestureTracker } from "./gesture.js";

// Layout constants
const WINDOW_W = 1280;
const WINDOW_H = 600;
const GAME_W = 900;
const SIDE_W = 380;
const TARGET_FPS = 60;

// Flat NES color palette
const NES_SKY = "#5C94FC";
const UNDERGROUND_BG = "#10141C";
const ATHLETIC_SKY = "#447CD8";
const CASTLE_BG = "#121212";

const GROUND_RUST = "#C84C0C";
const GROUND_PEACH = "#FCBCB0";
const BLUE_BRICK = "#0078A8";
const BLUE_HIGHLIGHT = "#5CBCE4";
const CASTLE_STONE = "#8C9096";
const CASTLE_HIGHLIGHT = "#C8CCD2";
const LAVA_RED = "#D82800";
const LAVA_GOLD = "#FC9838";

const BRICK_RED = "#B83000";
const MORTAR_BLACK = "#14100C";
const Q_ORANGE = "#FC9838";
const Q_USED_BROWN = "#884600";
const PIPE_GREEN = "#00A800";
const PIPE_HIGHLIGHT = "#80D010";
const PIPE_SHADOW = "#005800";
const HILL_GREEN = "#009400";
const BUSH_LIME = "#80D010";
const CLOUD_WHITE = "#FCFCFC";
const CLOUD_OUTLINE = "#3868C8";

const MARIO_RED = "#D82800";
const MARIO_SKIN = "#FC9838";
const MARIO_BROWN = "#887000";
const GOOMBA_BROWN = "#AC5000";
const GOOMBA_BLUE = "#0078A8";
const GOOMBA_GRAY = "#787878";
const GOOMBA_STEM = "#FCBCB0";
const COIN_GOLD = "#FCD844";

const UI_DARK = "#181C22";
const UI_CARD = "#262C36";
const UI_BORDER = "#4C5666";
const UI_GREEN = "#00A83C";
const UI_GOLD = "#DC9614";
const WHITE = "#FAFAFA";
const BLACK = "#0E0E0E";

class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.videoElement = document.getElementById("webcamVideo");
    this.tracker = new GestureTracker();

    this.keys = {};
    this.gameMode = "REGISTER"; // REGISTER or PLAYING

    // Player & Stats
    this.playerNameInput = "PLAYER1";
    this.capturedPhotoB64 = "";
    this.capturedThumbImg = null;
    this.capturedPreviewImg = null;
    this.cloudPhotoConsent = false;

    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.currentLevel = 1;
    this.worldTimer = 400.0;

    // Mario State & Physics
    this.mario = { x: 80, y: GROUND_Y - 38, w: 24, h: 38 };
    this.marioFx = 80.0;
    this.marioFy = GROUND_Y - 38;
    this.marioVx = 0.0;
    this.marioVy = 0.0;
    this.marioFacing = 1;
    this.onGround = true;
    this.coyoteFrames = 0;
    this.jumpBufferFrames = 0;
    this.invincibleFrames = 0;

    // Camera & Level Elements
    this.cameraFx = 0.0;
    this.cameraX = 0;
    this.levelConfig = null;
    this.checkpointReached = false;
    this.floatingPopups = [];
    this.bannerText = "";
    this.bannerFrames = 0;

    // Leaderboard
    this.leaderboardEntries = this.loadLeaderboard();
    const hasCloud = Boolean(window.MARIO_SHEETS_WEBHOOK_URL || localStorage.getItem("MARIO_SHEETS_WEBHOOK_URL"));
    this.cloudStatus = hasCloud ? "CLOUD READY" : "LOCAL ONLY";
    if (hasCloud) {
      this.fetchCloudLeaderboard();
    }

    // Timing
    this.lastTime = performance.now();
    this.frameTick = 0;
    this.fps = 60;
    this.fpsCount = 0;
    this.fpsTimer = performance.now();

    this.initEvents();
  }

  async start() {
    this.loadLevel(1);
    await this.tracker.init(this.videoElement);
    requestAnimationFrame((t) => this.loop(t));
  }

  initEvents() {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));

    // Canvas click assists for interactive photo booth buttons
    this.canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
  }

  handleKeyDown(e) {
    audio.init();
    this.keys[e.key.toLowerCase()] = true;
    this.keys[e.code] = true;

    if (this.gameMode === "REGISTER") {
      if (e.key === "Tab") {
        e.preventDefault();
        this.tracker.switchCamera();
      } else if (e.key === " ") {
        e.preventDefault();
        this.snapPhoto();
      } else if (e.key.toLowerCase() === "p") {
        this.cloudPhotoConsent = !this.cloudPhotoConsent;
      } else if (e.key === "Enter") {
        this.startGameSession();
      } else if (e.key === "Backspace") {
        this.playerNameInput = this.playerNameInput.slice(0, -1);
      } else if (e.key.length === 1) {
        const ch = e.key.toUpperCase();
        if (/^[A-Z0-9 _-]$/.test(ch) && this.playerNameInput.length < 10) {
          this.playerNameInput += ch;
        }
      }
    } else {
      if (e.key.toLowerCase() === "c") {
        this.tracker.switchCamera();
      } else if (e.key.toLowerCase() === "m") {
        audio.toggleMute();
      } else if (e.key.toLowerCase() === "n") {
        this.gameMode = "REGISTER";
        this.capturedThumbImg = null;
        this.capturedPreviewImg = null;
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const lv = parseInt(e.key, 10);
        this.loadLevel(lv);
        this.bannerText = `WARPED TO WORLD 1-${lv}!`;
        this.bannerFrames = 80;
      } else if (e.key.toLowerCase() === "r") {
        this.saveCurrentScore();
        this.score = 0;
        this.coins = 0;
        this.lives = 3;
        this.loadLevel(1);
      }
    }
  }

  handleKeyUp(e) {
    this.keys[e.key.toLowerCase()] = false;
    this.keys[e.code] = false;
  }

  handleCanvasClick(e) {
    audio.init();
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = WINDOW_W / rect.width;
    const scaleY = WINDOW_H / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    if (this.gameMode === "REGISTER") {
      // Snap Photo button
      if (clickX >= 115 && clickX <= 435 && clickY >= 126 && clickY <= 380) {
        this.snapPhoto();
      }
      // Cloud Consent button
      if (clickX >= 475 && clickX <= 795 && clickY >= 354 && clickY <= 398) {
        this.cloudPhotoConsent = !this.cloudPhotoConsent;
      }
      // Launch Button
      if (clickX >= 190 && clickX <= 710 && clickY >= 418 && clickY <= 458) {
        this.startGameSession();
      }
    }
  }

  snapPhoto() {
    const snap = this.tracker.captureSnapshot();
    this.capturedPhotoB64 = snap.thumbnailDataUrl;
    this.capturedThumbImg = snap.canvasThumb;
    this.capturedPreviewImg = snap.canvasPrev;
    audio.playSfx("snap");
  }

  startGameSession() {
    if (!this.capturedThumbImg) {
      this.snapPhoto();
    }
    this.playerNameInput = this.sanitizeName(this.playerNameInput);
    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.loadLevel(1);
    this.bannerText = "WORLD 1-1 OVERWORLD!";
    this.bannerFrames = 90;
    this.gameMode = "PLAYING";
    audio.startBgm();
  }

  sanitizeName(raw) {
    const clean = String(raw).toUpperCase().replace(/[^A-Z0-9 _-]/g, "").trim().replace(/^[-_ ]+/, "");
    return clean ? clean.slice(0, 10) : "PLAYER1";
  }

  loadLevel(levelNum, respawnAtCheckpoint = false) {
    this.currentLevel = levelNum;
    this.levelConfig = getLevelConfig(levelNum);

    if (!respawnAtCheckpoint) {
      this.checkpointReached = false;
    }

    const spawnX = respawnAtCheckpoint && this.checkpointReached ? this.levelConfig.checkpointX : 80;
    this.marioFx = spawnX;
    this.marioFy = GROUND_Y - 38;
    this.mario.x = Math.round(this.marioFx);
    this.mario.y = Math.round(this.marioFy);
    this.marioVx = 0.0;
    this.marioVy = 0.0;
    this.onGround = true;
    this.coyoteFrames = 0;
    this.jumpBufferFrames = 0;
    this.cameraFx = Math.max(0.0, this.marioFx - 260.0);
    this.cameraX = Math.round(this.cameraFx);
    this.worldTimer = 400.0;
    this.floatingPopups = [];
  }

  loadLeaderboard() {
    try {
      const data = localStorage.getItem("super_mario_leaderboard");
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 7);
        }
      }
    } catch (e) {}
    return [];
  }

  saveCurrentScore() {
    if (this.score <= 0) return;
    const entry = {
      name: this.playerNameInput,
      score: this.score,
      coins: this.coins,
      level: this.currentLevel,
      timestamp: new Date().toISOString(),
      photo_b64: this.capturedPhotoB64
    };

    this.leaderboardEntries.push(entry);
    this.leaderboardEntries.sort((a, b) => b.score - a.score);
    this.leaderboardEntries = this.leaderboardEntries.slice(0, 7);

    try {
      localStorage.setItem("super_mario_leaderboard", JSON.stringify(this.leaderboardEntries));
    } catch (e) {}

    // Cloud webhook sync if configured
    this.syncCloudLeaderboard(entry);
  }

  async fetchCloudLeaderboard() {
    const webhookUrl = window.MARIO_SHEETS_WEBHOOK_URL || localStorage.getItem("MARIO_SHEETS_WEBHOOK_URL");
    if (!webhookUrl) return;

    try {
      const res = await fetch(webhookUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === "OK" && Array.isArray(data.entries) && data.entries.length > 0) {
          const cloudEntries = data.entries.map((item) => ({
            name: this.sanitizeName(item.name),
            score: parseInt(item.score, 10) || 0,
            coins: parseInt(item.coins, 10) || 0,
            level: parseInt(item.level, 10) || 1,
            timestamp: item.timestamp,
            photo_b64: ""
          }));
          // Merge top scores
          const combined = [...cloudEntries, ...this.leaderboardEntries];
          combined.sort((a, b) => b.score - a.score);
          this.leaderboardEntries = combined.slice(0, 7);
          this.cloudStatus = "CLOUD SYNCED";
        }
      }
    } catch (e) {
      console.warn("Could not fetch cloud leaderboard", e);
    }
  }

  async syncCloudLeaderboard(entry) {
    const webhookUrl = window.MARIO_SHEETS_WEBHOOK_URL || localStorage.getItem("MARIO_SHEETS_WEBHOOK_URL");
    const webhookToken = window.MARIO_SHEETS_TOKEN || localStorage.getItem("MARIO_SHEETS_TOKEN");

    if (!webhookUrl || !webhookToken) {
      this.cloudStatus = "LOCAL ONLY";
      return;
    }

    this.cloudStatus = "SYNCING...";
    try {
      const payload = {
        token: webhookToken,
        name: entry.name,
        score: entry.score,
        coins: entry.coins,
        level: entry.level,
        timestamp: entry.timestamp
      };
      if (this.cloudPhotoConsent && entry.photo_b64) {
        payload.photo_b64 = entry.photo_b64;
      }

      // Use text/plain and no-cors to avoid Google Apps Script CORS preflight block
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      this.cloudStatus = "CLOUD SYNCED";
    } catch (e) {
      console.warn("Cloud sync error:", e);
      this.cloudStatus = "SYNC ERROR";
    }
  }

  // Main 60 FPS loop
  loop(currentTime) {
    const deltaMs = currentTime - this.lastTime;
    this.lastTime = currentTime;
    const dt = Math.min(0.1, deltaMs / 1000.0);
    const dtScale = Math.min(2.2, Math.max(0.5, dt * 60.0));
    this.frameTick++;

    // FPS meter
    this.fpsCount++;
    if (currentTime - this.fpsTimer >= 1000) {
      this.fps = this.fpsCount;
      this.fpsCount = 0;
      this.fpsTimer = currentTime;
    }

    if (this.gameMode === "PLAYING") {
      this.updatePhysics(dt, dtScale);
    }

    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  updatePhysics(dt, dtScale) {
    this.worldTimer = Math.max(0.0, this.worldTimer - dt);
    if (this.bannerFrames > 0) this.bannerFrames--;
    if (this.invincibleFrames > 0) this.invincibleFrames--;

    const cfg = this.levelConfig;

    // Moving platforms
    for (const plat of cfg.movingPlatforms) {
      const oldPx = plat.x;
      const oldPy = plat.y;
      plat.x += plat.vx * dtScale;
      plat.y += plat.vy * dtScale;

      if (plat.vx !== 0 && (plat.x < plat.min_x || plat.x > plat.max_x)) plat.vx = -plat.vx;
      if (plat.vy !== 0 && (plat.y < plat.min_y || plat.y > plat.max_y)) plat.vy = -plat.vy;

      const dxP = plat.x - oldPx;
      const dyP = plat.y - oldPy;
      if (
        this.onGround &&
        Math.abs(this.mario.y + this.mario.h - oldPy) <= 4 &&
        this.mario.x + this.mario.w > plat.x &&
        this.mario.x < plat.x + plat.w
      ) {
        this.marioFx += dxP;
        this.marioFy += dyP;
        this.mario.x = Math.round(this.marioFx);
        this.mario.y = Math.round(this.marioFy);
      }
    }

    // Input combination: Keyboard + MediaPipe Gesture
    const kbRight = this.keys["arrowright"] || this.keys["d"] || this.keys["KeyD"] || this.keys["ArrowRight"];
    const kbLeft = this.keys["arrowleft"] || this.keys["a"] || this.keys["KeyA"] || this.keys["ArrowLeft"];
    const kbJump =
      this.keys[" "] ||
      this.keys["space"] ||
      this.keys["Space"] ||
      this.keys["arrowup"] ||
      this.keys["w"] ||
      this.keys["KeyW"] ||
      this.keys["ArrowUp"];

    const ai = this.tracker.aiGesture;
    const aiRight = ai === "RUN RIGHT" || ai === "JUMP + RIGHT";
    const aiLeft = ai === "RUN LEFT";
    const aiJump = ai === "JUMP" || ai === "JUMP + RIGHT";

    const moveRight = kbRight || aiRight;
    const moveLeft = kbLeft || aiLeft;
    const wantJump = kbJump || aiJump;

    // Horizontal acceleration & air momentum
    const maxRunSpeed = 4.2;
    const accel = 0.55 * dtScale;
    if (moveRight) {
      this.marioVx = Math.min(maxRunSpeed, this.marioVx + accel);
      this.marioFacing = 1;
    } else if (moveLeft) {
      this.marioVx = Math.max(-maxRunSpeed, this.marioVx - accel);
      this.marioFacing = -1;
    } else {
      const decay = Math.pow(this.onGround ? 0.82 : 0.96, dtScale);
      this.marioVx *= decay;
      if (Math.abs(this.marioVx) < 0.15) this.marioVx = 0.0;
    }

    // Coyote Time & Jump Buffer
    if (this.onGround) this.coyoteFrames = 10;
    else if (this.coyoteFrames > 0) this.coyoteFrames--;

    if (wantJump) this.jumpBufferFrames = 10;
    else if (this.jumpBufferFrames > 0) this.jumpBufferFrames--;

    if (this.jumpBufferFrames > 0 && this.coyoteFrames > 0) {
      this.marioVy = -9.8;
      this.onGround = false;
      this.coyoteFrames = 0;
      this.jumpBufferFrames = 0;
      audio.playSfx("jump");
      if (Math.abs(this.marioVx) > 0.8) {
        this.marioVx = maxRunSpeed * this.marioFacing;
      }
    }

    // Build solid rects
    const solidRects = [
      ...cfg.groundSections,
      ...cfg.pipes,
      ...cfg.bricks,
      ...cfg.qBlocks,
      ...cfg.stairs,
      ...cfg.movingPlatforms
    ];

    // Horizontal movement & corner rounding
    this.marioFx += this.marioVx * dtScale;
    if (this.marioFx < this.cameraFx) this.marioFx = this.cameraFx;
    this.mario.x = Math.round(this.marioFx);

    for (const b of solidRects) {
      if (this.rectIntersect(this.mario, b)) {
        if (b.y < this.mario.y + this.mario.h && this.mario.y + this.mario.h <= b.y + 6 && this.marioVy >= 0) {
          this.mario.y = b.y - this.mario.h;
          this.marioFy = this.mario.y;
          this.onGround = true;
        } else if (this.marioVx > 0) {
          this.mario.x = b.x - this.mario.w;
          this.marioFx = this.mario.x;
          this.marioVx = 0.0;
        } else if (this.marioVx < 0) {
          this.mario.x = b.x + b.w;
          this.marioFx = this.mario.x;
          this.marioVx = 0.0;
        }
      }
    }

    // Vertical movement & variable gravity
    const grav = this.marioVy < 0 && wantJump ? 0.36 : 0.48;
    this.marioVy = Math.min(8.5, this.marioVy + grav * dtScale);
    this.marioFy += this.marioVy * dtScale;
    this.mario.y = Math.round(this.marioFy);

    this.onGround = false;
    for (const b of solidRects) {
      if (this.rectIntersect(this.mario, b)) {
        if (this.marioVy > 0) {
          this.mario.y = b.y - this.mario.h;
          this.marioFy = this.mario.y;
          this.marioVy = 0.0;
          this.onGround = true;
        } else if (this.marioVy < 0) {
          // 6px corner rounding assist
          if (this.mario.x + this.mario.w - b.x <= 6) {
            this.mario.x = b.x - this.mario.w;
            this.marioFx = this.mario.x;
            continue;
          }
          if (b.x + b.w - this.mario.x <= 6) {
            this.mario.x = b.x + b.w;
            this.marioFx = this.mario.x;
            continue;
          }

          this.mario.y = b.y + b.h;
          this.marioFy = this.mario.y;
          this.marioVy = 0.0;

          // Question block hit
          for (const q of cfg.qBlocks) {
            if (q.x === b.x && q.y === b.y && !q.used) {
              q.used = true;
              q.bounce = 10;
              this.score += 200;
              this.coins += 1;
              audio.playSfx("coin");
              this.floatingPopups.push({ x: q.x, y: q.y - 16, text: "+200", timer: 35 });
            }
          }
        }
      }
    }

    // Springs
    for (const sp of cfg.springs) {
      if (this.rectIntersect(this.mario, sp)) {
        this.mario.y = sp.y - this.mario.h;
        this.marioFy = this.mario.y;
        this.marioVy = -13.2;
        this.onGround = false;
        audio.playSfx("spring");
        this.floatingPopups.push({ x: sp.x, y: sp.y - 12, text: "BOING!", timer: 28 });
      }
    }

    // Mid-level checkpoint
    if (!this.checkpointReached && this.mario.x + this.mario.w >= cfg.checkpointX) {
      this.checkpointReached = true;
      this.score += 500;
      audio.playSfx("coin");
      this.bannerText = "CHECKPOINT SAVED! +500";
      this.bannerFrames = 75;
    }

    for (const q of cfg.qBlocks) {
      if (q.bounce > 0) q.bounce--;
    }

    // Smooth Camera Follow
    const targetCam = Math.min(cfg.levelEndX - GAME_W, Math.max(this.cameraFx, this.marioFx - 300.0));
    this.cameraFx += (targetCam - this.cameraFx) * Math.min(1.0, 0.18 * dtScale);
    this.cameraX = Math.round(this.cameraFx);

    // Pit fall
    if (this.mario.y > WINDOW_H) {
      audio.playSfx("hurt");
      this.lives--;
      if (this.lives <= 0) {
        this.saveCurrentScore();
        this.lives = 3;
        this.loadLevel(1, false);
        this.bannerText = "SCORE SAVED! NEW RUN";
        this.bannerFrames = 90;
      } else {
        this.loadLevel(this.currentLevel, true);
        this.bannerText = `LIVES LEFT: ${this.lives}`;
        this.bannerFrames = 70;
      }
    }

    // Coin collection
    for (let i = cfg.coins.length - 1; i >= 0; i--) {
      const c = cfg.coins[i];
      if (this.rectIntersect(this.mario, c)) {
        cfg.coins.splice(i, 1);
        this.score += 200;
        this.coins += 1;
        audio.playSfx("coin");
        this.floatingPopups.push({ x: c.x, y: c.y, text: "+200", timer: 35 });
      }
    }

    // Goomba patrol & stomping
    for (const g of cfg.goombas) {
      if (g.state === "dead") continue;
      if (g.state === "squished") {
        g.timer--;
        if (g.timer <= 0) g.state = "dead";
        continue;
      }

      g.x += g.vx * dtScale;
      if (g.x < g.min_x || g.x + g.w > g.max_x) {
        g.vx = -g.vx;
      }

      // Check collision
      const core = { x: g.x + 3, y: g.y + 1, w: g.w - 6, h: g.h - 2 };
      if (this.rectIntersect(this.mario, core)) {
        if (this.marioVy > 0 || this.mario.y + this.mario.h <= g.y + 20) {
          g.state = "squished";
          g.timer = 25;
          this.marioVy = -7.8;
          this.score += 100;
          audio.playSfx("stomp");
          this.floatingPopups.push({ x: g.x, y: g.y - 10, text: "+100", timer: 35 });
        } else if (this.invincibleFrames === 0) {
          audio.playSfx("hurt");
          this.lives--;
          this.invincibleFrames = 75;
          if (this.lives <= 0) {
            this.saveCurrentScore();
            this.lives = 3;
            this.loadLevel(1, false);
            this.bannerText = "SCORE SAVED TO LEADERBOARD!";
            this.bannerFrames = 95;
            break;
          } else {
            this.marioVy = -6.0;
            this.bannerText = `OUCH! ${this.lives} LIVES LEFT`;
            this.bannerFrames = 60;
          }
        }
      }
    }

    // Flagpole level clear
    if (this.mario.x + this.mario.w >= cfg.levelEndX - 150) {
      audio.playSfx("clear");
      this.score += 1000;
      if (this.currentLevel < TOTAL_LEVELS) {
        const nextLv = this.currentLevel + 1;
        this.loadLevel(nextLv, false);
        const titles = {
          2: "WORLD 1-2 UNDERGROUND!",
          3: "WORLD 1-3 SKY BRIDGES!",
          4: "WORLD 1-4 BOWSER CASTLE!"
        };
        this.bannerText = titles[nextLv] || `WORLD 1-${nextLv}!`;
        this.bannerFrames = 100;
      } else {
        this.saveCurrentScore();
        this.bannerText = `ALL 4 WORLDS CLEAR! ${this.score} PTS`;
        this.bannerFrames = 120;
        this.lives = 3;
        this.loadLevel(1, false);
      }
    }
  }

  rectIntersect(r1, r2) {
    return (
      r1.x < r2.x + r2.w &&
      r1.x + r1.w > r2.x &&
      r1.y < r2.y + r2.h &&
      r1.y + r1.h > r2.y
    );
  }

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    if (this.gameMode === "REGISTER") {
      this.renderRegistrationScreen(ctx);
    } else {
      this.renderGameplayScreen(ctx);
    }

    this.renderSidebar(ctx);
  }

  // PRE-GAME PHOTO BOOTH SCREEN
  renderRegistrationScreen(ctx) {
    ctx.fillStyle = UI_DARK;
    ctx.fillRect(0, 0, GAME_W, WINDOW_H);

    ctx.fillStyle = NES_SKY;
    ctx.fillRect(0, 0, GAME_W, GROUND_Y);

    ctx.fillStyle = GROUND_RUST;
    ctx.fillRect(0, GROUND_Y, GAME_W, WINDOW_H - GROUND_Y);
    for (let tx = 0; tx < GAME_W; tx += 32) {
      ctx.strokeStyle = MORTAR_BLACK;
      ctx.lineWidth = 2;
      ctx.strokeRect(tx, GROUND_Y, 32, 32);
      ctx.fillStyle = GROUND_PEACH;
      ctx.fillRect(tx + 2, GROUND_Y + 2, 26, 4);
    }

    // Modal dialog
    ctx.fillStyle = UI_DARK;
    ctx.fillRect(80, 32, 740, 452);
    ctx.strokeStyle = COIN_GOLD;
    ctx.lineWidth = 4;
    ctx.strokeRect(80, 32, 740, 452);

    drawBlockText(ctx, "SUPER MARIO ARCADE", 190, 50, 4, COIN_GOLD);
    drawBlockText(ctx, "PLAYER PHOTO AND NAME REGISTRATION", 150, 94, 2, WHITE);

    // Live webcam booth box
    ctx.fillStyle = UI_CARD;
    ctx.fillRect(115, 126, 320, 210);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.strokeRect(115, 126, 320, 210);

    if (this.tracker.camReady) {
      ctx.drawImage(this.tracker.previewCanvas, 117, 128, 316, 206);
    } else if (this.tracker.camError) {
      drawBlockText(ctx, "CAMERA ERROR, USING KEYBOARD", 120, 215, 1, COIN_GOLD);
    } else {
      drawBlockText(ctx, "CAMERA STARTING...", 165, 215, 2, COIN_GOLD);
    }

    drawBlockText(ctx, "SPACE / CLICK: SNAP PHOTO", 135, 346, 2, PIPE_HIGHLIGHT);
    drawBlockText(ctx, "TAB: SWITCH CAMERA", 135, 368, 2, WHITE);

    // Captured photo preview box
    drawBlockText(ctx, "CAPTURED PHOTO:", 475, 128, 2, COIN_GOLD);
    ctx.fillStyle = UI_CARD;
    ctx.fillRect(475, 152, 164, 124);
    ctx.strokeStyle = this.capturedPreviewImg ? PIPE_HIGHLIGHT : UI_BORDER;
    ctx.lineWidth = 2;
    ctx.strokeRect(475, 152, 164, 124);

    if (this.capturedPreviewImg) {
      ctx.drawImage(this.capturedPreviewImg, 477, 154, 160, 120);
      drawBlockText(ctx, "LOCKED!", 650, 204, 2, PIPE_HIGHLIGHT);
    } else {
      drawBlockText(ctx, "AUTO-SNAPS ON", 482, 194, 2, WHITE);
      drawBlockText(ctx, "ENTER IF SKIP", 482, 218, 2, WHITE);
    }

    // Name input box
    drawBlockText(ctx, "TYPE PLAYER NAME:", 475, 286, 2, COIN_GOLD);
    ctx.fillStyle = BLACK;
    ctx.fillRect(475, 308, 300, 36);
    ctx.strokeStyle = COIN_GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(475, 308, 300, 36);

    const cursor = Math.floor(this.frameTick / 20) % 2 === 0 ? "_" : " ";
    drawBlockText(ctx, (this.playerNameInput || "") + cursor, 488, 319, 2, WHITE);

    // Cloud photo consent toggle
    const consentLabel = this.cloudPhotoConsent ? "SEND PHOTO TO CLOUD: ON" : "SEND PHOTO TO CLOUD: OFF";
    const consentCol = this.cloudPhotoConsent ? PIPE_HIGHLIGHT : COIN_GOLD;
    ctx.fillStyle = UI_CARD;
    ctx.fillRect(475, 354, 320, 44);
    ctx.strokeStyle = consentCol;
    ctx.lineWidth = 2;
    ctx.strokeRect(475, 354, 320, 44);
    drawBlockText(ctx, consentLabel, 485, 361, 2, consentCol);
    drawBlockText(ctx, "CLICK OR PRESS P TO TOGGLE", 485, 381, 1, WHITE);

    // Launch button
    ctx.fillStyle = UI_GREEN;
    ctx.fillRect(190, 418, 520, 40);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.strokeRect(190, 418, 520, 40);
    drawBlockText(ctx, "PRESS ENTER TO LAUNCH 4-WORLD TOUR", 198, 431, 2, WHITE);
  }

  // 60 FPS ACTIVE GAMEPLAY RENDER
  renderGameplayScreen(ctx) {
    const cfg = this.levelConfig;
    const lv = this.currentLevel;

    // Viewport clipping (0, 0, 900, 520)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, GAME_W, 520);
    ctx.clip();

    // Background color
    let bgCol = NES_SKY;
    if (lv === 2) bgCol = UNDERGROUND_BG;
    else if (lv === 3) bgCol = ATHLETIC_SKY;
    else if (lv === 4) bgCol = CASTLE_BG;

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, GAME_W, 520);

    // Ceiling bricks in Level 2 & 4
    if (lv === 2 || lv === 4) {
      const ceilCol = lv === 2 ? BLUE_BRICK : CASTLE_STONE;
      for (let tx = 0; tx < GAME_W; tx += 32) {
        ctx.fillStyle = ceilCol;
        ctx.fillRect(tx, 52, 32, 20);
        ctx.strokeStyle = MORTAR_BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(tx, 52, 32, 20);
      }
    }

    // Lava pits in Level 4
    if (lv === 4) {
      ctx.fillStyle = LAVA_RED;
      ctx.fillRect(0, GROUND_Y + 6, GAME_W, 20);
      ctx.fillStyle = LAVA_GOLD;
      ctx.fillRect(0, GROUND_Y + 6, GAME_W, 4);
    }

    // Clouds
    for (const [cx, cy, cw] of cfg.clouds) {
      const sx = cx - Math.round(this.cameraX * 0.5);
      if (sx >= -140 && sx <= GAME_W + 20) {
        ctx.fillStyle = CLOUD_OUTLINE;
        this.fillEllipse(ctx, sx - 2, cy - 2, cw + 4, 34);
        ctx.fillStyle = CLOUD_WHITE;
        this.fillEllipse(ctx, sx, cy, cw, 30);
      }
    }

    // Hills
    for (const [hx, hw, hh] of cfg.hills) {
      const sx = hx - this.cameraX;
      if (sx >= -180 && sx <= GAME_W + 20) {
        ctx.fillStyle = HILL_GREEN;
        ctx.beginPath();
        ctx.moveTo(sx, GROUND_Y);
        ctx.lineTo(sx + hw / 2, GROUND_Y - hh);
        ctx.lineTo(sx + hw, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = MORTAR_BLACK;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Bushes
    for (const [bx, bw] of cfg.bushes) {
      const sx = bx - this.cameraX;
      if (sx >= -120 && sx <= GAME_W + 20) {
        ctx.fillStyle = BUSH_LIME;
        this.fillEllipse(ctx, sx, GROUND_Y - 24, bw, 28);
        ctx.strokeStyle = PIPE_SHADOW;
        ctx.lineWidth = 2;
        this.strokeEllipse(ctx, sx, GROUND_Y - 24, bw, 28);
      }
    }

    // Ground blocks themed by World
    let gMain = GROUND_RUST;
    let gTop = GROUND_PEACH;
    if (lv === 2) {
      gMain = BLUE_BRICK;
      gTop = BLUE_HIGHLIGHT;
    } else if (lv === 4) {
      gMain = CASTLE_STONE;
      gTop = CASTLE_HIGHLIGHT;
    }

    for (const g of cfg.groundSections) {
      const firstTile = Math.max(g.x, Math.floor(this.cameraX / 32) * 32);
      const lastTile = Math.min(g.x + g.w, this.cameraX + GAME_W + 32);
      for (let tx = firstTile; tx < lastTile; tx += 32) {
        const sx = tx - this.cameraX;
        ctx.fillStyle = gMain;
        ctx.fillRect(sx, GROUND_Y, 32, 20);
        ctx.fillStyle = gTop;
        ctx.fillRect(sx + 2, GROUND_Y + 2, 26, 4);
        ctx.strokeStyle = MORTAR_BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, GROUND_Y, 32, 20);
      }
    }

    // Bricks
    let bCol = BRICK_RED;
    if (lv === 2) bCol = BLUE_BRICK;
    else if (lv === 4) bCol = CASTLE_STONE;

    for (const b of cfg.bricks) {
      const sx = b.x - this.cameraX;
      if (sx >= -40 && sx <= GAME_W + 20) {
        ctx.fillStyle = bCol;
        ctx.fillRect(sx, b.y, 32, 32);
        ctx.strokeStyle = MORTAR_BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, b.y, 32, 32);
        ctx.beginPath();
        ctx.moveTo(sx, b.y + 16);
        ctx.lineTo(sx + 32, b.y + 16);
        ctx.moveTo(sx + 16, b.y);
        ctx.lineTo(sx + 16, b.y + 16);
        ctx.stroke();
      }
    }

    // Question (?) blocks
    for (const q of cfg.qBlocks) {
      const sx = q.x - this.cameraX;
      const sy = q.y - q.bounce;
      if (sx >= -40 && sx <= GAME_W + 20) {
        ctx.fillStyle = q.used ? Q_USED_BROWN : Q_ORANGE;
        ctx.fillRect(sx, sy, 32, 32);
        ctx.strokeStyle = MORTAR_BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, 32, 32);
        if (!q.used) {
          drawBlockText(ctx, "?", sx + 10, sy + 6, 3, WHITE);
        }
      }
    }

    // Moving Elevator / Bridge Platforms
    for (const mp of cfg.movingPlatforms) {
      const sx = mp.x - this.cameraX;
      if (sx >= -90 && sx <= GAME_W + 20) {
        ctx.fillStyle = COIN_GOLD;
        ctx.fillRect(sx, mp.y, mp.w, 16);
        ctx.strokeStyle = MORTAR_BLACK;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, mp.y, mp.w, 16);
        ctx.fillStyle = MARIO_RED;
        ctx.fillRect(sx + 4, mp.y + 4, mp.w - 8, 4);
      }
    }

    // Red Bounce Springs
    for (const sp of cfg.springs) {
      const sx = sp.x - this.cameraX;
      if (sx >= -40 && sx <= GAME_W + 20) {
        ctx.fillStyle = MARIO_RED;
        ctx.fillRect(sx, sp.y, 28, 8);
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx + 4, sp.y + 8);
        ctx.lineTo(sx + 24, sp.y + 16);
        ctx.lineTo(sx + 4, sp.y + 24);
        ctx.stroke();
        ctx.fillStyle = CASTLE_STONE;
        ctx.fillRect(sx, sp.y + 22, 28, 6);
      }
    }

    // Mid-level Checkpoint Flag
    const cpSx = cfg.checkpointX - this.cameraX;
    if (cpSx >= -40 && cpSx <= GAME_W + 20) {
      ctx.fillStyle = WHITE;
      ctx.fillRect(cpSx, GROUND_Y - 72, 4, 72);
      ctx.fillStyle = this.checkpointReached ? UI_GREEN : MARIO_RED;
      ctx.beginPath();
      ctx.moveTo(cpSx + 4, GROUND_Y - 72);
      ctx.lineTo(cpSx + 34, GROUND_Y - 58);
      ctx.lineTo(cpSx + 4, GROUND_Y - 44);
      ctx.closePath();
      ctx.fill();
    }

    // End staircase
    for (const s of cfg.stairs) {
      const sx = s.x - this.cameraX;
      if (sx >= -40 && sx <= GAME_W + 20) {
        for (let ty = s.y; ty < s.y + s.h; ty += 28) {
          ctx.fillStyle = gMain;
          ctx.fillRect(sx, ty, 32, 28);
          ctx.strokeStyle = MORTAR_BLACK;
          ctx.lineWidth = 2;
          ctx.strokeRect(sx, ty, 32, 28);
        }
      }
    }

    // Warp pipes
    for (const p of cfg.pipes) {
      const sx = p.x - this.cameraX;
      if (sx >= -70 && sx <= GAME_W + 20) {
        // Body
        ctx.fillStyle = PIPE_GREEN;
        ctx.fillRect(sx + 4, p.y + 22, 48, p.h - 22);
        ctx.fillStyle = PIPE_HIGHLIGHT;
        ctx.fillRect(sx + 10, p.y + 22, 9, p.h - 22);
        ctx.strokeStyle = PIPE_SHADOW;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 4, p.y + 22, 48, p.h - 22);
        // Top lip
        ctx.fillStyle = PIPE_GREEN;
        ctx.fillRect(sx, p.y, 56, 22);
        ctx.fillStyle = PIPE_HIGHLIGHT;
        ctx.fillRect(sx + 8, p.y + 2, 10, 18);
        ctx.strokeStyle = PIPE_SHADOW;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, p.y, 56, 22);
      }
    }

    // Flagpole and Castle
    const poleSx = cfg.levelEndX - 150 - this.cameraX;
    if (poleSx >= -200 && poleSx <= GAME_W + 40) {
      ctx.fillStyle = gMain;
      ctx.fillRect(poleSx - 12, GROUND_Y - 28, 32, 28);
      ctx.fillStyle = PIPE_HIGHLIGHT;
      ctx.fillRect(poleSx + 2, GROUND_Y - 270, 4, 242);
      ctx.fillStyle = PIPE_GREEN;
      ctx.beginPath();
      ctx.arc(poleSx + 4, GROUND_Y - 274, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(poleSx + 2, GROUND_Y - 264);
      ctx.lineTo(poleSx - 38, GROUND_Y - 246);
      ctx.lineTo(poleSx + 2, GROUND_Y - 228);
      ctx.closePath();
      ctx.fill();

      const castleSx = poleSx + 54;
      ctx.fillStyle = lv !== 4 ? BRICK_RED : CASTLE_STONE;
      ctx.fillRect(castleSx, GROUND_Y - 96, 92, 96);
      ctx.strokeStyle = MORTAR_BLACK;
      ctx.lineWidth = 2;
      ctx.strokeRect(castleSx, GROUND_Y - 96, 92, 96);
      ctx.fillStyle = BLACK;
      ctx.fillRect(castleSx + 32, GROUND_Y - 46, 28, 46);
    }

    // Coins
    for (const c of cfg.coins) {
      const sx = c.x - this.cameraX;
      if (sx >= -30 && sx <= GAME_W + 20) {
        ctx.fillStyle = COIN_GOLD;
        this.fillEllipse(ctx, sx, c.y, 18, 24);
        ctx.strokeStyle = Q_USED_BROWN;
        ctx.lineWidth = 2;
        this.strokeEllipse(ctx, sx, c.y, 18, 24);
      }
    }

    // Goombas
    for (const g of cfg.goombas) {
      if (g.state !== "dead") {
        const sx = g.x - this.cameraX;
        if (sx >= -40 && sx <= GAME_W + 20) {
          this.drawGoombaSprite(ctx, sx, g.y, g.state, this.frameTick, lv);
        }
      }
    }

    // Mario Sprite
    if (this.invincibleFrames % 2 === 0) {
      this.drawMarioSprite(
        ctx,
        this.mario.x - this.cameraX - 2,
        this.mario.y,
        this.marioFacing,
        !this.onGround,
        Math.round(this.marioFx)
      );
    }

    // Floating Popups (+200, BOING!)
    for (let i = this.floatingPopups.length - 1; i >= 0; i--) {
      const p = this.floatingPopups[i];
      p.y -= 1.2;
      p.timer--;
      drawBlockText(ctx, p.text, p.x - this.cameraX, Math.round(p.y), 2, COIN_GOLD);
      if (p.timer <= 0) this.floatingPopups.splice(i, 1);
    }

    // Top NES HUD
    if (this.capturedThumbImg) {
      ctx.drawImage(this.capturedThumbImg, 16, 10, 34, 26);
      ctx.strokeStyle = COIN_GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 10, 34, 26);
    }
    drawBlockText(ctx, this.playerNameInput || "MARIO", 58, 10, 2, WHITE);
    drawBlockText(ctx, String(this.score).padStart(6, "0"), 58, 28, 2, COIN_GOLD);

    drawBlockText(ctx, "COINS", 235, 10, 2, WHITE);
    drawBlockText(ctx, `X${String(this.coins).padStart(2, "0")}`, 235, 28, 2, COIN_GOLD);

    drawBlockText(ctx, "WORLD", 375, 10, 2, WHITE);
    drawBlockText(ctx, `1-${lv}/4`, 375, 28, 2, COIN_GOLD);

    drawBlockText(ctx, "LIVES", 535, 10, 2, WHITE);
    drawBlockText(ctx, `X${this.lives}`, 545, 28, 2, PIPE_HIGHLIGHT);

    drawBlockText(ctx, "TIME", 675, 10, 2, WHITE);
    drawBlockText(ctx, String(Math.floor(this.worldTimer)).padStart(3, "0"), 680, 28, 2, COIN_GOLD);

    drawBlockText(ctx, `${this.fps}FPS`, 795, 18, 2, PIPE_HIGHLIGHT);

    // Banner alert
    if (this.bannerFrames > 0) {
      ctx.fillStyle = UI_DARK;
      ctx.fillRect(180, 190, 540, 46);
      ctx.strokeStyle = COIN_GOLD;
      ctx.lineWidth = 3;
      ctx.strokeRect(180, 190, 540, 46);
      drawBlockText(ctx, this.bannerText, 200, 206, 2, COIN_GOLD);
    }

    ctx.restore();

    // Bottom Control Cards Bar (0, 520, 900, 80)
    ctx.fillStyle = UI_DARK;
    ctx.fillRect(0, 520, GAME_W, 80);
    ctx.strokeStyle = UI_BORDER;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 520);
    ctx.lineTo(GAME_W, 520);
    ctx.stroke();

    const kbRight = this.keys["arrowright"] || this.keys["d"] || this.keys["KeyD"] || this.keys["ArrowRight"];
    const kbLeft = this.keys["arrowleft"] || this.keys["a"] || this.keys["KeyA"] || this.keys["ArrowLeft"];
    const kbJump = this.keys[" "] || this.keys["space"] || this.keys["Space"] || this.keys["arrowup"] || this.keys["w"] || this.keys["KeyW"];
    const ai = this.tracker.aiGesture;
    const moveRight = kbRight || ai === "RUN RIGHT" || ai === "JUMP + RIGHT";
    const moveLeft = kbLeft || ai === "RUN LEFT";
    const wantJump = kbJump || ai === "JUMP" || ai === "JUMP + RIGHT";

    const cards = [
      ["RUN RIGHT", "4-5 FINGERS", "KEY: D / RIGHT", moveRight && !wantJump],
      ["JUMP+RIGHT", "3 FINGERS", "KEY: W+D", moveRight && wantJump],
      ["RUN LEFT", "2 FINGERS", "KEY: A / LEFT", moveLeft],
      ["JUMP", "1 FINGER", "KEY: SPACE / W", wantJump && !moveRight],
      ["1-4: WARP", "N: NEW PLAYER", "M: MUTE R: RST", false]
    ];

    cards.forEach(([title, hTxt, kTxt, act], idx) => {
      const cx = 10 + idx * 177;
      const cy = 528;
      ctx.fillStyle = act ? UI_GREEN : UI_CARD;
      ctx.fillRect(cx, cy, 169, 64);
      ctx.strokeStyle = act ? COIN_GOLD : UI_BORDER;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, 169, 64);

      drawBlockText(ctx, title, cx + 8, cy + 8, 2, WHITE);
      drawBlockText(ctx, hTxt, cx + 8, cy + 30, 1, COIN_GOLD);
      drawBlockText(ctx, kTxt, cx + 8, cy + 44, 1, WHITE);
    });
  }

  // RIGHT SIDEBAR (380x600): WEBCAM FEED + FINGER GAUGES + LEADERBOARD
  renderSidebar(ctx) {
    ctx.fillStyle = UI_DARK;
    ctx.fillRect(GAME_W, 0, SIDE_W, WINDOW_H);
    ctx.strokeStyle = UI_BORDER;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(GAME_W, 0);
    ctx.lineTo(GAME_W, WINDOW_H);
    ctx.stroke();

    // AI Gesture Header
    const gestureColor = this.tracker.handDetected ? PIPE_HIGHLIGHT : COIN_GOLD;
    drawBlockText(ctx, `AI: ${this.tracker.aiGesture}`, GAME_W + 14, 10, 2, gestureColor);
    drawBlockText(ctx, `CAM C:SWITCH`, GAME_W + 265, 14, 1, WHITE);

    // Camera Preview Frame (360x210)
    if (this.tracker.camReady) {
      ctx.drawImage(this.tracker.previewCanvas, GAME_W + 10, 32, 360, 210);
    } else {
      ctx.fillStyle = UI_CARD;
      ctx.fillRect(GAME_W + 10, 32, 360, 210);
      if (this.tracker.camError) {
        drawBlockText(ctx, "CAMERA OFF / DENIED", GAME_W + 30, 115, 2, COIN_GOLD);
        drawBlockText(ctx, "KEYBOARD ACTIVE (A/D/W)", GAME_W + 20, 145, 2, WHITE);
      } else {
        drawBlockText(ctx, "CAM STARTING...", GAME_W + 65, 125, 2, COIN_GOLD);
      }
    }
    ctx.strokeStyle = UI_BORDER;
    ctx.lineWidth = 2;
    ctx.strokeRect(GAME_W + 10, 32, 360, 210);

    // 5 Finger Gauges
    const fNames = ["THB", "IDX", "MID", "RNG", "PNK"];
    const fKeys = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"];
    fNames.forEach((shortN, i) => {
      const px = GAME_W + 10 + i * 73;
      const py = 248;
      const isUp = this.tracker.fingerStates[fKeys[i]];

      ctx.fillStyle = isUp ? UI_GREEN : UI_CARD;
      ctx.fillRect(px, py, 68, 24);
      ctx.strokeStyle = UI_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, 68, 24);
      drawBlockText(ctx, shortN, px + 14, py + 6, 2, WHITE);
    });

    // Leaderboard Box
    ctx.fillStyle = UI_CARD;
    ctx.fillRect(GAME_W + 10, 280, 360, 308);
    ctx.strokeStyle = UI_BORDER;
    ctx.lineWidth = 2;
    ctx.strokeRect(GAME_W + 10, 280, 360, 308);

    drawBlockText(ctx, "LEADERBOARD", GAME_W + 18, 290, 2, COIN_GOLD);
    drawBlockText(ctx, this.cloudStatus, GAME_W + 235, 294, 1, PIPE_HIGHLIGHT);
    ctx.strokeStyle = UI_BORDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(GAME_W + 16, 312);
    ctx.lineTo(GAME_W + 364, 312);
    ctx.stroke();

    if (this.leaderboardEntries.length === 0) {
      drawBlockText(ctx, "NO SCORES YET", GAME_W + 95, 410, 2, WHITE);
      drawBlockText(ctx, "PLAY TO SET RECORD!", GAME_W + 65, 435, 2, COIN_GOLD);
    } else {
      this.leaderboardEntries.slice(0, 7).forEach((entry, rankI) => {
        const ry = 318 + rankI * 38;
        ctx.fillStyle = UI_DARK;
        ctx.fillRect(GAME_W + 16, ry, 348, 34);

        drawBlockText(ctx, `#${rankI + 1}`, GAME_W + 22, ry + 10, 2, COIN_GOLD);

        // Avatar
        if (entry.photo_b64) {
          const img = new Image();
          img.src = entry.photo_b64;
          try {
            ctx.drawImage(img, GAME_W + 56, ry + 4, 34, 26);
          } catch (e) {
            ctx.fillStyle = MARIO_RED;
            ctx.fillRect(GAME_W + 56, ry + 4, 34, 26);
          }
        } else {
          ctx.fillStyle = MARIO_RED;
          ctx.fillRect(GAME_W + 56, ry + 4, 34, 26);
        }
        ctx.strokeStyle = UI_BORDER;
        ctx.lineWidth = 1;
        ctx.strokeRect(GAME_W + 56, ry + 4, 34, 26);

        drawBlockText(ctx, (entry.name || "PLAYER").slice(0, 9), GAME_W + 98, ry + 10, 2, WHITE);
        drawBlockText(ctx, String(entry.score).padStart(5, "0"), GAME_W + 278, ry + 10, 2, PIPE_HIGHLIGHT);
      });
    }
  }

  // Exact 8-bit Mario Sprite
  drawMarioSprite(ctx, sx, sy, facing, jumping, walkStep) {
    ctx.fillStyle = MARIO_RED;
    ctx.fillRect(sx + 4, sy, 18, 5);

    if (facing >= 0) {
      ctx.fillStyle = MARIO_RED; ctx.fillRect(sx + 2, sy + 4, 24, 4);
      ctx.fillStyle = MARIO_SKIN; ctx.fillRect(sx + 6, sy + 8, 18, 10);
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 3, sy + 8, 6, 8);
      ctx.fillStyle = BLACK; ctx.fillRect(sx + 18, sy + 10, 3, 4);
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 14, sy + 15, 11, 3);
    } else {
      ctx.fillStyle = MARIO_RED; ctx.fillRect(sx + 2, sy + 4, 24, 4);
      ctx.fillStyle = MARIO_SKIN; ctx.fillRect(sx + 4, sy + 8, 18, 10);
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 19, sy + 8, 6, 8);
      ctx.fillStyle = BLACK; ctx.fillRect(sx + 7, sy + 10, 3, 4);
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 3, sy + 15, 11, 3);
    }

    ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 2, sy + 18, 24, 14);
    ctx.fillStyle = MARIO_RED; ctx.fillRect(sx + 6, sy + 18, 16, 16);
    ctx.fillStyle = COIN_GOLD; ctx.fillRect(sx + 8, sy + 24, 3, 3);
    ctx.fillStyle = COIN_GOLD; ctx.fillRect(sx + 17, sy + 24, 3, 3);
    ctx.fillStyle = MARIO_SKIN; ctx.fillRect(sx, sy + 21, 4, 6);
    ctx.fillStyle = MARIO_SKIN; ctx.fillRect(sx + 24, sy + 21, 4, 6);

    if (jumping || Math.floor(walkStep / 5) % 2 === 1) {
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx, sy + 32, 11, 6);
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 15, sy + 30, 11, 6);
    } else {
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 2, sy + 32, 10, 6);
      ctx.fillStyle = MARIO_BROWN; ctx.fillRect(sx + 14, sy + 32, 10, 6);
    }
  }

  // Themed Goomba Sprite
  drawGoombaSprite(ctx, sx, sy, state, tick, levelNum) {
    let capColor = GOOMBA_BROWN;
    if (levelNum === 2) capColor = GOOMBA_BLUE;
    else if (levelNum === 4) capColor = GOOMBA_GRAY;

    if (state === "squished") {
      ctx.fillStyle = capColor; ctx.fillRect(sx + 2, sy + 20, 28, 8);
      ctx.fillStyle = GOOMBA_STEM; ctx.fillRect(sx + 8, sy + 28, 16, 4);
      return;
    }

    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.moveTo(sx + 16, sy);
    ctx.lineTo(sx + 31, sy + 14);
    ctx.lineTo(sx + 28, sy + 22);
    ctx.lineTo(sx + 4, sy + 22);
    ctx.lineTo(sx + 1, sy + 14);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = BLACK; ctx.fillRect(sx + 7, sy + 10, 4, 7);
    ctx.fillStyle = BLACK; ctx.fillRect(sx + 21, sy + 10, 4, 7);
    ctx.fillStyle = WHITE; ctx.fillRect(sx + 9, sy + 12, 2, 4);
    ctx.fillStyle = WHITE; ctx.fillRect(sx + 21, sy + 12, 2, 4);
    ctx.fillStyle = GOOMBA_STEM; ctx.fillRect(sx + 10, sy + 22, 12, 6);

    if (Math.floor(tick / 10) % 2 === 0) {
      ctx.fillStyle = BLACK; ctx.fillRect(sx + 3, sy + 26, 10, 6);
      ctx.fillStyle = BLACK; ctx.fillRect(sx + 19, sy + 28, 10, 4);
    } else {
      ctx.fillStyle = BLACK; ctx.fillRect(sx + 3, sy + 28, 10, 4);
      ctx.fillStyle = BLACK; ctx.fillRect(sx + 19, sy + 26, 10, 6);
    }
  }

  fillEllipse(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  strokeEllipse(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const game = new Game();
  game.start();
});

