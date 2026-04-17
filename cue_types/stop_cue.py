from .base_cue import Cue, CueExecutionContext


class StopCue(Cue):
    @property
    def media_summary(self) -> str:
        return "Stop"

    def _execute(self, context: CueExecutionContext) -> None:
        context.stop_all_playback()
        context.show_status(f"Stop cue: {self.name}")
