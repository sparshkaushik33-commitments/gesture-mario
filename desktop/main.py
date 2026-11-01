import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sys
import threading
import time
import urllib.parse
import urllib.request
import cv2
import mediapipe as mp
import numpy as np
import pygame

# Initialize Pygame and stereo 16-bit audio mixer for procedural NES sound effects
pygame.mixer.pre_init(44100, -16, 2, 512)
pygame.init()
pygame.mixer.init()

# Asymmetric layout: 900x600 Gameplay on Left (70%), 380x600 Camera + Leaderboard on Right (30%)
WINDOW_W = 1280
WINDOW_H = 600
GAME_W = 900
SIDE_W = 380
GROUND_Y = 500
TARGET_FPS = 60

window = pygame.display.set_mode((WINDOW_W, WINDOW_H), pygame.DOUBLEBUF)
pygame.display.set_caption("Super Mario Arcade - 60FPS 4-World Client Edition")
clock = pygame.time.Clock()

# Security & Cloud Configuration
# Note: Client-side scoring cannot be trusted against a determined local attacker;
# this local HMAC secret only protects the local leaderboard file from casual edits,
# while the cloud Apps Script enforces server-side token authentication and sanity checks.
GOOGLE_SHEETS_WEBHOOK_URL = os.environ.get("MARIO_SHEETS_WEBHOOK_URL", "").strip()
GOOGLE_SHEETS_TOKEN = os.environ.get("MARIO_SHEETS_TOKEN", "").strip()
SECRET_FILE_PATH = ".mario_secret"
LEADERBOARD_FILE = "leaderboard_secure.json"
PENDING_SYNC_FILE = "pending_sync.json"
MAX_SCORE_PER_FRAME = 1500


