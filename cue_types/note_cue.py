from .base_cue import Cue


class NoteCue(Cue):
    def __init__(self, name: str, id: int = None, **kwargs):
        super().__init__(name, id, **kwargs)
        self.note = kwargs.get('note', "")

    @property
    def media_summary(self) -> str:
        return "Note"

    def to_dict(self):
        d = super().to_dict()
        d["note"] = self.note
        return d