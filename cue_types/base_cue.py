import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    widget: str = "entry"
    default: Any = ""
    options: tuple[str, ...] = ()
    min_value: int = 0
    max_value: int = 100
    width: int = 12
    text_height: int = 8
    filetypes: tuple[tuple[str, str], ...] = ()
    persist: bool = True


@dataclass(frozen=True)
class TabSpec:
    key: str
    title: str
    fields: tuple[FieldSpec, ...]


class CueExecutionContext:
    def __init__(self, app) -> None:
        self.app = app

    @property
    def audio_mixer(self):
        return self.app.audio_mixer

    @property
    def preview_surface(self):
        return self.app.preview_surface

    @property
    def stage_surface(self):
        return self.app.stage_window.surface

    def show_status(self, text: str) -> None:
        self.app.show_status(text)

    def stop_all_playback(self) -> None:
        self.audio_mixer.stop_all()
        self.preview_surface.stop()
        self.stage_surface.stop()
        self.app.current_video_cue_id = None
        self.app.active_cue_ids.clear()
        self.app._cancel_scheduled_runs()

    def stop_video_playback(self) -> None:
        self.preview_surface.stop()
        self.stage_surface.stop()
        self.app.current_video_cue_id = None
        self.app._clear_video_activity()

    def stop_audio_playback(self) -> None:
        self.audio_mixer.stop_all()

    def play_video(self, cue: "Cue") -> bool:
        started_video = self.preview_surface.load_and_play(cue.file_path, loop=cue.repeat)
        self.stage_surface.load_and_play(cue.file_path, loop=cue.repeat)
        self.app.current_video_cue_id = cue.id
        self.app.current_video_started_at = time.time()
        return started_video

    def stop_video_if_current(self, cue: "Cue") -> None:
        if self.app.current_video_cue_id == cue.id:
            self.stop_video_playback()

    def play_audio(self, cue: "Cue") -> bool:
        return self.audio_mixer.play(cue)

    def stop_audio(self, cue: "Cue") -> None:
        self.audio_mixer.stop(cue)

    def show_image(self, path: str) -> None:
        self.preview_surface.status_var.set(f"Image: {path}")
        self.stage_surface.status_var.set(f"Image: {path}")

    def show_text(self, text: str) -> None:
        self.preview_surface.status_var.set(text)
        self.stage_surface.status_var.set(text)