# Load MARIO_HMAC_SECRET from environment or generate and persist a local 0600 secret file
def load_or_create_hmac_secret():
    env_secret = os.environ.get("MARIO_HMAC_SECRET", "").strip()
    if env_secret:
        return env_secret.encode("utf-8")
    if os.path.exists(SECRET_FILE_PATH):
        try:
            with open(SECRET_FILE_PATH, "r", encoding="utf-8") as f:
                saved = f.read().strip()
            if len(saved) >= 32:
                return saved.encode("utf-8")
        except Exception:
            pass
    generated = secrets.token_hex(32)
    try:
        fd = os.open(SECRET_FILE_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(generated)
        os.chmod(SECRET_FILE_PATH, 0o600)
    except Exception:
        pass
    return generated.encode("utf-8")


SESSION_SECRET_KEY = load_or_create_hmac_secret()

status_lock = threading.Lock()
pending_lock = threading.Lock()
cloud_sync_status = "CLOUD READY" if (GOOGLE_SHEETS_WEBHOOK_URL and GOOGLE_SHEETS_TOKEN) else "LOCAL ONLY"
sound_muted = False


def set_cloud_status(text):
    global cloud_sync_status
    with status_lock:
        cloud_sync_status = text


def get_cloud_status():
    with status_lock:
        return cloud_sync_status


# Flat NES color palette (strictly no purple, no gradients, no glow)
NES_SKY = (92, 148, 252)
UNDERGROUND_BG = (16, 20, 28)
ATHLETIC_SKY = (68, 124, 216)
CASTLE_BG = (18, 18, 18)

GROUND_RUST = (200, 76, 12)
GROUND_PEACH = (252, 188, 176)
BLUE_BRICK = (0, 120, 168)
BLUE_HIGHLIGHT = (92, 188, 236)
CASTLE_STONE = (140, 144, 150)
CASTLE_HIGHLIGHT = (200, 204, 210)
LAVA_RED = (216, 40, 0)
LAVA_GOLD = (252, 152, 56)

BRICK_RED = (184, 48, 0)
MORTAR_BLACK = (20, 16, 12)
Q_ORANGE = (252, 152, 56)
Q_USED_BROWN = (136, 70, 0)
PIPE_GREEN = (0, 168, 0)
PIPE_HIGHLIGHT = (128, 208, 16)
PIPE_SHADOW = (0, 88, 0)
HILL_GREEN = (0, 148, 0)
BUSH_LIME = (128, 208, 16)
CLOUD_WHITE = (252, 252, 252)
CLOUD_OUTLINE = (56, 104, 200)

MARIO_RED = (216, 40, 0)
MARIO_SKIN = (252, 152, 56)
MARIO_BROWN = (136, 112, 0)
GOOMBA_BROWN = (172, 80, 0)
GOOMBA_BLUE = (0, 120, 168)
GOOMBA_GRAY = (120, 120, 120)
GOOMBA_STEM = (252, 188, 176)
COIN_GOLD = (252, 216, 68)

UI_DARK = (24, 28, 34)
UI_CARD = (38, 44, 54)
UI_BORDER = (76, 86, 102)
UI_GREEN = (0, 168, 60)
UI_GOLD = (220, 150, 20)
WHITE = (250, 250, 250)
BLACK = (14, 14, 14)

# Authentic 5x7 8-bit arcade block font bitmap dictionary for all on-screen text
BLOCK_GLYPHS = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
    ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "/": ["00001", "00010", "00100", "00100", "01000", "10000", "00000"],
    "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
    ",": ["00000", "00000", "00000", "00000", "00110", "00010", "00100"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
}

block_text_cache = {}


# Render 100% authentic 8-bit Mario block text at any scale with pixel drop shadow
def draw_block_text(surface, text, x, y, scale=2, color=WHITE, shadow_color=BLACK):
    text_up = str(text).upper()
    cache_key = (text_up, scale, color, shadow_color)
    if cache_key not in block_text_cache:
        char_w = 6 * scale
        width = max(1, len(text_up) * char_w + scale)
        height = 7 * scale + scale
        txt_surf = pygame.Surface((width, height), pygame.SRCALPHA)
        for idx, ch in enumerate(text_up):
            pattern = BLOCK_GLYPHS.get(ch, BLOCK_GLYPHS[" "])
            ox = idx * char_w
            for row_i, row_str in enumerate(pattern):
                for col_i, bit in enumerate(row_str):
                    if bit == "1":
                        px = ox + col_i * scale
                        py = row_i * scale
                        if shadow_color is not None:
                            pygame.draw.rect(txt_surf, shadow_color, (px + scale, py + scale, scale, scale))
                        pygame.draw.rect(txt_surf, color, (px, py, scale, scale))
        block_text_cache[cache_key] = txt_surf
    surface.blit(block_text_cache[cache_key], (int(x), int(y)))


# Synthesize procedural NES 8-bit square-wave sound effects and background chiptune loop
def make_nes_sound(freq_start, freq_end, duration_sec, volume=0.24, steps=1):
    sample_rate = 44100
    total_samples = int(sample_rate * duration_sec)
    t = np.linspace(0, duration_sec, total_samples, endpoint=False)
    if steps > 1:
        freqs = np.linspace(freq_start, freq_end, steps)
        idx = np.minimum((t / duration_sec * steps).astype(int), steps - 1)
        inst_freq = freqs[idx]
    else:
        inst_freq = np.linspace(freq_start, freq_end, total_samples)
    phase = 2.0 * np.pi * np.cumsum(inst_freq) / sample_rate
    wave = np.where(np.sin(phase) >= 0, 1.0, -1.0)
    envelope = np.linspace(1.0, 0.15, total_samples)
    pcm = (wave * envelope * volume * 32767).astype(np.int16)
    return pygame.sndarray.make_sound(np.column_stack((pcm, pcm)))


def make_nes_melody_loop():
    sample_rate = 44100
    notes = [
        (659, 0.14), (659, 0.14), (0, 0.14), (659, 0.14),
        (0, 0.14), (523, 0.14), (659, 0.28), (784, 0.28),
        (0, 0.28), (392, 0.28), (0, 0.28),
        (523, 0.21), (0, 0.07), (392, 0.21), (0, 0.07), (330, 0.28),
        (440, 0.21), (494, 0.21), (466, 0.14), (440, 0.28)
    ]
    segments = []
    for freq, dur in notes:
        n_samp = int(sample_rate * dur)
        if freq == 0:
            segments.append(np.zeros(n_samp, dtype=np.int16))
        else:
            t = np.linspace(0, dur, n_samp, endpoint=False)
            sq = np.where(np.sin(2.0 * np.pi * freq * t) >= 0, 1.0, -1.0)
            env = np.linspace(1.0, 0.3, n_samp)
            segments.append((sq * env * 0.07 * 32767).astype(np.int16))
    full_pcm = np.concatenate(segments)
    return pygame.sndarray.make_sound(np.column_stack((full_pcm, full_pcm)))


SFX_JUMP = make_nes_sound(180, 540, 0.15, volume=0.22)
SFX_COIN = make_nes_sound(988, 1319, 0.18, volume=0.22, steps=2)
SFX_STOMP = make_nes_sound(420, 140, 0.12, volume=0.25)
SFX_SPRING = make_nes_sound(220, 880, 0.24, volume=0.25, steps=4)
SFX_HURT = make_nes_sound(500, 110, 0.35, volume=0.25, steps=5)
SFX_CLEAR = make_nes_sound(440, 880, 0.45, volume=0.26, steps=6)
SFX_SNAP = make_nes_sound(800, 1200, 0.10, volume=0.22, steps=2)
BGM_LOOP = make_nes_melody_loop()
BGM_LOOP.play(loops=-1)


def play_sfx(sound_obj):
    if not sound_muted:
        sound_obj.play()


# Rotation-invariant 2D Euclidean distance hand analyzer
def landmark_dist(lm_a, lm_b):
    return math.hypot(lm_a.x - lm_b.x, lm_a.y - lm_b.y)


def analyze_hand(hand_landmarks):
    lm = hand_landmarks.landmark
    wrist = lm[0]
    specs = [("INDEX", 8, 6, 5), ("MIDDLE", 12, 10, 9), ("RING", 16, 14, 13), ("PINKY", 20, 18, 17)]
    states = {}
    for name, tip_i, pip_i, mcp_i in specs:
        tip_d = landmark_dist(lm[tip_i], wrist)
        pip_d = landmark_dist(lm[pip_i], wrist)
        mcp_d = landmark_dist(lm[mcp_i], wrist)
        states[name] = (tip_d > pip_d * 1.07) and (tip_d > mcp_d * 1.14)

    palm_w = max(0.05, landmark_dist(lm[5], lm[17]))
    states["THUMB"] = (
        landmark_dist(lm[4], lm[17]) > palm_w * 1.22
        and landmark_dist(lm[4], lm[5]) > palm_w * 0.52
    )

    up_count = sum(1 for v in states.values() if v)
    idx, mid, rng, pnk, thb = states["INDEX"], states["MIDDLE"], states["RING"], states["PINKY"], states["THUMB"]

    if up_count >= 4 or (idx and mid and rng and pnk):
        return "RUN RIGHT", states, up_count
    if (idx and mid and rng and not pnk) or (thb and idx and mid and not rng and not pnk):
        return "JUMP + RIGHT", states, up_count
    if idx and mid and not rng and not pnk:
        return "RUN LEFT", states, up_count
    if (idx and not mid and not rng and not pnk) or (thb and not mid and not rng and not pnk):
        return "JUMP", states, up_count
    return "STOP", states, up_count


# Background Camera + MediaPipe Worker Thread so the game loop runs at a locked 60 FPS
cam_lock = threading.Lock()
shared_cam_index = 0
shared_switch_requested = False
shared_running = True
shared_hand_detected = False
shared_ai_gesture = "STOP"
shared_finger_states = {"THUMB": False, "INDEX": False, "MIDDLE": False, "RING": False, "PINKY": False}
shared_cam_rgb_bytes = None
shared_clean_bgr = None
shared_cam_error = ""


def open_camera(cam_idx):
    if sys.platform == "win32" and hasattr(cv2, "CAP_DSHOW"):
        cam = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
    elif sys.platform == "darwin" and hasattr(cv2, "CAP_AVFOUNDATION"):
        cam = cv2.VideoCapture(cam_idx, cv2.CAP_AVFOUNDATION)
    else:
        cam = cv2.VideoCapture(cam_idx)

    if not cam.isOpened():
        cam = cv2.VideoCapture(cam_idx)
    cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    for _ in range(4):
        cam.read()
    return cam


def camera_worker_loop():
    global shared_cam_index, shared_switch_requested
    global shared_hand_detected, shared_ai_gesture, shared_finger_states
    global shared_cam_rgb_bytes, shared_clean_bgr, shared_cam_error

    cam = None
    try:
        try:
            mp_hands_mod = mp.solutions.hands
            mp_draw_mod = mp.solutions.drawing_utils
        except AttributeError:
            from mediapipe.python.solutions import hands as mp_hands_mod
            from mediapipe.python.solutions import drawing_utils as mp_draw_mod

        tracker = mp_hands_mod.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=0,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        cam = open_camera(shared_cam_index)
        ok_init, _ = cam.read()
        if not ok_init:
            cam.release()
            shared_cam_index = 1
            cam = open_camera(shared_cam_index)

        history = []
        while shared_running:
            if shared_switch_requested:
                cam.release()
                shared_cam_index = (shared_cam_index + 1) % 3
                cam = open_camera(shared_cam_index)
                shared_switch_requested = False

            ok, frame = cam.read()
            if ok and frame is not None and frame.size > 0:
                frame = cv2.flip(frame, 1)
                clean_copy = frame.copy()
                small_rgb = cv2.cvtColor(cv2.resize(frame, (320, 240)), cv2.COLOR_BGR2RGB)
                results = tracker.process(small_rgb)

                raw_g = "STOP"
                f_states = {"THUMB": False, "INDEX": False, "MIDDLE": False, "RING": False, "PINKY": False}
                detected = False

                if results.multi_hand_landmarks:
                    detected = True
                    hand_lm = results.multi_hand_landmarks[0]
                    mp_draw_mod.draw_landmarks(frame, hand_lm, mp_hands_mod.HAND_CONNECTIONS)
                    raw_g, f_states, _ = analyze_hand(hand_lm)

                history.append(raw_g)
                if len(history) > 3:
                    history.pop(0)
                smoothed_g = max(set(history), key=history.count)

                preview_rgb = cv2.cvtColor(cv2.resize(frame, (360, 210)), cv2.COLOR_BGR2RGB)
                raw_bytes = preview_rgb.tobytes()

                with cam_lock:
                    shared_hand_detected = detected
                    shared_ai_gesture = smoothed_g
                    shared_finger_states = f_states
                    shared_cam_rgb_bytes = raw_bytes
                    shared_clean_bgr = clean_copy
                    shared_cam_error = ""
            else:
                with cam_lock:
                    shared_cam_rgb_bytes = None
                    shared_cam_error = "CAMERA ERROR, USING KEYBOARD"
                time.sleep(0.05)
    except Exception as exc:
        err_msg = str(exc).upper()[:28] if str(exc) else "MEDIAPIPE INIT FAILED"
        with cam_lock:
            shared_cam_rgb_bytes = None
            shared_hand_detected = False
            shared_ai_gesture = "STOP"
            shared_cam_error = err_msg
    finally:
        if cam is not None:
            try:
                cam.release()
            except Exception:
                pass


cam_thread = threading.Thread(target=camera_worker_loop, daemon=True)
cam_thread.start()


# Security & Anti-Cheat Functions: Input Sanitization, SSRF Guard, Local HMAC Signing, Retry Queue
def sanitize_player_name(raw_name):
    cleaned = re.sub(r"[^A-Z0-9 _-]", "", str(raw_name).upper()).strip()
    cleaned = cleaned.lstrip("-_ ")
    return cleaned[:10] if cleaned else "PLAYER1"


def compute_record_hmac(name, score_val, coins_val, level_val, timestamp_str):
    payload = f"{name}|{int(score_val)}|{int(coins_val)}|{int(level_val)}|{timestamp_str}".encode("utf-8")
    return hmac.new(SESSION_SECRET_KEY, payload, hashlib.sha256).hexdigest()


def decode_avatar_surface(b64_png_str):
    try:
        if not b64_png_str or len(b64_png_str) > 32000:
            return None
        raw_bytes = base64.b64decode(b64_png_str.encode("ascii"))
        arr = np.frombuffer(raw_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            return None
        bgr = cv2.resize(bgr, (34, 26))
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        return pygame.image.frombuffer(rgb.tobytes(), (34, 26), "RGB")
    except Exception:
        return None


def load_secure_leaderboard():
    if not os.path.exists(LEADERBOARD_FILE):
        return []
    try:
        with open(LEADERBOARD_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            return []
    except Exception:
        return []

    valid_entries = []
    for item in data:
        try:
            if not isinstance(item, dict):
                continue
            name = sanitize_player_name(item.get("name", "PLAYER1"))
            sc = int(item.get("score", 0))
            cn = int(item.get("coins", 0))
            lv = int(item.get("level", 1))
            ts = str(item.get("timestamp", ""))
            sig = str(item.get("signature", ""))
            expected = compute_record_hmac(name, sc, cn, lv, ts)
            if hmac.compare_digest(sig, expected) and 0 <= sc <= 999999 and 0 <= cn <= 9999 and 1 <= lv <= 4:
                surf = decode_avatar_surface(str(item.get("photo_b64", "")))
                valid_entries.append({
                    "name": name,
                    "score": sc,
                    "coins": cn,
                    "level": lv,
                    "timestamp": ts,
                    "photo_b64": str(item.get("photo_b64", "")),
                    "signature": sig,
                    "avatar_surf": surf
                })
        except Exception:
            continue

    valid_entries.sort(key=lambda x: x["score"], reverse=True)
    return valid_entries[:7]


def is_trusted_google_webhook(url_str):
    try:
        parsed = urllib.parse.urlparse(url_str)
        return parsed.scheme == "https" and parsed.netloc in ("script.google.com", "script.googleusercontent.com")
    except Exception:
        return False


def append_pending_sync(entry_record):
    with pending_lock:
        queue = []
        if os.path.exists(PENDING_SYNC_FILE):
            try:
                with open(PENDING_SYNC_FILE, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, list):
                    queue = [x for x in loaded if isinstance(x, dict)]
            except Exception:
                queue = []
        queue.append(entry_record)
        queue = queue[-50:]
        try:
            tmp_path = PENDING_SYNC_FILE + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(queue, f, indent=2)
            os.replace(tmp_path, PENDING_SYNC_FILE)
        except Exception:
            pass


def post_cloud_entry_with_retry(entry_record):
    if not GOOGLE_SHEETS_WEBHOOK_URL or not GOOGLE_SHEETS_TOKEN:
        set_cloud_status("LOCAL ONLY")
        return False
    if not is_trusted_google_webhook(GOOGLE_SHEETS_WEBHOOK_URL):
        set_cloud_status("UNTRUSTED URL")
        return False

    payload = {
        "token": GOOGLE_SHEETS_TOKEN,
        "name": entry_record["name"],
        "score": int(entry_record["score"]),
        "coins": int(entry_record["coins"]),
        "level": int(entry_record["level"]),
        "timestamp": entry_record["timestamp"]
    }
    photo_str = entry_record.get("photo_b64", "")
    if isinstance(photo_str, str) and 0 < len(photo_str) <= 4096:
        payload["photo_b64"] = photo_str

    body = json.dumps(payload).encode("utf-8")
    backoffs = [1.0, 2.0, 4.0]

    for attempt in range(3):
        set_cloud_status(f"SYNCING {attempt + 1}/3")
        try:
            req = urllib.request.Request(
                GOOGLE_SHEETS_WEBHOOK_URL,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                resp_text = resp.read().decode("utf-8", errors="replace")
                if 200 <= resp.status < 300:
                    resp_obj = json.loads(resp_text)
                    if isinstance(resp_obj, dict) and resp_obj.get("status") == "OK":
                        set_cloud_status("CLOUD SYNCED")
                        return True
        except Exception:
            pass
        if attempt < 2:
            time.sleep(backoffs[attempt])

    return False


def sync_entry_worker(entry_record):
    if not GOOGLE_SHEETS_WEBHOOK_URL or not GOOGLE_SHEETS_TOKEN:
        set_cloud_status("LOCAL ONLY")
        return
    if not post_cloud_entry_with_retry(entry_record):
        append_pending_sync(entry_record)
        set_cloud_status("QUEUED RETRY")


def flush_pending_sync_worker():
    if not GOOGLE_SHEETS_WEBHOOK_URL or not GOOGLE_SHEETS_TOKEN:
        return
    with pending_lock:
        if not os.path.exists(PENDING_SYNC_FILE):
            return
        try:
            with open(PENDING_SYNC_FILE, "r", encoding="utf-8") as f:
                pending_list = json.load(f)
            if not isinstance(pending_list, list) or not pending_list:
                return
        except Exception:
            return

    remaining = []
    for item in pending_list:
        if not isinstance(item, dict):
            continue
        if not post_cloud_entry_with_retry(item):
            remaining.append(item)

    with pending_lock:
        try:
            if remaining:
                tmp_path = PENDING_SYNC_FILE + ".tmp"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(remaining, f, indent=2)
                os.replace(tmp_path, PENDING_SYNC_FILE)
                set_cloud_status("QUEUED RETRY")
            else:
                if os.path.exists(PENDING_SYNC_FILE):
                    os.remove(PENDING_SYNC_FILE)
                set_cloud_status("CLOUD SYNCED")
        except Exception:
            pass


def record_verified_score(name, sc, cn, lv, photo_b64_str, surf_thumb, allow_cloud_photo):
    global leaderboard_entries
    safe_name = sanitize_player_name(name)
    safe_score = max(0, min(999999, int(sc)))
    safe_coins = max(0, min(9999, int(cn)))
    safe_level = max(1, min(4, int(lv)))
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sig = compute_record_hmac(safe_name, safe_score, safe_coins, safe_level, ts)

    new_entry = {
        "name": safe_name,
        "score": safe_score,
        "coins": safe_coins,
        "level": safe_level,
        "timestamp": ts,
        "photo_b64": photo_b64_str,
        "signature": sig,
        "avatar_surf": surf_thumb
    }
    leaderboard_entries.append(new_entry)
    leaderboard_entries.sort(key=lambda x: x["score"], reverse=True)
    leaderboard_entries = leaderboard_entries[:7]

    serializable = [
        {k: v for k, v in e.items() if k != "avatar_surf"}
        for e in leaderboard_entries
    ]
    try:
        tmp_path = LEADERBOARD_FILE + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=2)
        os.replace(tmp_path, LEADERBOARD_FILE)
    except Exception:
        pass

    cloud_record = {
        "name": safe_name,
        "score": safe_score,
        "coins": safe_coins,
        "level": safe_level,
        "timestamp": ts
    }
    if allow_cloud_photo and photo_b64_str and len(photo_b64_str) <= 4096:
        cloud_record["photo_b64"] = photo_b64_str

    threading.Thread(target=sync_entry_worker, args=(cloud_record,), daemon=True).start()


leaderboard_entries = load_secure_leaderboard()
threading.Thread(target=flush_pending_sync_worker, daemon=True).start()

# Anti-Cheat In-Memory Score Vault (XOR masked + per-frame HMAC verification)
SESSION_XOR_MASK = secrets.randbits(32)
vault_masked_score = 0 ^ SESSION_XOR_MASK
vault_masked_coins = 0 ^ SESSION_XOR_MASK
vault_nonce = 0


def compute_vault_mac(sc, cn, nonce):
    msg = f"{sc}|{cn}|{nonce}".encode("utf-8")
    return hmac.new(SESSION_SECRET_KEY, msg, hashlib.sha256).digest()


vault_mac = compute_vault_mac(0, 0, 0)


def get_protected_stats():
    global vault_masked_score, vault_masked_coins, vault_nonce, vault_mac
    sc = vault_masked_score ^ SESSION_XOR_MASK
    cn = vault_masked_coins ^ SESSION_XOR_MASK
    if not hmac.compare_digest(vault_mac, compute_vault_mac(sc, cn, vault_nonce)):
        vault_nonce += 1
        vault_masked_score = 0 ^ SESSION_XOR_MASK
        vault_masked_coins = 0 ^ SESSION_XOR_MASK
        vault_mac = compute_vault_mac(0, 0, vault_nonce)
        return 0, 0
    return sc, cn


def add_protected_points(delta_score, delta_coins=0):
    global vault_masked_score, vault_masked_coins, vault_nonce, vault_mac
    if delta_score < 0 or delta_score > MAX_SCORE_PER_FRAME:
        return
    sc, cn = get_protected_stats()
    sc += int(delta_score)
    cn += int(delta_coins)
    vault_nonce += 1
    vault_masked_score = sc ^ SESSION_XOR_MASK
    vault_masked_coins = cn ^ SESSION_XOR_MASK
    vault_mac = compute_vault_mac(sc, cn, vault_nonce)


def reset_protected_stats():
    global vault_masked_score, vault_masked_coins, vault_nonce, vault_mac
    vault_nonce += 1
    vault_masked_score = 0 ^ SESSION_XOR_MASK
    vault_masked_coins = 0 ^ SESSION_XOR_MASK
    vault_mac = compute_vault_mac(0, 0, vault_nonce)


# 4 Full Levels + Moving Platforms + Springboards + Checkpoints + Sub-Pixel 60FPS Physics
TOTAL_LEVELS = 4
current_level = 1
LEVEL_END_X = 3600
checkpoint_x = 1750
checkpoint_reached = False

ground_sections = []
pipes = []
bricks = []
q_blocks = []
moving_platforms = []
springs = []
stairs = []
coins = []
goombas = []
floating_popups = []
hills = []
bushes = []
clouds = []

mario = pygame.Rect(80, GROUND_Y - 38, 24, 38)
mario_fx = 80.0
mario_fy = float(GROUND_Y - 38)
mario_vx = 0.0
mario_vy = 0.0
mario_facing = 1
on_ground = True
coyote_frames = 0
jump_buffer_frames = 0
invincible_frames = 0
camera_fx = 0.0
camera_x = 0
lives = 3
world_timer = 400.0
banner_frames = 0
banner_text = ""

game_mode = "REGISTER"
player_name_input = ""
captured_photo_b64 = ""
captured_avatar_surf = None
captured_preview_surf = None
cloud_photo_consent = False


# Build 4 Huge, 100% Reachable Worlds:
# Level 1 (1-1 Overworld), Level 2 (1-2 Underground), Level 3 (1-3 Sky Bridge), Level 4 (1-4 Castle)
def build_level(level_num, respawn_at_checkpoint=False):
    global current_level, LEVEL_END_X, checkpoint_x, checkpoint_reached
    global ground_sections, pipes, bricks, q_blocks, moving_platforms, springs
    global stairs, coins, goombas, floating_popups, hills, bushes, clouds
    global mario_fx, mario_fy, mario_vx, mario_vy, on_ground
    global coyote_frames, jump_buffer_frames, camera_fx, camera_x, world_timer

    current_level = level_num
    if not respawn_at_checkpoint:
        checkpoint_reached = False

    tier1_y = GROUND_Y - 96    # 96px above ground (Mario jumps 130px high)
    tier2_y = GROUND_Y - 180   # 84px above Tier 1
    tier3_y = GROUND_Y - 260   # 80px above Tier 2

    if level_num == 1:
        # WORLD 1-1: Classic Overworld (3600px long)
        LEVEL_END_X = 3600
        checkpoint_x = 1820
        ground_sections = [
            pygame.Rect(0, GROUND_Y, 1320, 100),
            pygame.Rect(1388, GROUND_Y, 1080, 100),
            pygame.Rect(2536, GROUND_Y, 1250, 100)
        ]
        pipes = [
            pygame.Rect(460, GROUND_Y - 56, 56, 56),
            pygame.Rect(760, GROUND_Y - 72, 56, 72),
            pygame.Rect(1080, GROUND_Y - 84, 56, 84),
            pygame.Rect(1980, GROUND_Y - 64, 56, 64),
            pygame.Rect(2760, GROUND_Y - 72, 56, 72)
        ]
        brick_coords = [
            (260, tier1_y), (324, tier1_y), (388, tier1_y),
            (880, tier1_y), (912, tier1_y), (944, tier1_y),
            (1520, tier1_y), (1584, tier1_y), (1616, tier1_y),
            (1648, tier2_y), (1680, tier2_y), (1712, tier2_y),
            (2140, tier1_y), (2204, tier1_y), (2268, tier1_y),
            (2204, tier2_y), (2236, tier2_y),
            (2920, tier1_y), (2984, tier1_y), (3016, tier1_y)
        ]
        q_coords = [
            (196, tier1_y), (292, tier1_y), (356, tier1_y), (324, tier2_y),
            (912, tier2_y), (1552, tier1_y), (1680, tier1_y),
            (2172, tier1_y), (2236, tier1_y), (2952, tier1_y), (2984, tier2_y)
        ]
        moving_platforms = [
            {"rect": pygame.Rect(1328, GROUND_Y - 40, 56, 16), "vx": 0.0, "vy": -1.2, "min_x": 1328, "max_x": 1328, "min_y": GROUND_Y - 120, "max_y": GROUND_Y - 24},
            {"rect": pygame.Rect(2472, GROUND_Y - 48, 56, 16), "vx": 1.4, "vy": 0.0, "min_x": 2448, "max_x": 2520, "min_y": GROUND_Y - 48, "max_y": GROUND_Y - 48}
        ]
        springs = [
            pygame.Rect(1220, GROUND_Y - 28, 28, 28),
            pygame.Rect(2660, GROUND_Y - 28, 28, 28)
        ]
        stairs = [pygame.Rect(3180 + s * 32, GROUND_Y - (s + 1) * 28, 32, (s + 1) * 28) for s in range(6)]
        coin_coords = [
            (203, tier1_y - 40), (299, tier1_y - 40), (363, tier1_y - 40), (331, tier2_y - 40),
            (480, GROUND_Y - 96), (780, GROUND_Y - 112), (919, tier2_y - 40),
            (1225, tier2_y - 30), (1655, tier2_y - 40), (1687, tier2_y - 40), (1719, tier2_y - 40),
            (2000, GROUND_Y - 104), (2211, tier2_y - 40), (2243, tier2_y - 40),
            (2780, GROUND_Y - 112), (2959, tier1_y - 40), (2991, tier2_y - 40)
        ]
        goombas = [
            {"rect": pygame.Rect(400, GROUND_Y - 32, 32, 32), "vx": -1.2, "min_x": 180, "max_x": 445, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(680, GROUND_Y - 32, 32, 32), "vx": -1.2, "min_x": 530, "max_x": 745, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(990, GROUND_Y - 32, 32, 32), "vx": -1.2, "min_x": 830, "max_x": 1065, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(1760, GROUND_Y - 32, 32, 32), "vx": -1.3, "min_x": 1440, "max_x": 1950, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(2320, GROUND_Y - 32, 32, 32), "vx": -1.3, "min_x": 2050, "max_x": 2440, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(3060, GROUND_Y - 32, 32, 32), "vx": -1.4, "min_x": 2830, "max_x": 3150, "state": "walk", "timer": 0}
        ]
        hills = [(40, 160, 80), (580, 110, 56), (1160, 160, 80), (1780, 120, 60), (2340, 150, 75), (2980, 140, 70)]
        bushes = [(220, 96), (660, 72), (1260, 96), (1860, 72), (2240, 96), (2860, 84)]
        clouds = [(100, 70, 96), (380, 52, 72), (720, 78, 112), (1120, 58, 88), (1560, 70, 96), (2040, 56, 84), (2500, 68, 96), (3050, 58, 92)]

    elif level_num == 2:
        # WORLD 1-2: Underground Blue-Brick Caverns with Elevator Lifts (3700px long)
        LEVEL_END_X = 3700
        checkpoint_x = 1860
        ground_sections = [
            pygame.Rect(0, GROUND_Y, 1180, 100),
            pygame.Rect(1260, GROUND_Y, 1060, 100),
            pygame.Rect(2400, GROUND_Y, 1450, 100)
        ]
        pipes = [
            pygame.Rect(520, GROUND_Y - 64, 56, 64),
            pygame.Rect(980, GROUND_Y - 80, 56, 80),
            pygame.Rect(1680, GROUND_Y - 72, 56, 72),
            pygame.Rect(2620, GROUND_Y - 64, 56, 64)
        ]
        brick_coords = [
            (240, tier1_y), (272, tier1_y), (304, tier1_y),
            (368, tier2_y), (400, tier2_y), (432, tier2_y),
            (700, tier1_y), (732, tier1_y), (764, tier1_y),
            (1360, tier1_y), (1392, tier1_y), (1424, tier1_y),
            (1456, tier2_y), (1488, tier2_y), (1520, tier2_y),
            (1920, tier1_y), (1952, tier1_y), (1984, tier1_y),
            (2016, tier2_y), (2048, tier2_y),
            (2780, tier1_y), (2812, tier1_y), (2876, tier1_y), (2908, tier2_y)
        ]
        q_coords = [
            (208, tier1_y), (336, tier1_y), (400, tier1_y),
            (732, tier2_y), (1392, tier2_y), (1952, tier2_y),
            (2480, tier1_y), (2844, tier1_y), (2876, tier2_y)
        ]
        moving_platforms = [
            {"rect": pygame.Rect(1188, GROUND_Y - 60, 64, 16), "vx": 0.0, "vy": -1.4, "min_x": 1188, "max_x": 1188, "min_y": tier2_y, "max_y": GROUND_Y - 20},
            {"rect": pygame.Rect(2328, GROUND_Y - 70, 64, 16), "vx": 0.0, "vy": 1.4, "min_x": 2328, "max_x": 2328, "min_y": tier2_y, "max_y": GROUND_Y - 20}
        ]
        springs = [
            pygame.Rect(880, GROUND_Y - 28, 28, 28),
            pygame.Rect(2160, GROUND_Y - 28, 28, 28)
        ]
        stairs = [pygame.Rect(3260 + s * 32, GROUND_Y - (s + 1) * 28, 32, (s + 1) * 28) for s in range(6)]
        coin_coords = [
            (248, tier1_y - 40), (280, tier1_y - 40), (376, tier2_y - 40), (408, tier2_y - 40),
            (540, GROUND_Y - 104), (739, tier2_y - 40), (1000, GROUND_Y - 118),
            (1464, tier2_y - 40), (1496, tier2_y - 40), (1528, tier2_y - 40),
            (1700, GROUND_Y - 110), (1959, tier2_y - 40), (2024, tier2_y - 40),
            (2640, GROUND_Y - 104), (2851, tier1_y - 40), (2883, tier2_y - 40)
        ]
        goombas = [
            {"rect": pygame.Rect(430, GROUND_Y - 32, 32, 32), "vx": -1.3, "min_x": 180, "max_x": 500, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(820, GROUND_Y - 32, 32, 32), "vx": -1.3, "min_x": 590, "max_x": 960, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(1560, GROUND_Y - 32, 32, 32), "vx": -1.4, "min_x": 1280, "max_x": 1660, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(2040, GROUND_Y - 32, 32, 32), "vx": -1.4, "min_x": 1750, "max_x": 2280, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(3020, GROUND_Y - 32, 32, 32), "vx": -1.5, "min_x": 2700, "max_x": 3220, "state": "walk", "timer": 0}
        ]
        hills = []
        bushes = []
        clouds = []

    elif level_num == 3:
        # WORLD 1-3: Athletic Sky Treetops with Moving Cloud Bridges & Springs (3700px long)
        LEVEL_END_X = 3700
        checkpoint_x = 1820
        ground_sections = [
            pygame.Rect(0, GROUND_Y, 920, 100),
            pygame.Rect(1020, GROUND_Y, 740, 100),
            pygame.Rect(1860, GROUND_Y, 760, 100),
            pygame.Rect(2720, GROUND_Y, 1150, 100)
        ]
        pipes = [
            pygame.Rect(440, GROUND_Y - 64, 56, 64),
            pygame.Rect(1420, GROUND_Y - 72, 56, 72),
            pygame.Rect(2280, GROUND_Y - 64, 56, 64)
        ]
        brick_coords = [
            (220, tier1_y), (252, tier1_y), (284, tier1_y),
            (580, tier2_y), (612, tier2_y), (644, tier2_y), (676, tier2_y),
            (1160, tier1_y), (1192, tier1_y), (1224, tier1_y),
            (1256, tier2_y), (1288, tier2_y), (1320, tier2_y),
            (1980, tier1_y), (2012, tier1_y), (2044, tier1_y),
            (2076, tier2_y), (2108, tier2_y), (2140, tier3_y), (2172, tier3_y),
            (2880, tier1_y), (2912, tier1_y), (2944, tier2_y), (2976, tier2_y)
        ]
        q_coords = [
            (252, tier2_y), (612, tier1_y), (1192, tier2_y),
            (1600, tier1_y), (2012, tier2_y), (2140, tier2_y),
            (2912, tier2_y), (3040, tier1_y)
        ]
        moving_platforms = [
            {"rect": pygame.Rect(928, GROUND_Y - 44, 84, 16), "vx": 1.3, "vy": 0.0, "min_x": 916, "max_x": 1016, "min_y": GROUND_Y - 44, "max_y": GROUND_Y - 44},
            {"rect": pygame.Rect(1768, GROUND_Y - 52, 84, 16), "vx": 1.5, "vy": 0.0, "min_x": 1756, "max_x": 1856, "min_y": GROUND_Y - 52, "max_y": GROUND_Y - 52},
            {"rect": pygame.Rect(2628, GROUND_Y - 60, 84, 16), "vx": 0.0, "vy": -1.5, "min_x": 2628, "max_x": 2628, "min_y": tier2_y, "max_y": GROUND_Y - 24}
        ]
        springs = [
            pygame.Rect(520, GROUND_Y - 28, 28, 28),
            pygame.Rect(1520, GROUND_Y - 28, 28, 28),
            pygame.Rect(2420, GROUND_Y - 28, 28, 28)
        ]
        stairs = [pygame.Rect(3260 + s * 32, GROUND_Y - (s + 1) * 28, 32, (s + 1) * 28) for s in range(6)]
        coin_coords = [
            (259, tier2_y - 40), (588, tier2_y - 40), (620, tier2_y - 40), (652, tier2_y - 40),
            (955, GROUND_Y - 90), (1264, tier2_y - 40), (1296, tier2_y - 40),
            (1795, GROUND_Y - 96), (2148, tier3_y - 40), (2180, tier3_y - 40),
            (2655, tier2_y - 40), (2952, tier2_y - 40), (2984, tier2_y - 40)
        ]
        goombas = [
            {"rect": pygame.Rect(360, GROUND_Y - 32, 32, 32), "vx": -1.3, "min_x": 160, "max_x": 420, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(780, GROUND_Y - 32, 32, 32), "vx": -1.4, "min_x": 560, "max_x": 890, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(1320, GROUND_Y - 32, 32, 32), "vx": -1.4, "min_x": 1060, "max_x": 1400, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(2160, GROUND_Y - 32, 32, 32), "vx": -1.5, "min_x": 1900, "max_x": 2260, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(3100, GROUND_Y - 32, 32, 32), "vx": -1.5, "min_x": 2760, "max_x": 3220, "state": "walk", "timer": 0}
        ]
        hills = [(60, 140, 70), (1100, 150, 75), (1950, 140, 70), (2820, 150, 75)]
        bushes = [(280, 96), (1240, 84), (2080, 96), (2960, 84)]
        clouds = [(80, 60, 110), (320, 48, 88), (620, 64, 112), (960, 50, 96), (1340, 62, 108), (1720, 48, 92), (2120, 60, 110), (2560, 52, 96), (3020, 60, 108)]

    else:
        # WORLD 1-4: Bowser's Stone Fortress with Lava Pits & Moving Bridges (3800px long)
        LEVEL_END_X = 3800
        checkpoint_x = 1880
        ground_sections = [
            pygame.Rect(0, GROUND_Y, 1040, 100),
            pygame.Rect(1140, GROUND_Y, 820, 100),
            pygame.Rect(2060, GROUND_Y, 820, 100),
            pygame.Rect(2980, GROUND_Y, 1000, 100)
        ]
        pipes = [
            pygame.Rect(500, GROUND_Y - 64, 56, 64),
            pygame.Rect(1540, GROUND_Y - 72, 56, 72),
            pygame.Rect(2520, GROUND_Y - 64, 56, 64)
        ]
        brick_coords = [
            (240, tier1_y), (272, tier1_y), (304, tier1_y), (336, tier1_y),
            (660, tier1_y), (692, tier1_y), (724, tier2_y), (756, tier2_y),
            (1260, tier1_y), (1292, tier1_y), (1324, tier2_y), (1356, tier2_y),
            (1680, tier1_y), (1712, tier1_y), (1744, tier1_y),
            (2200, tier1_y), (2232, tier1_y), (2264, tier2_y), (2296, tier2_y),
            (2660, tier1_y), (2692, tier1_y), (2724, tier2_y),
            (3100, tier1_y), (3132, tier1_y), (3164, tier2_y)
        ]
        q_coords = [
            (272, tier2_y), (692, tier2_y), (1292, tier2_y),
            (1712, tier2_y), (2232, tier2_y), (2692, tier2_y), (3132, tier2_y)
        ]
        moving_platforms = [
            {"rect": pygame.Rect(1048, GROUND_Y - 40, 84, 16), "vx": 1.4, "vy": 0.0, "min_x": 1036, "max_x": 1136, "min_y": GROUND_Y - 40, "max_y": GROUND_Y - 40},
            {"rect": pygame.Rect(1968, GROUND_Y - 48, 84, 16), "vx": 1.5, "vy": 0.0, "min_x": 1956, "max_x": 2056, "min_y": GROUND_Y - 48, "max_y": GROUND_Y - 48},
            {"rect": pygame.Rect(2888, GROUND_Y - 48, 84, 16), "vx": 1.6, "vy": 0.0, "min_x": 2876, "max_x": 2976, "min_y": GROUND_Y - 48, "max_y": GROUND_Y - 48}
        ]
        springs = [
            pygame.Rect(860, GROUND_Y - 28, 28, 28),
            pygame.Rect(1820, GROUND_Y - 28, 28, 28),
            pygame.Rect(2780, GROUND_Y - 28, 28, 28)
        ]
        stairs = [pygame.Rect(3340 + s * 32, GROUND_Y - (s + 1) * 28, 32, (s + 1) * 28) for s in range(6)]
        coin_coords = [
            (280, tier2_y - 40), (732, tier2_y - 40), (764, tier2_y - 40),
            (1075, GROUND_Y - 90), (1332, tier2_y - 40), (1364, tier2_y - 40),
            (1995, GROUND_Y - 96), (2272, tier2_y - 40), (2304, tier2_y - 40),
            (2915, GROUND_Y - 96), (3172, tier2_y - 40)
        ]
        goombas = [
            {"rect": pygame.Rect(420, GROUND_Y - 32, 32, 32), "vx": -1.4, "min_x": 160, "max_x": 480, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(800, GROUND_Y - 32, 32, 32), "vx": -1.5, "min_x": 570, "max_x": 980, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(1460, GROUND_Y - 32, 32, 32), "vx": -1.5, "min_x": 1180, "max_x": 1520, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(2420, GROUND_Y - 32, 32, 32), "vx": -1.6, "min_x": 2100, "max_x": 2500, "state": "walk", "timer": 0},
            {"rect": pygame.Rect(3220, GROUND_Y - 32, 32, 32), "vx": -1.6, "min_x": 3010, "max_x": 3310, "state": "walk", "timer": 0}
        ]
        hills = []
        bushes = []
        clouds = []

    bricks = [pygame.Rect(x, y, 32, 32) for x, y in brick_coords]
    q_blocks = [{"rect": pygame.Rect(x, y, 32, 32), "used": False, "bounce": 0} for x, y in q_coords]
    coins = [pygame.Rect(x, y, 18, 24) for x, y in coin_coords]

    spawn_x = checkpoint_x if (respawn_at_checkpoint and checkpoint_reached) else 80
    mario_fx = float(spawn_x)
    mario_fy = float(GROUND_Y - 38)
    mario.x = int(mario_fx)
    mario.y = int(mario_fy)
    mario_vx = 0.0
    mario_vy = 0.0
    on_ground = True
    coyote_frames = 0
    jump_buffer_frames = 0
    camera_fx = max(0.0, mario_fx - 260.0)
    camera_x = int(camera_fx)
    world_timer = 400.0
    floating_popups = []


build_level(1)


# Capture and encode a 48x36 player avatar photo (< 4 KB) for the leaderboard
def capture_player_photo(bgr_frame):
    global captured_photo_b64, captured_avatar_surf, captured_preview_surf
    if bgr_frame is None or bgr_frame.size == 0:
        surf = pygame.Surface((34, 26))
        surf.fill(MARIO_RED)
        captured_avatar_surf = surf
        prev = pygame.Surface((160, 120))
        prev.fill(MARIO_RED)
        captured_preview_surf = prev
        captured_photo_b64 = ""
        return

    h, w, _ = bgr_frame.shape
    crop_w = int(min(w, h * 1.2))
    crop_h = int(crop_w * 0.75)
    x0 = max(0, (w - crop_w) // 2)
    y0 = max(0, (h - crop_h) // 2)
    cropped = bgr_frame[y0:y0 + crop_h, x0:x0 + crop_w]

    thumb_bgr = cv2.resize(cropped, (48, 36))
    for qual in (70, 55, 40):
        ok_enc, buf = cv2.imencode(".jpg", thumb_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), qual])
        if ok_enc:
            b64_candidate = base64.b64encode(buf.tobytes()).decode("ascii")
            if len(b64_candidate) <= 4096:
                captured_photo_b64 = b64_candidate
                break

    av_rgb = cv2.cvtColor(cv2.resize(cropped, (34, 26)), cv2.COLOR_BGR2RGB)
    captured_avatar_surf = pygame.image.frombuffer(av_rgb.tobytes(), (34, 26), "RGB")

    pr_rgb = cv2.cvtColor(cv2.resize(cropped, (160, 120)), cv2.COLOR_BGR2RGB)
    captured_preview_surf = pygame.image.frombuffer(pr_rgb.tobytes(), (160, 120), "RGB")
    play_sfx(SFX_SNAP)


# Draw 8-bit Mario sprite
def draw_mario_sprite(surface, sx, sy, facing, jumping, walk_step):
    pygame.draw.rect(surface, MARIO_RED, (sx + 4, sy, 18, 5))
    if facing >= 0:
        pygame.draw.rect(surface, MARIO_RED, (sx + 2, sy + 4, 24, 4))
        pygame.draw.rect(surface, MARIO_SKIN, (sx + 6, sy + 8, 18, 10))
        pygame.draw.rect(surface, MARIO_BROWN, (sx + 3, sy + 8, 6, 8))
        pygame.draw.rect(surface, BLACK, (sx + 18, sy + 10, 3, 4))
        pygame.draw.rect(surface, MARIO_BROWN, (sx + 14, sy + 15, 11, 3))
    else:
        pygame.draw.rect(surface, MARIO_RED, (sx + 2, sy + 4, 24, 4))
        pygame.draw.rect(surface, MARIO_SKIN, (sx + 4, sy + 8, 18, 10))
        pygame.draw.rect(surface, MARIO_BROWN, (sx + 19, sy + 8, 6, 8))
        pygame.draw.rect(surface, BLACK, (sx + 7, sy + 10, 3, 4))
        pygame.draw.rect(surface, MARIO_BROWN, (sx + 3, sy + 15, 11, 3))

    pygame.draw.rect(surface, MARIO_BROWN, (sx + 2, sy + 18, 24, 14))
    pygame.draw.rect(surface, MARIO_RED, (sx + 6, sy + 18, 16, 16))
    pygame.draw.rect(surface, COIN_GOLD, (sx + 8, sy + 24, 3, 3))
    pygame.draw.rect(surface, COIN_GOLD, (sx + 17, sy + 24, 3, 3))
    pygame.draw.rect(surface, MARIO_SKIN, (sx, sy + 21, 4, 6))
    pygame.draw.rect(surface, MARIO_SKIN, (sx + 24, sy + 21, 4, 6))

    if jumping or (walk_step // 5) % 2 == 1:
        pygame.draw.rect(surface, MARIO_BROWN, (sx, sy + 32, 11, 6))
        pygame.draw.rect(surface, MARIO_BROWN, (sx + 15, sy + 30, 11, 6))
    else:
        pygame.draw.rect(surface, MARIO_BROWN, (sx + 2, sy + 32, 10, 6))
        pygame.draw.rect(surface, MARIO_BROWN, (sx + 14, sy + 32, 10, 6))


# Draw Goomba sprite themed by world
def draw_goomba_sprite(surface, sx, sy, state, tick, level_num):
    if level_num == 2:
        cap_color = GOOMBA_BLUE
    elif level_num == 4:
        cap_color = GOOMBA_GRAY
    else:
        cap_color = GOOMBA_BROWN

    if state == "squished":
        pygame.draw.rect(surface, cap_color, (sx + 2, sy + 20, 28, 8))
        pygame.draw.rect(surface, GOOMBA_STEM, (sx + 8, sy + 28, 16, 4))
        return

    pygame.draw.polygon(surface, cap_color, [
        (sx + 16, sy), (sx + 31, sy + 14), (sx + 28, sy + 22), (sx + 4, sy + 22), (sx + 1, sy + 14)
    ])
    pygame.draw.rect(surface, BLACK, (sx + 7, sy + 10, 4, 7))
    pygame.draw.rect(surface, BLACK, (sx + 21, sy + 10, 4, 7))
    pygame.draw.rect(surface, WHITE, (sx + 9, sy + 12, 2, 4))
    pygame.draw.rect(surface, WHITE, (sx + 21, sy + 12, 2, 4))
    pygame.draw.rect(surface, GOOMBA_STEM, (sx + 10, sy + 22, 12, 6))
    if (tick // 10) % 2 == 0:
        pygame.draw.rect(surface, BLACK, (sx + 3, sy + 26, 10, 6))
        pygame.draw.rect(surface, BLACK, (sx + 19, sy + 28, 10, 4))
    else:
        pygame.draw.rect(surface, BLACK, (sx + 3, sy + 28, 10, 4))
        pygame.draw.rect(surface, BLACK, (sx + 19, sy + 26, 10, 6))


# Main 60 FPS Game Loop
frame_tick = 0
running = True
camera_surface = pygame.Surface((360, 210))

while running:
    dt = clock.tick(TARGET_FPS) / 1000.0
    dt_scale = min(2.2, max(0.5, dt * 60.0))
    frame_tick += 1

    # Grab latest non-blocking AI hand telemetry & frame from the background camera thread
    with cam_lock:
        hand_detected = shared_hand_detected
        ai_gesture = shared_ai_gesture
        finger_states = dict(shared_finger_states)
        cam_bytes = shared_cam_rgb_bytes
        last_clean_cam_frame = shared_clean_bgr.copy() if shared_clean_bgr is not None else None
        active_cam_idx = shared_cam_index
        cam_error_msg = shared_cam_error

    if cam_bytes is not None:
        camera_surface = pygame.image.frombuffer(cam_bytes, (360, 210), "RGB")
    else:
        camera_surface.fill(UI_CARD)
        if cam_error_msg:
            draw_block_text(camera_surface, "CAMERA ERROR, USING KEYBOARD", 12, 75, scale=2, color=COIN_GOLD)
            draw_block_text(camera_surface, cam_error_msg[:28], 12, 105, scale=1, color=WHITE)
            draw_block_text(camera_surface, "PRESS C TO RETRY CAMERA", 42, 130, scale=2, color=PIPE_HIGHLIGHT)
        else:
            draw_block_text(camera_surface, f"CAM {active_cam_idx} STARTING", 55, 80, scale=2, color=COIN_GOLD)
            draw_block_text(camera_surface, "PRESS C TO SWITCH", 45, 110, scale=2, color=WHITE)

    # Handle keyboard and window events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if game_mode == "REGISTER":
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_TAB:
                    shared_switch_requested = True
                elif event.key == pygame.K_SPACE:
                    capture_player_photo(last_clean_cam_frame)
                elif event.key == pygame.K_p:
                    cloud_photo_consent = not cloud_photo_consent
                elif event.key == pygame.K_RETURN:
                    if captured_avatar_surf is None:
                        capture_player_photo(last_clean_cam_frame)
                    player_name_input = sanitize_player_name(player_name_input)
                    reset_protected_stats()
                    lives = 3
                    build_level(1)
                    banner_text = "WORLD 1-1 OVERWORLD!"
                    banner_frames = 90
                    game_mode = "PLAYING"
                elif event.key == pygame.K_BACKSPACE:
                    player_name_input = player_name_input[:-1]
                else:
                    ch = event.unicode.upper()
                    if ch in "ABCDEFGHIJKLMNOQRSTUVWXYZ0123456789 _-" and len(player_name_input) < 10:
                        player_name_input += ch
            else:
                if event.key in (pygame.K_q, pygame.K_ESCAPE):
                    running = False
                elif event.key == pygame.K_c:
                    shared_switch_requested = True
                elif event.key == pygame.K_m:
                    sound_muted = not sound_muted
                    if sound_muted:
                        pygame.mixer.pause()
                    else:
                        pygame.mixer.unpause()
                elif event.key == pygame.K_n:
                    game_mode = "REGISTER"
                    captured_avatar_surf = None
                    captured_preview_surf = None
                    cloud_photo_consent = False
                elif event.key in (pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4):
                    chosen_lv = int(event.unicode)
                    build_level(chosen_lv)
                    banner_text = f"WARPED TO WORLD 1-{chosen_lv}!"
                    banner_frames = 80
                elif event.key == pygame.K_r:
                    sc_now, cn_now = get_protected_stats()
                    if sc_now > 0:
                        record_verified_score(
                            player_name_input, sc_now, cn_now, current_level,
                            captured_photo_b64, captured_avatar_surf, cloud_photo_consent
                        )
                    reset_protected_stats()
                    lives = 3
                    build_level(1)

    # ================= PRE-GAME PLAYER PHOTO & NAME REGISTRATION SCREEN =================
    if game_mode == "REGISTER":
        window.fill(UI_DARK)
        pygame.draw.rect(window, NES_SKY, (0, 0, GAME_W, WINDOW_H))
        pygame.draw.rect(window, GROUND_RUST, (0, GROUND_Y, GAME_W, WINDOW_H - GROUND_Y))
        for tx in range(0, GAME_W, 32):
            pygame.draw.rect(window, MORTAR_BLACK, (tx, GROUND_Y, 32, 32), 2)
            pygame.draw.rect(window, GROUND_PEACH, (tx + 2, GROUND_Y + 2, 26, 4))

        pygame.draw.rect(window, UI_DARK, (80, 32, 740, 452))
        pygame.draw.rect(window, COIN_GOLD, (80, 32, 740, 452), 4)

        draw_block_text(window, "SUPER MARIO ARCADE", 190, 50, scale=4, color=COIN_GOLD)
        draw_block_text(window, "PLAYER PHOTO AND NAME REGISTRATION", 150, 94, scale=2, color=WHITE)

        pygame.draw.rect(window, UI_CARD, (115, 126, 320, 210))
        pygame.draw.rect(window, WHITE, (115, 126, 320, 210), 2)
        if last_clean_cam_frame is not None:
            booth_rgb = cv2.cvtColor(cv2.resize(last_clean_cam_frame, (316, 206)), cv2.COLOR_BGR2RGB)
            booth_surf = pygame.image.frombuffer(booth_rgb.tobytes(), (316, 206), "RGB")
            window.blit(booth_surf, (117, 128))
        elif cam_error_msg:
            draw_block_text(window, "CAMERA ERROR, USING KEYBOARD", 120, 215, scale=1, color=COIN_GOLD)
        else:
            draw_block_text(window, "CAMERA STARTING", 165, 215, scale=2, color=COIN_GOLD)
        draw_block_text(window, "SPACE: SNAP PHOTO", 135, 346, scale=2, color=PIPE_HIGHLIGHT)
        draw_block_text(window, "TAB: SWITCH CAMERA", 135, 368, scale=2, color=WHITE)

        draw_block_text(window, "CAPTURED PHOTO:", 475, 128, scale=2, color=COIN_GOLD)
        pygame.draw.rect(window, UI_CARD, (475, 152, 164, 124))
        pygame.draw.rect(window, PIPE_HIGHLIGHT if captured_preview_surf else UI_BORDER, (475, 152, 164, 124), 2)
        if captured_preview_surf is not None:
            window.blit(captured_preview_surf, (477, 154))
            draw_block_text(window, "LOCKED!", 650, 204, scale=2, color=PIPE_HIGHLIGHT)
        else:
            draw_block_text(window, "AUTO-SNAPS ON", 482, 194, scale=2, color=WHITE)
            draw_block_text(window, "ENTER IF SKIP", 482, 218, scale=2, color=WHITE)

        draw_block_text(window, "TYPE PLAYER NAME:", 475, 286, scale=2, color=COIN_GOLD)
        pygame.draw.rect(window, BLACK, (475, 308, 300, 36))
        pygame.draw.rect(window, COIN_GOLD, (475, 308, 300, 36), 2)
        cursor = "_" if (frame_tick // 20) % 2 == 0 else " "
        shown_name = (player_name_input if player_name_input else "") + cursor
        draw_block_text(window, shown_name, 488, 319, scale=2, color=WHITE)

        # Explicit Cloud Photo Consent Toggle (Key P, default OFF)
        consent_label = "SEND PHOTO TO CLOUD: ON" if cloud_photo_consent else "SEND PHOTO TO CLOUD: OFF"
        consent_col = PIPE_HIGHLIGHT if cloud_photo_consent else COIN_GOLD
        pygame.draw.rect(window, UI_CARD, (475, 354, 320, 44))
        pygame.draw.rect(window, consent_col, (475, 354, 320, 44), 2)
        draw_block_text(window, consent_label, 485, 361, scale=2, color=consent_col)
        draw_block_text(window, "PRESS P TO TOGGLE CONSENT", 485, 381, scale=1, color=WHITE)

        pygame.draw.rect(window, UI_GREEN, (190, 418, 520, 40))
        pygame.draw.rect(window, WHITE, (190, 418, 520, 40), 2)
        draw_block_text(window, "PRESS ENTER TO LAUNCH 4-WORLD TOUR", 198, 431, scale=2, color=WHITE)

    # ================= ACTIVE 60FPS GAMEPLAY MODE =================
    else:
        world_timer = max(0.0, world_timer - dt)
        if banner_frames > 0:
            banner_frames -= 1
        if invincible_frames > 0:
            invincible_frames -= 1

        # Move floating platforms smoothly and carry Mario if standing on one
        for mp_plat in moving_platforms:
            old_px = mp_plat["rect"].x
            old_py = mp_plat["rect"].y
            mp_plat["rect"].x += int(round(mp_plat["vx"] * dt_scale))
            mp_plat["rect"].y += int(round(mp_plat["vy"] * dt_scale))

            if mp_plat["vx"] != 0.0 and (mp_plat["rect"].x < mp_plat["min_x"] or mp_plat["rect"].x > mp_plat["max_x"]):
                mp_plat["vx"] = -mp_plat["vx"]
            if mp_plat["vy"] != 0.0 and (mp_plat["rect"].y < mp_plat["min_y"] or mp_plat["rect"].y > mp_plat["max_y"]):
                mp_plat["vy"] = -mp_plat["vy"]

            dx_p = mp_plat["rect"].x - old_px
            dy_p = mp_plat["rect"].y - old_py
            if on_ground and abs(mario.bottom - old_py) <= 4 and mario.right > mp_plat["rect"].left and mario.left < mp_plat["rect"].right:
                mario_fx += dx_p
                mario_fy += dy_p
                mario.x = int(mario_fx)
                mario.y = int(mario_fy)

        # Read keyboard controls and combine with AI hand gesture
        keys = pygame.key.get_pressed()
        kb_right = keys[pygame.K_RIGHT] or keys[pygame.K_d]
        kb_left = keys[pygame.K_LEFT] or keys[pygame.K_a]
        kb_jump = keys[pygame.K_SPACE] or keys[pygame.K_UP] or keys[pygame.K_w]

        ai_right = ai_gesture in ("RUN RIGHT", "JUMP + RIGHT")
        ai_left = ai_gesture == "RUN LEFT"
        ai_jump = ai_gesture in ("JUMP", "JUMP + RIGHT")

        move_right = kb_right or ai_right
        move_left = kb_left or ai_left
        want_jump = kb_jump or ai_jump

        # Silky 60FPS horizontal acceleration & air momentum
        max_run_speed = 4.2
        accel = 0.55 * dt_scale
        if move_right:
            mario_vx = min(max_run_speed, mario_vx + accel)
            mario_facing = 1
        elif move_left:
            mario_vx = max(-max_run_speed, mario_vx - accel)
            mario_facing = -1
        else:
            decay = (0.82 if on_ground else 0.96) ** dt_scale
            mario_vx *= decay
            if abs(mario_vx) < 0.15:
                mario_vx = 0.0

        # Forgiving 10-frame Coyote Time & Jump Buffer at 60FPS
        if on_ground:
            coyote_frames = 10
        elif coyote_frames > 0:
            coyote_frames -= 1

        if want_jump:
            jump_buffer_frames = 10
        elif jump_buffer_frames > 0:
            jump_buffer_frames -= 1

        if jump_buffer_frames > 0 and coyote_frames > 0:
            mario_vy = -9.8
            on_ground = False
            coyote_frames = 0
            jump_buffer_frames = 0
            play_sfx(SFX_JUMP)
            if abs(mario_vx) > 0.8:
                mario_vx = max_run_speed * mario_facing

        solid_rects = ground_sections + pipes + bricks + [q["rect"] for q in q_blocks] + stairs + [m["rect"] for m in moving_platforms]

        # Sub-pixel horizontal movement + 6px corner-rounding step assist
        mario_fx += mario_vx * dt_scale
        if mario_fx < camera_fx:
            mario_fx = camera_fx
        mario.x = int(round(mario_fx))

        for block in solid_rects:
            if mario.colliderect(block):
                if block.top < mario.bottom <= block.top + 6 and mario_vy >= 0:
                    mario.bottom = block.top
                    mario_fy = float(mario.y)
                    on_ground = True
                elif mario_vx > 0:
                    mario.right = block.left
                    mario_fx = float(mario.x)
                    mario_vx = 0.0
                elif mario_vx < 0:
                    mario.left = block.right
                    mario_fx = float(mario.x)
                    mario_vx = 0.0

        # Sub-pixel vertical movement + variable jump gravity
        grav = 0.36 if (mario_vy < 0 and want_jump) else 0.48
        mario_vy = min(8.5, mario_vy + grav * dt_scale)
        mario_fy += mario_vy * dt_scale
        mario.y = int(round(mario_fy))

        on_ground = False
        for block in solid_rects:
            if mario.colliderect(block):
                if mario_vy > 0:
                    mario.bottom = block.top
                    mario_fy = float(mario.y)
                    mario_vy = 0.0
                    on_ground = True
                elif mario_vy < 0:
                    if mario.right - block.left <= 6:
                        mario.right = block.left
                        mario_fx = float(mario.x)
                        continue
                    if block.right - mario.left <= 6:
                        mario.left = block.right
                        mario_fx = float(mario.x)
                        continue

                    mario.top = block.bottom
                    mario_fy = float(mario.y)
                    mario_vy = 0.0
                    for q in q_blocks:
                        if q["rect"] == block and not q["used"]:
                            q["used"] = True
                            q["bounce"] = 10
                            add_protected_points(200, 1)
                            play_sfx(SFX_COIN)
                            floating_popups.append({"x": block.x, "y": float(block.y - 16), "text": "+200", "timer": 35})

        # Red Bounce Springs (launch Mario high into Tier 2 / Tier 3)
        for sp_rect in springs:
            if mario.colliderect(sp_rect):
                mario.bottom = sp_rect.top
                mario_fy = float(mario.y)
                mario_vy = -13.2
                on_ground = False
                play_sfx(SFX_SPRING)
                floating_popups.append({"x": sp_rect.x, "y": float(sp_rect.y - 12), "text": "BOING!", "timer": 28})

        # Mid-level Checkpoint Flag
        if not checkpoint_reached and mario.right >= checkpoint_x:
            checkpoint_reached = True
            add_protected_points(500, 0)
            play_sfx(SFX_COIN)
            banner_text = "CHECKPOINT SAVED! +500"
            banner_frames = 75

        for q in q_blocks:
            if q["bounce"] > 0:
                q["bounce"] -= 1

        # Smooth Lerp Camera Follow across the 900px gameplay viewport
        target_cam = max(camera_fx, mario_fx - 300.0)
        target_cam = min(float(LEVEL_END_X - GAME_W), target_cam)
        camera_fx += (target_cam - camera_fx) * min(1.0, 0.18 * dt_scale)
        camera_x = int(round(camera_fx))

        # Pit fall handling (respawns at mid-level checkpoint if reached)
        if mario.top > WINDOW_H:
            play_sfx(SFX_HURT)
            lives -= 1
            if lives <= 0:
                sc_now, cn_now = get_protected_stats()
                record_verified_score(
                    player_name_input, sc_now, cn_now, current_level,
                    captured_photo_b64, captured_avatar_surf, cloud_photo_consent
                )
                reset_protected_stats()
                lives = 3
                build_level(1, respawn_at_checkpoint=False)
                banner_text = "SCORE SAVED! NEW RUN"
                banner_frames = 90
            else:
                build_level(current_level, respawn_at_checkpoint=True)
                banner_text = f"LIVES LEFT: {lives}"
                banner_frames = 70

        # Collect floating coins
        for coin in coins[:]:
            if mario.colliderect(coin):
                coins.remove(coin)
                add_protected_points(200, 1)
                play_sfx(SFX_COIN)
                floating_popups.append({"x": coin.x, "y": float(coin.y), "text": "+200", "timer": 35})

        # Goomba patrol, generous stomp box, and post-hit invincibility frames
        for g in goombas:
            if g["state"] == "dead":
                continue
            if g["state"] == "squished":
                g["timer"] -= 1
                if g["timer"] <= 0:
                    g["state"] = "dead"
                continue

            g["rect"].x += int(round(g["vx"] * dt_scale))
            if g["rect"].x < g["min_x"] or g["rect"].right > g["max_x"]:
                g["vx"] = -g["vx"]

            enemy_core = g["rect"].inflate(-6, -2)
            if mario.colliderect(enemy_core):
                if mario_vy > 0 or mario.bottom <= g["rect"].top + 20:
                    g["state"] = "squished"
                    g["timer"] = 25
                    mario_vy = -7.8
                    add_protected_points(100, 0)
                    play_sfx(SFX_STOMP)
                    floating_popups.append({"x": g["rect"].x, "y": float(g["rect"].y - 10), "text": "+100", "timer": 35})
                elif invincible_frames == 0:
                    play_sfx(SFX_HURT)
                    lives -= 1
                    invincible_frames = 75
                    if lives <= 0:
                        sc_now, cn_now = get_protected_stats()
                        record_verified_score(
                            player_name_input, sc_now, cn_now, current_level,
                            captured_photo_b64, captured_avatar_surf, cloud_photo_consent
                        )
                        reset_protected_stats()
                        lives = 3
                        build_level(1, respawn_at_checkpoint=False)
                        banner_text = "SCORE SAVED TO LEADERBOARD!"
                        banner_frames = 95
                        break
                    else:
                        mario_vy = -6.0
                        banner_text = f"OUCH! {lives} LIVES LEFT"
                        banner_frames = 60

        # Flagpole level clear -> progress through all 4 Worlds (1-1 -> 1-2 -> 1-3 -> 1-4)
        if mario.right >= LEVEL_END_X - 150:
            play_sfx(SFX_CLEAR)
            add_protected_points(1000, 0)
            if current_level < TOTAL_LEVELS:
                next_lv = current_level + 1
                build_level(next_lv, respawn_at_checkpoint=False)
                level_titles = {
                    2: "WORLD 1-2 UNDERGROUND!",
                    3: "WORLD 1-3 SKY BRIDGES!",
                    4: "WORLD 1-4 BOWSER CASTLE!"
                }
                banner_text = level_titles.get(next_lv, f"WORLD 1-{next_lv}!")
                banner_frames = 100
            else:
                sc_now, cn_now = get_protected_stats()
                record_verified_score(
                    player_name_input, sc_now, cn_now, 4,
                    captured_photo_b64, captured_avatar_surf, cloud_photo_consent
                )
                banner_text = f"ALL 4 WORLDS CLEAR! {sc_now} PTS"
                banner_frames = 120
                reset_protected_stats()
                lives = 3
                build_level(1, respawn_at_checkpoint=False)

        # ================= DRAW LEFT 900x520 GAMEPLAY VIEWPORT =================
        window.set_clip(pygame.Rect(0, 0, GAME_W, 520))
        if current_level == 1:
            bg_col = NES_SKY
        elif current_level == 2:
            bg_col = UNDERGROUND_BG
        elif current_level == 3:
            bg_col = ATHLETIC_SKY
        else:
            bg_col = CASTLE_BG
        pygame.draw.rect(window, bg_col, (0, 0, GAME_W, 520))

        # Ceiling bricks in Level 2 (Underground) and Level 4 (Castle)
        if current_level in (2, 4):
            ceil_col = BLUE_BRICK if current_level == 2 else CASTLE_STONE
            for tx in range(0, GAME_W, 32):
                pygame.draw.rect(window, ceil_col, (tx, 52, 32, 20))
                pygame.draw.rect(window, MORTAR_BLACK, (tx, 52, 32, 20), 2)

        # Lava pits at bottom of gaps in Level 4 (Castle)
        if current_level == 4:
            pygame.draw.rect(window, LAVA_RED, (0, GROUND_Y + 6, GAME_W, 20))
            pygame.draw.rect(window, LAVA_GOLD, (0, GROUND_Y + 6, GAME_W, 4))

        for cx, cy, cw in clouds:
            sx = cx - int(camera_x * 0.5)
            if -140 <= sx <= GAME_W + 20:
                pygame.draw.ellipse(window, CLOUD_OUTLINE, (sx - 2, cy - 2, cw + 4, 34))
                pygame.draw.ellipse(window, CLOUD_WHITE, (sx, cy, cw, 30))

        for hx, hw, hh in hills:
            sx = hx - camera_x
            if -180 <= sx <= GAME_W + 20:
                pts = [(sx, GROUND_Y), (sx + hw // 2, GROUND_Y - hh), (sx + hw, GROUND_Y)]
                pygame.draw.polygon(window, HILL_GREEN, pts)
                pygame.draw.polygon(window, MORTAR_BLACK, pts, 2)

        for bx, bw in bushes:
            sx = bx - camera_x
            if -120 <= sx <= GAME_W + 20:
                pygame.draw.ellipse(window, BUSH_LIME, (sx, GROUND_Y - 24, bw, 28))
                pygame.draw.ellipse(window, PIPE_SHADOW, (sx, GROUND_Y - 24, bw, 28), 2)

        # Tiled ground blocks themed by World
        if current_level == 2:
            g_main, g_top = BLUE_BRICK, BLUE_HIGHLIGHT
        elif current_level == 4:
            g_main, g_top = CASTLE_STONE, CASTLE_HIGHLIGHT
        else:
            g_main, g_top = GROUND_RUST, GROUND_PEACH

        for g_rect in ground_sections:
            first_tile = max(g_rect.left, (camera_x // 32) * 32)
            last_tile = min(g_rect.right, camera_x + GAME_W + 32)
            for tx in range(first_tile, last_tile, 32):
                sx = tx - camera_x
                pygame.draw.rect(window, g_main, (sx, GROUND_Y, 32, 20))
                pygame.draw.rect(window, g_top, (sx + 2, GROUND_Y + 2, 26, 4))
                pygame.draw.rect(window, MORTAR_BLACK, (sx, GROUND_Y, 32, 20), 2)

        # Floating bricks
        if current_level == 2:
            b_col = BLUE_BRICK
        elif current_level == 4:
            b_col = CASTLE_STONE
        else:
            b_col = BRICK_RED

        for b_rect in bricks:
            sx = b_rect.x - camera_x
            if -40 <= sx <= GAME_W + 20:
                pygame.draw.rect(window, b_col, (sx, b_rect.y, 32, 32))
                pygame.draw.rect(window, MORTAR_BLACK, (sx, b_rect.y, 32, 32), 2)
                pygame.draw.line(window, MORTAR_BLACK, (sx, b_rect.y + 16), (sx + 32, b_rect.y + 16), 2)
                pygame.draw.line(window, MORTAR_BLACK, (sx + 16, b_rect.y), (sx + 16, b_rect.y + 16), 2)

        # Question (?) blocks
        for q in q_blocks:
            sx = q["rect"].x - camera_x
            sy = q["rect"].y - q["bounce"]
            if -40 <= sx <= GAME_W + 20:
                col = Q_USED_BROWN if q["used"] else Q_ORANGE
                pygame.draw.rect(window, col, (sx, sy, 32, 32))
                pygame.draw.rect(window, MORTAR_BLACK, (sx, sy, 32, 32), 2)
                if not q["used"]:
                    draw_block_text(window, "?", sx + 10, sy + 6, scale=3, color=WHITE)

        # Moving Elevator / Bridge Platforms
        for mp_plat in moving_platforms:
            sx = mp_plat["rect"].x - camera_x
            sy = mp_plat["rect"].y
            pw = mp_plat["rect"].width
            if -90 <= sx <= GAME_W + 20:
                pygame.draw.rect(window, COIN_GOLD, (sx, sy, pw, 16))
                pygame.draw.rect(window, MORTAR_BLACK, (sx, sy, pw, 16), 2)
                pygame.draw.rect(window, MARIO_RED, (sx + 4, sy + 4, pw - 8, 4))

        # Red Bounce Springs
        for sp_rect in springs:
            sx = sp_rect.x - camera_x
            sy = sp_rect.y
            if -40 <= sx <= GAME_W + 20:
                pygame.draw.rect(window, MARIO_RED, (sx, sy, 28, 8))
                pygame.draw.line(window, WHITE, (sx + 4, sy + 8), (sx + 24, sy + 16), 3)
                pygame.draw.line(window, WHITE, (sx + 24, sy + 16), (sx + 4, sy + 24), 3)
                pygame.draw.rect(window, CASTLE_STONE, (sx, sy + 22, 28, 6))

        # Mid-level Checkpoint Flag
        cp_sx = checkpoint_x - camera_x
        if -40 <= cp_sx <= GAME_W + 20:
            pygame.draw.rect(window, WHITE, (cp_sx, GROUND_Y - 72, 4, 72))
            flag_col = UI_GREEN if checkpoint_reached else MARIO_RED
            pygame.draw.polygon(window, flag_col, [(cp_sx + 4, GROUND_Y - 72), (cp_sx + 34, GROUND_Y - 58), (cp_sx + 4, GROUND_Y - 44)])

        # End staircase
        for s_rect in stairs:
            sx = s_rect.x - camera_x
            if -40 <= sx <= GAME_W + 20:
                for ty in range(s_rect.top, s_rect.bottom, 28):
                    pygame.draw.rect(window, g_main, (sx, ty, 32, 28))
                    pygame.draw.rect(window, MORTAR_BLACK, (sx, ty, 32, 28), 2)

        # Warp pipes
        for p_rect in pipes:
            sx = p_rect.x - camera_x
            sy = p_rect.y
            if -70 <= sx <= GAME_W + 20:
                pygame.draw.rect(window, PIPE_GREEN, (sx + 4, sy + 22, 48, p_rect.height - 22))
                pygame.draw.rect(window, PIPE_HIGHLIGHT, (sx + 10, sy + 22, 9, p_rect.height - 22))
                pygame.draw.rect(window, PIPE_SHADOW, (sx + 4, sy + 22, 48, p_rect.height - 22), 2)
                pygame.draw.rect(window, PIPE_GREEN, (sx, sy, 56, 22))
                pygame.draw.rect(window, PIPE_HIGHLIGHT, (sx + 8, sy + 2, 10, 18))
                pygame.draw.rect(window, PIPE_SHADOW, (sx, sy, 56, 22), 2)

        # Flagpole and Castle
        pole_sx = (LEVEL_END_X - 150) - camera_x
        if -200 <= pole_sx <= GAME_W + 40:
            pygame.draw.rect(window, g_main, (pole_sx - 12, GROUND_Y - 28, 32, 28))
            pygame.draw.rect(window, PIPE_HIGHLIGHT, (pole_sx + 2, GROUND_Y - 270, 4, 242))
            pygame.draw.circle(window, PIPE_GREEN, (pole_sx + 4, GROUND_Y - 274), 8)
            pygame.draw.polygon(window, PIPE_GREEN, [(pole_sx + 2, GROUND_Y - 264), (pole_sx - 38, GROUND_Y - 246), (pole_sx + 2, GROUND_Y - 228)])

            castle_sx = pole_sx + 54
            pygame.draw.rect(window, BRICK_RED if current_level != 4 else CASTLE_STONE, (castle_sx, GROUND_Y - 96, 92, 96))
            pygame.draw.rect(window, MORTAR_BLACK, (castle_sx, GROUND_Y - 96, 92, 96), 2)
            pygame.draw.rect(window, BLACK, (castle_sx + 32, GROUND_Y - 46, 28, 46))

        # Coins
        for coin in coins:
            sx = coin.x - camera_x
            if -30 <= sx <= GAME_W + 20:
                pygame.draw.ellipse(window, COIN_GOLD, (sx, coin.y, 18, 24))
                pygame.draw.ellipse(window, Q_USED_BROWN, (sx, coin.y, 18, 24), 2)

        # Goombas
        for g in goombas:
            if g["state"] != "dead":
                sx = g["rect"].x - camera_x
                if -40 <= sx <= GAME_W + 20:
                    draw_goomba_sprite(window, sx, g["rect"].y, g["state"], frame_tick, current_level)

        # Mario
        if invincible_frames % 2 == 0:
            draw_mario_sprite(window, mario.x - camera_x - 2, mario.y, mario_facing, not on_ground, int(mario_fx))

        # Floating block-text score popups
        for pop in floating_popups[:]:
            pop["y"] -= 1.2 * dt_scale
            pop["timer"] -= 1
            draw_block_text(window, pop["text"], pop["x"] - camera_x, int(pop["y"]), scale=2, color=COIN_GOLD)
            if pop["timer"] <= 0:
                floating_popups.remove(pop)

        # Authentic Block-Text Top NES HUD Bar
        sc_val, cn_val = get_protected_stats()
        if captured_avatar_surf is not None:
            window.blit(captured_avatar_surf, (16, 10))
            pygame.draw.rect(window, COIN_GOLD, (16, 10, 34, 26), 2)
        draw_block_text(window, player_name_input or "MARIO", 58, 10, scale=2, color=WHITE)
        draw_block_text(window, f"{sc_val:06d}", 58, 28, scale=2, color=COIN_GOLD)

        draw_block_text(window, "COINS", 235, 10, scale=2, color=WHITE)
        draw_block_text(window, f"X{cn_val:02d}", 235, 28, scale=2, color=COIN_GOLD)

        draw_block_text(window, "WORLD", 375, 10, scale=2, color=WHITE)
        draw_block_text(window, f"1-{current_level}/4", 375, 28, scale=2, color=COIN_GOLD)

        draw_block_text(window, "LIVES", 535, 10, scale=2, color=WHITE)
        draw_block_text(window, f"X{lives}", 545, 28, scale=2, color=PIPE_HIGHLIGHT)

        draw_block_text(window, "TIME", 675, 10, scale=2, color=WHITE)
        draw_block_text(window, f"{int(world_timer):03d}", 680, 28, scale=2, color=COIN_GOLD)

        draw_block_text(window, f"{int(clock.get_fps())}FPS", 795, 18, scale=2, color=PIPE_HIGHLIGHT)

        if banner_frames > 0:
            pygame.draw.rect(window, UI_DARK, (180, 190, 540, 46))
            pygame.draw.rect(window, COIN_GOLD, (180, 190, 540, 46), 3)
            draw_block_text(window, banner_text, 200, 206, scale=2, color=COIN_GOLD)

        window.set_clip(None)

        # Bottom Control Bar under Gameplay (0, 520 to 900, 600) using 100% Block Text
        pygame.draw.rect(window, UI_DARK, (0, 520, GAME_W, 80))
        pygame.draw.line(window, UI_BORDER, (0, 520), (GAME_W, 520), 3)
        cards = [
            ("RUN RIGHT", "4-5 FINGERS", "KEY: D / RIGHT", move_right and not want_jump),
            ("JUMP+RIGHT", "3 FINGERS", "KEY: W+D", move_right and want_jump),
            ("RUN LEFT", "2 FINGERS", "KEY: A / LEFT", move_left),
            ("JUMP", "1 FINGER", "KEY: SPACE / W", want_jump and not move_right),
            ("1-4: WARP", "N: NEW PLAYER", "M: MUTE R: RST", False)
        ]
        for idx_c, (title_c, h_txt, k_txt, act_c) in enumerate(cards):
            cx = 10 + idx_c * 177
            cy = 528
            pygame.draw.rect(window, UI_GREEN if act_c else UI_CARD, (cx, cy, 169, 64))
            pygame.draw.rect(window, COIN_GOLD if act_c else UI_BORDER, (cx, cy, 169, 64), 2)
            draw_block_text(window, title_c, cx + 8, cy + 8, scale=2, color=WHITE)
            draw_block_text(window, h_txt, cx + 8, cy + 30, scale=1, color=COIN_GOLD)
            draw_block_text(window, k_txt, cx + 8, cy + 44, scale=1, color=WHITE)

    # ================= RIGHT SIDEBAR (380x600): COMPACT CAMERA + CLOUD LEADERBOARD =================
    pygame.draw.rect(window, UI_DARK, (GAME_W, 0, SIDE_W, WINDOW_H))
    pygame.draw.line(window, UI_BORDER, (GAME_W, 0), (GAME_W, WINDOW_H), 4)

    draw_block_text(window, f"AI: {ai_gesture}", GAME_W + 14, 10, scale=2, color=PIPE_HIGHLIGHT if hand_detected else COIN_GOLD)
    draw_block_text(window, f"CAM {active_cam_idx} C:SW", GAME_W + 275, 14, scale=1, color=WHITE)

    window.blit(camera_surface, (GAME_W + 10, 32))
    pygame.draw.rect(window, UI_BORDER, (GAME_W + 10, 32, 360, 210), 2)

    f_names = ["THB", "IDX", "MID", "RNG", "PNK"]
    f_keys = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"]
    for i_f, (short_n, full_k) in enumerate(zip(f_names, f_keys)):
        px = GAME_W + 10 + i_f * 73
        py = 248
        up_now = finger_states[full_k]
        pygame.draw.rect(window, UI_GREEN if up_now else UI_CARD, (px, py, 68, 24))
        pygame.draw.rect(window, UI_BORDER, (px, py, 68, 24), 1)
        draw_block_text(window, short_n, px + 14, py + 6, scale=2, color=WHITE)

    pygame.draw.rect(window, UI_CARD, (GAME_W + 10, 280, 360, 308))
    pygame.draw.rect(window, UI_BORDER, (GAME_W + 10, 280, 360, 308), 2)
    draw_block_text(window, "LEADERBOARD", GAME_W + 18, 290, scale=2, color=COIN_GOLD)
    draw_block_text(window, get_cloud_status(), GAME_W + 235, 294, scale=1, color=PIPE_HIGHLIGHT)
    pygame.draw.line(window, UI_BORDER, (GAME_W + 16, 312), (GAME_W + 364, 312), 2)

    if len(leaderboard_entries) == 0:
        draw_block_text(window, "NO SCORES YET", GAME_W + 95, 410, scale=2, color=WHITE)
        draw_block_text(window, "PLAY TO SET RECORD!", GAME_W + 65, 435, scale=2, color=COIN_GOLD)
    else:
        for rank_i, entry in enumerate(leaderboard_entries[:7]):
            ry = 318 + rank_i * 38
            pygame.draw.rect(window, UI_DARK, (GAME_W + 16, ry, 348, 34))
            draw_block_text(window, f"#{rank_i + 1}", GAME_W + 22, ry + 10, scale=2, color=COIN_GOLD)
            if entry.get("avatar_surf") is not None:
                window.blit(entry["avatar_surf"], (GAME_W + 56, ry + 4))
            else:
                pygame.draw.rect(window, MARIO_RED, (GAME_W + 56, ry + 4, 34, 26))
            pygame.draw.rect(window, UI_BORDER, (GAME_W + 56, ry + 4, 34, 26), 1)
            draw_block_text(window, entry["name"][:9], GAME_W + 98, ry + 10, scale=2, color=WHITE)
            draw_block_text(window, f"{entry['score']:05d}", GAME_W + 278, ry + 10, scale=2, color=PIPE_HIGHLIGHT)

    pygame.display.flip()

shared_running = False
cam_thread.join(timeout=1.0)
pygame.quit()