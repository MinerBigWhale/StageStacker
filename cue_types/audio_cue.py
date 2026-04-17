from .base_cue import Cue


class AudioCue(Cue):
    def __init__(self, name: str, id: int = None, **kwargs):
        super().__init__(name, id, **kwargs)
        self.file_path = kwargs.get('file_path', "")

    @property
    def media_summary(self) -> str:
        return "Audio"

    def to_dict(self):
        d = super().to_dict()
        d["file_path"] = self.file_path
        return d

    def get_media_info(self) -> str:
        # Placeholder: in real app, extract duration, codec, etc.
        return f"File: {self.file_path}"