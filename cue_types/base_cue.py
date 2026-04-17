import time
from typing import Dict, Any


class Cue:
    cue_classes: Dict[str, type] = {}

    def __init__(self, name: str, id: int = None, **kwargs):
        self.name = name
        self.id = id or int(time.time() * 1000)
        self.stop_stack = kwargs.get('stop_stack', False)
        self.stop_video_only = kwargs.get('stop_video_only', False)
        self.trigger = kwargs.get('trigger', "manually")
        self.delay_min = kwargs.get('delay_min', 0)
        self.delay_sec = kwargs.get('delay_sec', 0)
        self.delay_ms = kwargs.get('delay_ms', 0)
        self.repeat = kwargs.get('repeat', False)

    @property
    def type(self) -> str:
        return self.__class__.__name__.lower().replace("cue", "").strip()

    @property
    def media_summary(self) -> str:
        return "Base"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "id": self.id,
            "stop_stack": self.stop_stack,
            "stop_video_only": self.stop_video_only,
            "trigger": self.trigger,
            "delay_min": self.delay_min,
            "delay_sec": self.delay_sec,
            "delay_ms": self.delay_ms,
            "repeat": self.repeat,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Cue':
        type_name = data.get("type", "video")
        cue_class = cls.cue_classes.get(type_name, cls)
        kwargs = {k: v for k, v in data.items() if k not in {"name", "id", "type"}}
        cue = cue_class(data.get("name", "Untitled Cue"), data.get("id"), **kwargs)
        cue.stop_stack = data.get("stop_stack", False)
        cue.stop_video_only = data.get("stop_video_only", False)
        cue.trigger = data.get("trigger", "manually")
        cue.delay_min = data.get("delay_min", 0)
        cue.delay_sec = data.get("delay_sec", 0)
        cue.delay_ms = data.get("delay_ms", 0)
        cue.repeat = data.get("repeat", False)
        if hasattr(cue, 'file_path'):
            cue.file_path = data.get("file_path", "")
        if hasattr(cue, 'note'):
            cue.note = data.get("note", "")
        return cue

    @classmethod
    def register(cls, type_name: str, cue_class: type):
        cls.cue_classes[type_name] = cue_class