from .base_cue import Cue


class FadeCue(Cue):
    @property
    def media_summary(self) -> str:
        return "Fade"