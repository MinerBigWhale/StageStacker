from .base_cue import Cue


class ImageCue(Cue):
    def __init__(self, name: str, id: int = None, **kwargs):
        super().__init__(name, id, **kwargs)
        self.file_path = kwargs.get('file_path', "")

    @property
    def media_summary(self) -> str:
        return "Image"

    def to_dict(self):
        d = super().to_dict()
        d["file_path"] = self.file_path
        return d

    def get_media_info(self) -> str:
        # Placeholder: in real app, extract resolution, format, etc.
        return f"File: {self.file_path}\nResolution: N/A\nFormat: N/A"