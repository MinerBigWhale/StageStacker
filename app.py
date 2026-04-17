from __future__ import annotations

import json
import traceback
import sys
import time
import webbrowser
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

VLC_IMPORT_ERROR = ""
VLC_COMMON_ARGS = (
    "--no-video-title-show",
    "--no-snapshot-preview",
    "--avcodec-hw=none",
)
VLC_WINDOWS_ARGS = (
    "--vout=direct3d9",
    "--aout=directsound",
)


def log_error(context: str, exc: Exception | str) -> None:
    print(f"[theater-cue] {context}", file=sys.stderr)
    if isinstance(exc, Exception):
        traceback.print_exception(exc, file=sys.stderr)
    else:
        print(str(exc), file=sys.stderr)
    sys.stderr.flush()


def build_vlc_instance():
    args = list(VLC_COMMON_ARGS)
    if sys.platform.startswith("win"):
        args.extend(VLC_WINDOWS_ARGS)
    return vlc.Instance(*args)

try:
    import vlc
except Exception as exc:  # pragma: no cover - optional dependency / native runtime dependent
    vlc = None
    VLC_IMPORT_ERROR = str(exc)
    log_error("Failed to import VLC bindings/runtime", exc)


APP_TITLE = "Theater Cue Controller"
APP_VERSION = "0.1.0"
PROJECT_FILE = "show_cues.json"
SETTINGS_FILE = "app_settings.json"
DOCUMENTATION_URL = "https://github.com/"


@dataclass
class Cue:
    name: str
    note: str = ""
    audio_path: str = ""
    video_path: str = ""
    repeat: bool = False
    id: int = field(default_factory=lambda: int(time.time() * 1000))

    @property
    def media_summary(self) -> str:
        kinds = []
        if self.note.strip():
            kinds.append("Note")
        if self.audio_path:
            kinds.append("Audio")
        if self.video_path:
            kinds.append("Video")
        return ", ".join(kinds) if kinds else "Empty"


class AudioMixer:
    def __init__(self) -> None:
        self.available = False
        self.last_error = ""
        self._instance = None
        self._players: dict[int, object] = {}
        self._level = 0.0

        if vlc is None:
            self.last_error = VLC_IMPORT_ERROR or "python-vlc is not installed"
            return

        try:
            self._instance = build_vlc_instance()
            self.available = True
        except Exception as exc:  # pragma: no cover - environment dependent
            self.last_error = str(exc)
            self.available = False
            log_error("Failed to initialize audio VLC instance", exc)

    def play(self, cue: Cue) -> bool:
        if not self.available or not cue.audio_path:
            return False
        try:
            player = self._instance.media_player_new()
            media = self._instance.media_new(Path(cue.audio_path).resolve().as_uri())
            if cue.repeat:
                media.add_option("input-repeat=-1")
            player.set_media(media)
            player.audio_set_volume(100)
            player.play()
            self._players[cue.id] = player
            return True
        except Exception as exc:
            self.last_error = str(exc)
            log_error(f"Audio playback failed for cue '{cue.name}'", exc)
            return False

    def stop(self, cue: Cue) -> None:
        player = self._players.pop(cue.id, None)
        if player is not None:
            player.stop()

    def stop_all(self) -> None:
        players = list(self._players.values())
        self._players.clear()
        for player in players:
            player.stop()
        self._level = 0.0

    def active_audio_count(self) -> int:
        finished = [
            cue_id
            for cue_id, player in self._players.items()
            if self._player_has_finished(player)
        ]
        for cue_id in finished:
            player = self._players.pop(cue_id, None)
            if player is not None:
                player.stop()
        return len(self._players)

    def estimate_level(self) -> float:
        count = self.active_audio_count()
        if count == 0:
            self._level = 0.0
        else:
            self._level = min(1.0, 0.28 + (count - 1) * 0.18)
        return self._level

    def is_cue_active(self, cue_id: int) -> bool:
        player = self._players.get(cue_id)
        return bool(player and not self._player_has_finished(player))

    def close(self) -> None:
        self.stop_all()

    def _player_has_finished(self, player) -> bool:
        try:
            state = player.get_state()
            return state in (
                vlc.State.Ended,
                vlc.State.Stopped,
                vlc.State.Error,
            )
        except Exception as exc:
            log_error("Failed to inspect audio player state", exc)
            return True


