# Theater Cue Software - Stage Stacker

This project is a complete prototype for theater cue control with a headless Node.js backend and a responsive React frontend.

## Quick Start (All-in-One)

### Windows

```powershell
# From repository root
./start.ps1
```

This will:
1. Install backend and frontend dependencies (if needed)
2. Start the Node.js backend on `http://localhost:8080`
3. Start the React dev server on `http://localhost:3000`

### macOS / Linux

```bash
# From repository root
bash start.sh
```

## Manual Backend Setup

Use `install.ps1` on Windows or `install.sh` on macOS/Linux to install Node.js, npm, MPV, and required dependencies.

Backend startup (manual):

1. Open a terminal in the repository root.
2. Run `./install.ps1` on Windows or `./install.sh` on macOS/Linux.
3. Run `npm start` (starts headless engine on port 8080).

## Manual Frontend Setup

Navigate to the `client/` directory and follow [client/README.md](client/README.md).

```bash
cd client
npm install
npm run dev
```

The UI will start on `http://localhost:3000`.

It provides:

- A control window with a cue timeline.
- Per-cue audio, and video assignments using plugin based approach.
- A preview monitor in the control window.
- Use MPV for playing Video and Audio Files on a connected display.
- Support trigger "With Previous" and "After Previous" with an aplied optional delayfor easy automation
- Looping cues that repeat until stopped.
- Cue can Stop Audio feed or Video feed indivitualy
- Mixed audio playback when multiple audio cues are active.
- Save/load of show files as .stack wich is actualy a zip archive containing the media to play and the config as JSON.