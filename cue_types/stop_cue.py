from .base_cue import Cue


class StopCue(Cue):
    @property
    def media_summary(self) -> str:
        return "Stop"