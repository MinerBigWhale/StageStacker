from .base_cue import Cue, CueExecutionContext


class FadeCue(Cue):
    @property
    def media_summary(self) -> str:
        return "Fade"

    def _execute(self, context: CueExecutionContext) -> None:
        context.stop_video_playback()
        context.show_status(f"Fade cue: {self.name}")