class VideoSurface:
    def __init__(self, parent: tk.Widget, title: str, framed: bool = True) -> None:
        self.frame = ttk.LabelFrame(parent, text=title) if framed else tk.Frame(parent, bg="black", bd=0, highlightthickness=0)
        self.canvas = tk.Canvas(self.frame, bg="#101318", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.status_var = tk.StringVar(value="No video loaded")
        self.player = None
        self.instance = None
        self.current_path = ""
        self.current_start = 0.0
        self.is_looping = False
        self._retry_after_id = None
        self.available = vlc is not None
        self.last_error = "" if self.available else (VLC_IMPORT_ERROR or "python-vlc is not installed")

        if self.available:
            try:
                self.instance = build_vlc_instance()
                self.player = self.instance.media_player_new()
            except Exception as exc:  # pragma: no cover - environment dependent
                self.available = False
                self.last_error = str(exc)
                log_error(f"Failed to initialize video surface '{title}'", exc)

        self.frame.bind("<Configure>", self._bind_player)
        self.canvas.bind("<Configure>", self._bind_player)

    def _bind_player(self, _event=None) -> None:
        if not self.available or not self.player:
            return
        try:
            handle = self.canvas.winfo_id()
            if sys.platform.startswith("win"):
                self.player.set_hwnd(handle)
            elif sys.platform == "darwin":
                self.player.set_nsobject(handle)
            else:
                self.player.set_xwindow(handle)
        except Exception as exc:  # pragma: no cover - platform dependent
            self.last_error = str(exc)
            log_error("Failed to bind VLC player to canvas", exc)

    def load_and_play(self, path: str, start_seconds: float = 0.0, loop: bool = False) -> bool:
        self.current_path = path
        self.current_start = start_seconds
        self.is_looping = loop
        if not path:
            self.clear()
            return False
        if not self.available or not self.player or not self.instance:
            self.status_var.set(f"Video queued: {Path(path).name}")
            return False
        try:
            media = self.instance.media_new(Path(path).resolve().as_uri())
            if loop:
                media.add_option("input-repeat=-1")
            self.player.set_media(media)
            self._bind_player()
            self.player.play()
            if start_seconds > 0:
                # VLC may need a moment before seeking.
                self.canvas.after(250, lambda: self.player.set_time(int(start_seconds * 1000)))
            if self._retry_after_id is not None:
                self.canvas.after_cancel(self._retry_after_id)
            self._retry_after_id = self.canvas.after(300, self._ensure_started)
            self.status_var.set(Path(path).name)
            return True
        except Exception as exc:
            self.last_error = str(exc)
            self.status_var.set(f"Video error: {exc}")
            log_error(f"Video playback failed for '{path}'", exc)
            return False

    def _ensure_started(self) -> None:
        self._retry_after_id = None
        if not self.available or not self.player or not self.current_path:
            return
        state = self.player.get_state()
        if state in (vlc.State.Error, vlc.State.NothingSpecial, vlc.State.Stopped):
            log_error(
                "Video player reported a stalled/error state",
                f"path={self.current_path}, state={state}",
            )
            self.load_and_play(self.current_path, self.current_start, self.is_looping)

    def stop(self) -> None:
        if self._retry_after_id is not None:
            self.canvas.after_cancel(self._retry_after_id)
            self._retry_after_id = None
        if self.available and self.player:
            try:
                self.player.stop()
            except Exception as exc:  # pragma: no cover - environment dependent
                self.last_error = str(exc)
                log_error("Failed to stop video playback", exc)
        self.status_var.set("Stopped")

    def clear(self) -> None:
        self.stop()
        self.current_path = ""
        self.current_start = 0.0
        self.is_looping = False
        self.status_var.set("No video loaded")

    def is_playing(self) -> bool:
        if not self.available or not self.player:
            return False
        try:
            state = self.player.get_state()
            return state in (
                vlc.State.Opening,
                vlc.State.Buffering,
                vlc.State.Playing,
                vlc.State.Paused,
            )
        except Exception as exc:
            log_error("Failed to inspect video player state", exc)
            return False

    def position_seconds(self) -> float:
        if not self.available or not self.player:
            return self.current_start
        try:
            return max(0.0, self.player.get_time() / 1000.0)
        except Exception:
            return self.current_start


class StageWindow:
    def __init__(self, app: "CueApp") -> None:
        self.app = app
        self.window = tk.Toplevel(app.root)
        self.window.title("Stage Output")
        self.window.geometry("960x540")
        self.window.configure(bg="black")
        self.window.protocol("WM_DELETE_WINDOW", self.hide)
        self.surface = VideoSurface(self.window, "Stage Feed", framed=False)
        self.surface.frame.pack(fill="both", expand=True)

        self.window.bind("<F11>", lambda _event: self.toggle_fullscreen())
        self.window.bind("<Escape>", lambda _event: self.window.attributes("-fullscreen", False))

    def show(self) -> None:
        self.window.deiconify()
        self.window.lift()

    def hide(self) -> None:
        self.window.withdraw()

    def toggle_fullscreen(self) -> None:
        self.show()
        current = bool(self.window.attributes("-fullscreen"))
        self.window.attributes("-fullscreen", not current)


class CueApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1400x850")
        self.root.minsize(1200, 760)

        self.project_path = Path.cwd() / PROJECT_FILE
        self.settings_path = Path.cwd() / SETTINGS_FILE
        self.cues: list[Cue] = []
        self.selected_index: Optional[int] = None
        self.running_index: Optional[int] = None
        self.sequence_mode = False
        self.current_video_cue_id: Optional[int] = None
        self.current_video_started_at = 0.0
        self.last_show_path: Optional[str] = None

        self.audio_mixer = AudioMixer()
        self.status_var = tk.StringVar()
        self.show_status("Ready")

        self.stage_window = StageWindow(self)
        self._load_settings()
        self._build_menu()
        self._build_layout()
        self.stage_window.hide()

        self._load_or_seed_project()
        self.refresh_timeline()
        self.root.after(200, self._poll_playback)

    def _schedule_media_diagnostics(self, cue: Cue) -> None:
        self.root.after(700, lambda: self._report_media_status(cue))

    def _report_media_status(self, cue: Cue) -> None:
        problems: list[str] = []
        if cue.audio_path and self.audio_mixer.available and not self.audio_mixer.is_cue_active(cue.id):
            detail = self.audio_mixer.last_error or "audio player did not start"
            problems.append(f"audio: {detail}")
        if cue.video_path and self.preview_surface.available and not self.preview_surface.is_playing():
            detail = self.preview_surface.last_error or "video player did not start"
            problems.append(f"video: {detail}")
        if problems:
            log_error("Playback diagnostics reported an issue", " | ".join(problems))
            self.show_status("Playback issue: " + " | ".join(problems))

    def _build_layout(self) -> None:
        self.root.columnconfigure(0, weight=3)
        self.root.columnconfigure(1, weight=4)
        self.root.rowconfigure(1, weight=1)

        timeline_frame = ttk.LabelFrame(self.root, text="Cue Timeline", padding=10)
        timeline_frame.grid(row=1, column=0, sticky="nsew", padx=(10, 5), pady=(10, 10))
        timeline_frame.rowconfigure(0, weight=1)
        timeline_frame.columnconfigure(0, weight=1)

        columns = ("name", "media", "repeat")
        self.timeline = ttk.Treeview(timeline_frame, columns=columns, show="headings", selectmode="browse")
        self.timeline.heading("name", text="Cue")
        self.timeline.heading("media", text="Content")
        self.timeline.heading("repeat", text="Repeat")
        self.timeline.column("name", width=180, anchor="w")
        self.timeline.column("media", width=160, anchor="w")
        self.timeline.column("repeat", width=70, anchor="center")
        self.timeline.grid(row=0, column=0, sticky="nsew")
        self.timeline.bind("<<TreeviewSelect>>", self.on_timeline_select)
        self.timeline.bind("<Double-1>", lambda _event: self.run_selected_cue())

        timeline_scroll = ttk.Scrollbar(timeline_frame, orient="vertical", command=self.timeline.yview)
        timeline_scroll.grid(row=0, column=1, sticky="ns")
        self.timeline.configure(yscrollcommand=timeline_scroll.set)

        detail_frame = ttk.Frame(self.root, padding=(5, 0, 10, 10))
        detail_frame.grid(row=1, column=1, sticky="nsew", pady=(10, 0))
        detail_frame.columnconfigure(0, weight=1)
        detail_frame.columnconfigure(1, weight=1)
        detail_frame.rowconfigure(1, weight=1)

        editor = ttk.LabelFrame(detail_frame, text="Cue Details", padding=10)
        editor.grid(row=0, column=0, sticky="nsew")
        editor.columnconfigure(1, weight=1)

        self.name_var = tk.StringVar()
        self.repeat_var = tk.BooleanVar()
        self.audio_var = tk.StringVar()
        self.video_var = tk.StringVar()

        ttk.Label(editor, text="Cue Name").grid(row=0, column=0, sticky="w")
        name_entry = ttk.Entry(editor, textvariable=self.name_var)
        name_entry.grid(row=0, column=1, sticky="ew", padx=(8, 0))

        ttk.Checkbutton(editor, text="Repeat until stopped", variable=self.repeat_var).grid(
            row=1, column=0, columnspan=2, sticky="w", pady=(10, 0)
        )

        ttk.Label(editor, text="Audio").grid(row=2, column=0, sticky="w", pady=(10, 0))
        audio_row = ttk.Frame(editor)
        audio_row.grid(row=2, column=1, sticky="ew", padx=(8, 0), pady=(10, 0))
        audio_row.columnconfigure(0, weight=1)
        ttk.Entry(audio_row, textvariable=self.audio_var).grid(row=0, column=0, sticky="ew")
        ttk.Button(audio_row, text="Browse", command=self.pick_audio).grid(row=0, column=1, padx=(6, 0))

        ttk.Label(editor, text="Video").grid(row=3, column=0, sticky="w", pady=(10, 0))
        video_row = ttk.Frame(editor)
        video_row.grid(row=3, column=1, sticky="ew", padx=(8, 0), pady=(10, 0))
        video_row.columnconfigure(0, weight=1)
        ttk.Entry(video_row, textvariable=self.video_var).grid(row=0, column=0, sticky="ew")
        ttk.Button(video_row, text="Browse", command=self.pick_video).grid(row=0, column=1, padx=(6, 0))

        ttk.Label(editor, text="Notes").grid(row=4, column=0, sticky="nw", pady=(10, 0))
        self.note_text = tk.Text(editor, wrap="word", height=12)
        self.note_text.grid(row=4, column=1, sticky="nsew", padx=(8, 0), pady=(10, 0))
        editor.rowconfigure(4, weight=1)

        action_row = ttk.Frame(editor)
        action_row.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        ttk.Button(action_row, text="Apply Changes", command=self.apply_editor_changes).pack(side="left")
        ttk.Button(action_row, text="Duplicate Cue", command=self.duplicate_selected).pack(side="left", padx=(6, 0))

        monitor = ttk.LabelFrame(detail_frame, text="Preview / Output Monitor", padding=10)
        monitor.grid(row=0, column=1, rowspan=2, sticky="nsew", padx=(10, 0))
        monitor.columnconfigure(0, weight=1)
        monitor.rowconfigure(0, weight=4)
        monitor.rowconfigure(1, weight=0)

        self.preview_surface = VideoSurface(monitor, "Control Preview")
        self.preview_surface.frame.grid(row=0, column=0, sticky="nsew")

        meter_frame = ttk.LabelFrame(monitor, text="Audio Output / VU Meter", padding=10)
        meter_frame.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        meter_frame.columnconfigure(0, weight=1)
        self.meter = ttk.Progressbar(meter_frame, orient="horizontal", mode="determinate", maximum=100)
        self.meter.grid(row=0, column=0, sticky="ew")
        self.meter_label = ttk.Label(meter_frame, text="No active audio")
        self.meter_label.grid(row=1, column=0, sticky="w", pady=(6, 0))

        status_bar = ttk.Label(self.root, textvariable=self.status_var, anchor="w", padding=(10, 6))
        status_bar.grid(row=2, column=0, columnspan=2, sticky="ew")

    def _build_menu(self) -> None:
        menubar = tk.Menu(self.root)

        file_menu = tk.Menu(menubar, tearoff=False)
        file_menu.add_command(label="Load Show", command=self.load_project)
        file_menu.add_command(label="Save Show", command=self.save_project)
        file_menu.add_command(label="Load Last", command=self.load_last_project)
        menubar.add_cascade(label="File", menu=file_menu)

        edit_menu = tk.Menu(menubar, tearoff=False)
        edit_menu.add_command(label="Add Cue", command=self.add_cue)
        edit_menu.add_command(label="Duplicate Cue", command=self.duplicate_selected)
        edit_menu.add_command(label="Delete Cue", command=self.delete_selected_cue)
        edit_menu.add_separator()
        edit_menu.add_command(label="Move Up", command=lambda: self.move_selected(-1))
        edit_menu.add_command(label="Move Down", command=lambda: self.move_selected(1))
        menubar.add_cascade(label="Edit", menu=edit_menu)

        view_menu = tk.Menu(menubar, tearoff=False)
        view_menu.add_command(label="Show Stage Window", command=self.stage_window.show)
        view_menu.add_command(label="Hide Stage Window", command=self.stage_window.hide)
        view_menu.add_command(label="Fullscreen", command=self.stage_window.toggle_fullscreen)
        menubar.add_cascade(label="View", menu=view_menu)

        help_menu = tk.Menu(menubar, tearoff=False)
        help_menu.add_command(label="Documentation", command=self.open_documentation)
        help_menu.add_command(label="About", command=self.show_about)
        menubar.add_cascade(label="Help", menu=help_menu)

        self.root.config(menu=menubar)

    def _load_settings(self) -> None:
        if not self.settings_path.exists():
            return
        try:
            payload = json.loads(self.settings_path.read_text(encoding="utf-8"))
            self.last_show_path = payload.get("last_show_path")
        except Exception as exc:
            log_error(f"Failed to load settings '{self.settings_path}'", exc)

    def _save_settings(self) -> None:
        payload = {"last_show_path": self.last_show_path or ""}
        try:
            self.settings_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except Exception as exc:
            log_error(f"Failed to save settings '{self.settings_path}'", exc)

    def open_documentation(self) -> None:
        try:
            webbrowser.open(DOCUMENTATION_URL)
        except Exception as exc:
            log_error("Failed to open documentation link", exc)

    def show_about(self) -> None:
        messagebox.showinfo(
            "About",
            f"{APP_TITLE}\nVersion {APP_VERSION}\nDocumentation: {DOCUMENTATION_URL}",
        )

    def _load_or_seed_project(self) -> None:
        if self.project_path.exists():
            self._load_from_file(self.project_path)
        else:
            self.cues = [
                Cue(name="Preset / House Open", note="Opening note to FOH and backstage."),
                Cue(name="Intro Music", audio_path="", note="Warm intro loop for audience seating.", repeat=True),
                Cue(name="Show Opener", video_path="", note="First stage video feed."),
            ]

    def show_status(self, text: str) -> None:
        self.status_var.set(text)

    def refresh_timeline(self) -> None:
        current_selection = None if self.selected_index is None else str(self.selected_index)
        for item in self.timeline.get_children():
            self.timeline.delete(item)
        for index, cue in enumerate(self.cues):
            values = (cue.name, cue.media_summary, "Yes" if cue.repeat else "No")
            self.timeline.insert("", "end", iid=str(index), values=values)
        if current_selection is not None and self.timeline.exists(current_selection):
            self.timeline.selection_set(current_selection)
            self.timeline.see(current_selection)
        elif self.cues:
            self.timeline.selection_set("0")
            self.on_timeline_select()
        else:
            self.selected_index = None
            self.clear_editor()

    def on_timeline_select(self, _event=None) -> None:
        selection = self.timeline.selection()
        if not selection:
            return
        self.selected_index = int(selection[0])
        cue = self.cues[self.selected_index]
        self.name_var.set(cue.name)
        self.repeat_var.set(cue.repeat)
        self.audio_var.set(cue.audio_path)
        self.video_var.set(cue.video_path)
        self.note_text.delete("1.0", "end")
        self.note_text.insert("1.0", cue.note)
        self.show_status(f"Selected cue: {cue.name}")

    def clear_editor(self) -> None:
        self.name_var.set("")
        self.repeat_var.set(False)
        self.audio_var.set("")
        self.video_var.set("")
        self.note_text.delete("1.0", "end")

    def add_cue(self) -> None:
        cue = Cue(name=f"Cue {len(self.cues) + 1}")
        self.cues.append(cue)
        self.selected_index = len(self.cues) - 1
        self.refresh_timeline()
        self.timeline.selection_set(str(self.selected_index))
        self.on_timeline_select()

    def duplicate_selected(self) -> None:
        cue = self.get_selected_cue()
        if cue is None:
            return
        new_cue = Cue(
            name=f"{cue.name} Copy",
            note=cue.note,
            audio_path=cue.audio_path,
            video_path=cue.video_path,
            repeat=cue.repeat,
        )
        insert_at = (self.selected_index or 0) + 1
        self.cues.insert(insert_at, new_cue)
        self.selected_index = insert_at
        self.refresh_timeline()

    def delete_selected_cue(self) -> None:
        if self.selected_index is None or not self.cues:
            return
        deleted = self.cues.pop(self.selected_index)
        if self.running_index == self.selected_index:
            self.stop_current_cue()
        if self.selected_index >= len(self.cues):
            self.selected_index = len(self.cues) - 1 if self.cues else None
        self.refresh_timeline()
        self.show_status(f"Deleted cue: {deleted.name}")

    def move_selected(self, delta: int) -> None:
        if self.selected_index is None:
            return
        new_index = self.selected_index + delta
        if new_index < 0 or new_index >= len(self.cues):
            return
        self.cues[self.selected_index], self.cues[new_index] = self.cues[new_index], self.cues[self.selected_index]
        self.selected_index = new_index
        self.refresh_timeline()

    def apply_editor_changes(self) -> None:
        cue = self.get_selected_cue()
        if cue is None:
            return
        cue.name = self.name_var.get().strip() or "Untitled Cue"
        cue.repeat = self.repeat_var.get()
        cue.audio_path = self.audio_var.get().strip()
        cue.video_path = self.video_var.get().strip()
        cue.note = self.note_text.get("1.0", "end").strip()
        self.refresh_timeline()
        self.show_status(f"Updated cue: {cue.name}")

    def pick_audio(self) -> None:
        path = filedialog.askopenfilename(
            title="Select audio file",
            filetypes=[("Audio Files", "*.wav *.mp3 *.ogg *.flac *.m4a"), ("All Files", "*.*")],
        )
        if path:
            self.audio_var.set(path)

    def pick_video(self) -> None:
        path = filedialog.askopenfilename(
            title="Select video file",
            filetypes=[("Video Files", "*.mp4 *.mov *.avi *.mkv"), ("All Files", "*.*")],
        )
        if path:
            self.video_var.set(path)

    def get_selected_cue(self) -> Optional[Cue]:
        if self.selected_index is None or self.selected_index >= len(self.cues):
            return None
        return self.cues[self.selected_index]

    def run_selected_cue(self) -> None:
        cue = self.get_selected_cue()
        if cue is None:
            return
        self.sequence_mode = False
        self._run_cue(self.selected_index, cue)

    def run_sequence(self) -> None:
        if self.selected_index is None:
            if not self.cues:
                return
            self.selected_index = 0
        cue = self.get_selected_cue()
        if cue is None:
            return
        self.sequence_mode = True
        self._run_cue(self.selected_index, cue)

    def run_next_cue(self) -> None:
        if not self.cues:
            return
        current_index = self.running_index if self.running_index is not None else self.selected_index
        next_index = 0 if current_index is None else min(len(self.cues) - 1, current_index + 1)
        self.sequence_mode = False
        self._select_and_run(next_index)

    def rollback_cue(self) -> None:
        if not self.cues:
            return
        current_index = self.running_index if self.running_index is not None else self.selected_index
        prev_index = 0 if current_index is None else max(0, current_index - 1)
        self.sequence_mode = False
        self._select_and_run(prev_index)

    def _select_and_run(self, index: int) -> None:
        self.stop_current_cue()
        self.selected_index = index
        self.timeline.selection_set(str(index))
        self.timeline.see(str(index))
        self.on_timeline_select()
        self.run_selected_cue()

    def _run_cue(self, index: int, cue: Cue) -> None:
        self.apply_editor_changes()
        cue = self.cues[index]
        self.running_index = index

        started_audio = False
        if cue.audio_path:
            started_audio = self.audio_mixer.play(cue)
            if not self.audio_mixer.available and self.audio_mixer.last_error:
                self.show_status(f"Audio disabled: {self.audio_mixer.last_error}")

        started_video = False
        if cue.video_path:
            started_video = self.preview_surface.load_and_play(cue.video_path, loop=cue.repeat)
            self.stage_window.surface.load_and_play(cue.video_path, loop=cue.repeat)
            self.current_video_cue_id = cue.id
            self.current_video_started_at = time.time()
            if not self.preview_surface.available and self.preview_surface.last_error:
                self.show_status(f"Video preview disabled: {self.preview_surface.last_error}")
        elif cue.note:
            self.preview_surface.status_var.set(cue.note)
            self.stage_window.surface.status_var.set(cue.note)

        self._schedule_media_diagnostics(cue)

        if cue.repeat and not cue.audio_path and cue.video_path:
            self.show_status(f"Running repeating video cue: {cue.name}")
        elif cue.repeat and cue.audio_path:
            self.show_status(f"Running looping cue: {cue.name}")
        elif cue.audio_path or cue.video_path:
            media = []
            if cue.audio_path:
                media.append("audio ready" if started_audio else "audio pending")
            if cue.video_path:
                media.append("video ready" if started_video else "video pending")
            self.show_status(f"Running cue: {cue.name} ({', '.join(media)})")
        else:
            self.show_status(f"Running cue: {cue.name}")

    def stop_current_cue(self) -> None:
        if self.running_index is None or self.running_index >= len(self.cues):
            return
        cue = self.cues[self.running_index]
        self.audio_mixer.stop(cue)
        if cue.video_path and self.current_video_cue_id == cue.id:
            self.preview_surface.stop()
            self.stage_window.surface.stop()
            self.current_video_cue_id = None
        self.sequence_mode = False
        self.running_index = None
        self.show_status(f"Stopped cue: {cue.name}")

    def stop_all(self) -> None:
        self.audio_mixer.stop_all()
        self.preview_surface.stop()
        self.stage_window.surface.stop()
        self.running_index = None
        self.sequence_mode = False
        self.current_video_cue_id = None
        self.show_status("All playback stopped")

    def _poll_playback(self) -> None:
        self._update_meter()
        self._check_video_loop()
        self._check_sequence_advance()
        self.root.after(200, self._poll_playback)

    def _update_meter(self) -> None:
        level = self.audio_mixer.estimate_level()
        self.meter["value"] = int(level * 100)
        active = self.audio_mixer.active_audio_count()
        if active:
            self.meter_label.config(text=f"{active} audio layer(s) active")
        elif self.audio_mixer.available:
            self.meter_label.config(text="No active audio")
        else:
            self.meter_label.config(text="Install VLC + python-vlc for audio playback")

    def _check_video_loop(self) -> None:
        if self.running_index is None or self.running_index >= len(self.cues):
            return
        cue = self.cues[self.running_index]
        if not cue.video_path or not cue.repeat:
            return

        preview_playing = self.preview_surface.is_playing()
        if self.preview_surface.available and not preview_playing:
            self.preview_surface.load_and_play(cue.video_path, loop=True)
            self.stage_window.surface.load_and_play(cue.video_path, loop=True)

    def _check_sequence_advance(self) -> None:
        if not self.sequence_mode or self.running_index is None:
            return
        cue = self.cues[self.running_index]
        if cue.repeat:
            return

        audio_done = True
        if cue.audio_path and self.audio_mixer.available:
            audio_done = not self.audio_mixer.is_cue_active(cue.id)

        video_done = True
        if cue.video_path and self.preview_surface.available:
            video_done = not self.preview_surface.is_playing()

        if cue.audio_path and not self.audio_mixer.available:
            audio_done = True
        if cue.video_path and not self.preview_surface.available:
            video_done = True

        if audio_done and video_done:
            next_index = self.running_index + 1
            if next_index < len(self.cues):
                self.running_index = next_index
                self.timeline.selection_set(str(next_index))
                self.timeline.see(str(next_index))
                self.on_timeline_select()
                self._run_cue(next_index, self.cues[next_index])
            else:
                self.sequence_mode = False
                self.running_index = None
                self.show_status("Sequence finished")

    def save_project(self) -> None:
        self.apply_editor_changes()
        path = filedialog.asksaveasfilename(
            title="Save show file",
            initialfile=PROJECT_FILE,
            defaultextension=".json",
            filetypes=[("JSON Files", "*.json"), ("All Files", "*.*")],
        )
        if not path:
            return
        target = Path(path)
        self._save_to_file(target)
        self.last_show_path = str(target)
        self._save_settings()

    def load_project(self) -> None:
        path = filedialog.askopenfilename(
            title="Load show file",
            filetypes=[("JSON Files", "*.json"), ("All Files", "*.*")],
        )
        if not path:
            return
        target = Path(path)
        self._load_from_file(target)
        self.refresh_timeline()
        self.show_status(f"Loaded show: {path}")
        self.last_show_path = str(target)
        self._save_settings()

    def load_last_project(self) -> None:
        if not self.last_show_path:
            self.show_status("No last show recorded")
            return
        target = Path(self.last_show_path)
        if not target.exists():
            self.show_status(f"Last show not found: {target}")
            return
        self._load_from_file(target)
        self.refresh_timeline()
        self.show_status(f"Loaded last show: {target}")

    def _save_to_file(self, path: Path) -> None:
        payload = {"cues": [asdict(cue) for cue in self.cues]}
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self.show_status(f"Saved show: {path}")

    def _load_from_file(self, path: Path) -> None:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            cues = [Cue(**item) for item in payload.get("cues", [])]
            self.cues = cues or [Cue(name="Cue 1")]
            self.project_path = path
        except Exception as exc:
            log_error(f"Failed to load show file '{path}'", exc)
            messagebox.showerror("Load failed", f"Could not load show file:\n{exc}")

    def close(self) -> None:
        self.stop_all()
        self.audio_mixer.close()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    style = ttk.Style(root)
    if "vista" in style.theme_names():
        style.theme_use("vista")
    app = CueApp(root)
    root.protocol("WM_DELETE_WINDOW", app.close)
    root.mainloop()


if __name__ == "__main__":
    main()
