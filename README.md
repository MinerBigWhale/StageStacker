# Theater Cue Software

This project is a Python desktop prototype for theater cue control.

It provides:

- A control window with a cue timeline.
- Per-cue notes, audio, and video assignments.
- A preview monitor in the control window.
- A second window for the stage video feed, with fullscreen support.
- Looping cues that repeat until stopped.
- Mixed audio playback when multiple audio cues are active.
- Save/load of show files as JSON.

## Runtime

The app uses Tkinter for the interface and can run without extra packages.

Optional media packages:

- `python-vlc` for embedded video preview, stage output, and audio playback.

Install them with:

```powershell
py -m pip install -r requirements.txt
```

For `python-vlc`, install VLC media player on Windows as well so the VLC runtime is available.

## Start

```powershell
py app.py
```

## How It Works

1. Add cues to the timeline.
2. Give each cue a note, audio file, video file, or any combination.
3. Enable `Repeat until stopped` on cues that should loop.
4. Use `Run Selected` to fire one cue or `Run Sequence` to walk forward cue-by-cue.
5. Open the stage window and toggle fullscreen for the output feed.

## Notes

- If `python-vlc` is not installed, the app still runs but audio and video playback become placeholder monitors.
- Audio playback now uses VLC as well, so common formats like WAV, MP3, and OGG should work.
- Best results come from using common formats like WAV or MP3 for audio and MP4 for video.
