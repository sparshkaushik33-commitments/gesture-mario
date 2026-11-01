# Super Mario Bros Arcade - AI Hand Gesture Edition

A 60 FPS retro arcade platformer powered by **MediaPipe AI Hand Gesture Tracking**, procedural NES 8-bit chiptune audio, and sub-pixel delta-time physics. Play directly in your web browser or run natively on desktop with Python.

Control Mario in real time using your webcam hand gestures or keyboard, through 4 complete worlds with warp pipes, elevators, cloud bridges, lava pits, an arcade photo registration booth, and local/cloud leaderboard sync.

---

## 🚀 Instant Web Hosting & Deployment

The web client runs 100% in the browser using client-side WebGL MediaPipe Hand landmark tracking and Web Audio API synthesis. Zero server GPU or bandwidth cost.

### Deploy to Vercel (1-Click)
1. Push this repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and select this repository.
3. Keep default settings (`Other` framework, root directory `.`) and click **Deploy**.
4. The game is live instantly with HTTPS and custom domain support!

### Deploy to Netlify (1-Click)
1. Push this repository to GitHub.
2. Go to [app.netlify.com/start](https://app.netlify.com/start) and link your repository.
3. Netlify automatically detects `netlify.toml` with `publish = "."`.
4. Click **Deploy**.

### Host on GitHub Pages (Free)
1. In your GitHub repository, navigate to **Settings > Pages**.
2. Under **Build and deployment > Source**, select **Deploy from a branch**.
3. Choose the `main` branch and `/ (root)` folder, then click **Save**.
4. Your game will be published at `https://<username>.github.io/<repo>/`.

### Run Web Version Locally
```bash
# Using Node.js
npx serve .
# Or using Python's built-in HTTP server
python3 -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) in any modern browser (Chrome, Edge, Firefox, Safari).

---

## 🎮 Controls

### AI Hand Gestures (Webcam)
| Action | Hand Gesture | Description |
| :--- | :--- | :--- |
| **Run Right** | 🖐️ **4 or 5 Fingers** | Open Palm facing camera |
| **Jump + Run Right** | ✌️☝️ **3 Fingers** | Index + Middle + Ring fingers up |
| **Run Left** | ✌️ **2 Fingers** | Peace Sign (Index + Middle) |
| **Jump** | ☝️ **1 Finger** | Index Point or Thumb Up |
| **Stop** | ✊ **0 Fingers** | Closed Fist / Relax hand |

### Keyboard Shortcuts
| Action | Key Shortcut |
| :--- | :--- |
| **Move Left / Right** | `A` / `D` or `←` / `→` |
| **Jump** | `Spacebar`, `W`, or `↑` |
| **Jump + Run Right** | `W + D` or `Space + →` |
| **Snap Photo (Booth)** | `Spacebar` or Click on camera preview |
| **Toggle Cloud Consent**| `P` |
| **Switch Camera** | `C` (in game) or `Tab` (in photo booth) |
| **Warp to Worlds** | `1`, `2`, `3`, or `4` |
| **Mute / Unmute** | `M` |
| **Reset Run** | `R` |
| **New Player Registration** | `N` |

---

## 🌟 Key Features

- **Zero External Assets**: All 8-bit sprites, tiles, 5x7 block-font typography, and square-wave NES sound effects are synthesized procedurally in code.
- **Client-Side AI Tracking**: Rotation-invariant 2D Euclidean distance ratios from wrist and palm knuckles detect finger states in real time without lag.
- **60 FPS Non-Blocking Physics**: Smooth horizontal acceleration, variable jump gravity, 10-frame Coyote Time, jump buffering, and 6-pixel corner rounding step assist.
- **4 Playable Worlds**:
  - **World 1-1**: Classic Overworld with warp pipes, question blocks, bounce springs, and Goombas.
  - **World 1-2**: Underground Blue-Brick Caverns with vertical elevator lifts.
  - **World 1-3**: Athletic Sky Treetops with moving cloud bridges and multi-tier coin towers.
  - **World 1-4**: Bowser's Stone Fortress with lava pits and moving stone bridges.
- **Photo Booth & Leaderboard**: Captures player name and optional webcam avatar before starting, saves local leaderboard records, and supports optional Google Sheets cloud sync.

---

## 🐍 Desktop Version (Python & Pygame)

If you also wish to run the desktop Python edition:

### Installation & Run
```bash
# Clone the repository
git clone https://github.com/sparshkaushik33-commitments/gesture-mario.git
cd super-mario-gesture-arcade

# Install dependencies (Python 3.10, 3.11, or 3.12)
pip install -r requirements.txt

# Launch the game
python main.py
```

### Optional: Google Sheets Cloud Leaderboard Setup
By default, the game runs in `LOCAL ONLY` mode. To enable live Google Sheets sync:
1. Create a Google Sheet, click **Extensions > Apps Script**, and paste the container-bound webhook script.
2. In **Apps Script Project Settings > Script Properties**, set `MARIO_SHEETS_TOKEN` to a secret token.
3. Deploy as a Web App (**Execute as: Me**, **Who has access: Anyone**).
4. Export environment variables:
   ```bash
   export MARIO_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
   export MARIO_SHEETS_TOKEN="YOUR_SECRET_TOKEN"
   python main.py
   ```