class Cue:
    cue_classes: Dict[str, type] = {}
    TYPE = "base"

    _COMMON_FIELDS = (
        TabSpec(
            "general",
            "General",
            (
                FieldSpec("name", "Name", default="Untitled Cue"),
            ),
        ),
        TabSpec(
            "timings",
            "Timings",
            (
                FieldSpec("stop_audio", "Stop Audio", widget="checkbox", default=False),
                FieldSpec("stop_video", "Stop Video", widget="checkbox", default=False),
                FieldSpec(
                    "trigger",
                    "Trigger",
                    widget="combobox",
                    default="manually",
                    options=("manually", "with previous", "after previous"),
                ),
                FieldSpec("delay_min", "Delay (min)", widget="spinbox", default=0, min_value=0, max_value=59),
                FieldSpec("delay_sec", "Delay (sec)", widget="spinbox", default=0, min_value=0, max_value=59),
                FieldSpec("delay_ms", "Delay (ms)", widget="spinbox", default=0, min_value=0, max_value=999),
                FieldSpec("repeat", "Repeat", widget="checkbox", default=False),
            ),
        ),
    )
    _COMMON_KEYS = {"name", "stop_audio", "stop_video", "trigger", "delay_min", "delay_sec", "delay_ms", "repeat"}

    def __init__(self, name: str, id: int = None, **kwargs):
        self.name = name
        self.id = id or int(time.time() * 1000)
        self.stop_audio = kwargs.get("stop_audio", False)
        self.stop_video = kwargs.get("stop_video", False)
        self.trigger = kwargs.get("trigger", "manually")
        self.delay_min = kwargs.get("delay_min", 0)
        self.delay_sec = kwargs.get("delay_sec", 0)
        self.delay_ms = kwargs.get("delay_ms", 0)
        self.repeat = kwargs.get("repeat", False)
        self._initialize_custom_fields(kwargs)

    @property
    def type(self) -> str:
        return self.TYPE

    @property
    def media_summary(self) -> str:
        return self.type.title()

    @property
    def audio_path(self) -> str:
        return ""

    @property
    def video_path(self) -> str:
        return ""

    @property
    def image_path(self) -> str:
        return ""

    @classmethod
    def editor_tabs(cls) -> tuple[TabSpec, ...]:
        return cls._COMMON_FIELDS + cls.cue_editor_tabs()

    @classmethod
    def cue_editor_tabs(cls) -> tuple[TabSpec, ...]:
        return ()

    @classmethod
    def iter_editor_fields(cls, persist_only: bool = False):
        for tab in cls.editor_tabs():
            for field in tab.fields:
                if persist_only and not field.persist:
                    continue
                yield field

    def _initialize_custom_fields(self, payload: Dict[str, Any]) -> None:
        for field in self.iter_editor_fields(persist_only=True):
            if field.key in self._COMMON_KEYS:
                continue
            setattr(self, field.key, payload.get(field.key, field.default))

    def editor_state(self) -> Dict[str, Any]:
        state = {
            "name": self.name,
            "stop_audio": self.stop_audio,
            "stop_video": self.stop_video,
            "trigger": self.trigger,
            "delay_min": self.delay_min,
            "delay_sec": self.delay_sec,
            "delay_ms": self.delay_ms,
            "repeat": self.repeat,
        }
        for field in self.iter_editor_fields(persist_only=True):
            if field.key in self._COMMON_KEYS:
                continue
            state[field.key] = getattr(self, field.key, field.default)
        return state

    def apply_editor_state(self, state: Dict[str, Any]) -> None:
        self.name = str(state.get("name", self.name)).strip() or "Untitled Cue"
        self.stop_audio = bool(state.get("stop_audio", self.stop_audio))
        self.stop_video = bool(state.get("stop_video", self.stop_video))
        self.trigger = state.get("trigger", self.trigger)
        self.delay_min = int(state.get("delay_min", self.delay_min))
        self.delay_sec = int(state.get("delay_sec", self.delay_sec))
        self.delay_ms = int(state.get("delay_ms", self.delay_ms))
        self.repeat = bool(state.get("repeat", self.repeat))
        for field in self.iter_editor_fields(persist_only=True):
            if field.key in self._COMMON_KEYS:
                continue
            setattr(self, field.key, state.get(field.key, getattr(self, field.key, field.default)))

    def get_editor_display_value(self, key: str) -> str:
        if key == "media_info":
            return self.get_media_info()
        value = self.editor_state().get(key, "")
        return "" if value is None else str(value)

    def get_media_info(self) -> str:
        return ""

    @property
    def delay_total_ms(self) -> int:
        return max(0, (((self.delay_min * 60) + self.delay_sec) * 1000) + self.delay_ms)

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "name": self.name,
            "type": self.type,
            "id": self.id,
            "stop_audio": self.stop_audio,
            "stop_video": self.stop_video,
            "trigger": self.trigger,
            "delay_min": self.delay_min,
            "delay_sec": self.delay_sec,
            "delay_ms": self.delay_ms,
            "repeat": self.repeat,
        }
        for field in self.iter_editor_fields(persist_only=True):
            if field.key in self._COMMON_KEYS:
                continue
            payload[field.key] = getattr(self, field.key, field.default)
        return payload

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Cue":
        type_name = data.get("type", "video")
        cue_class = cls.cue_classes.get(type_name, cls)
        kwargs = {key: value for key, value in data.items() if key not in {"name", "id", "type"}}
        cue = cue_class(data.get("name", "Untitled Cue"), data.get("id"), **kwargs)
        cue.apply_editor_state(data)
        return cue

    @classmethod
    def register(cls, type_name: str, cue_class: type):
        cue_class.TYPE = type_name
        cls.cue_classes[type_name] = cue_class

    @classmethod
    def create(cls, type_name: str, name: str, id: int = None, **kwargs) -> "Cue":
        cue_class = cls.cue_classes.get(type_name, cls)
        return cue_class(name, id, **kwargs)

    @classmethod
    def available_types(cls) -> list[str]:
        return list(cls.cue_classes.keys())

    def copy_into(self, other: "Cue", include_id: bool = True) -> None:
        shared_state = self.editor_state()
        if include_id:
            other.id = self.id
        other.apply_editor_state(shared_state)
        for field in other.iter_editor_fields(persist_only=True):
            if field.key in self._COMMON_KEYS:
                continue
            if hasattr(self, field.key):
                setattr(other, field.key, getattr(self, field.key))

    def execute(self, context: CueExecutionContext) -> None:
        if self.stop_audio:
            context.stop_audio_playback()
        if self.stop_video:
            context.stop_video_playback()
        self._execute(context)

    def _execute(self, context: CueExecutionContext) -> None:
        context.show_status(f"Running cue: {self.name}")

    def stop(self, context: CueExecutionContext) -> None:
        return

    def is_finished(self, context: CueExecutionContext) -> bool:
        return True

    def ensure_loop(self, context: CueExecutionContext) -> None:
        return

    def active_media_rows(self, context: CueExecutionContext) -> list[tuple[str, str, str, str]]:
        return []

    @staticmethod
    def progress_text(current: float, total: float) -> str:
        if total <= 0:
            return "N/A"
        return f"{int((current / total) * 100)}%"

    @staticmethod
    def path_summary(path: str) -> str:
        return Path(path).name if path else ""
