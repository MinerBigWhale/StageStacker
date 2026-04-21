from .base_cue import Cue, CueExecutionContext, FieldSpec, TabSpec
from .media_info import describe_media_file


class AudioCue(Cue):
    @classmethod
    def cue_editor_tabs(cls) -> tuple[TabSpec, ...]:
        return (
            TabSpec(
                "content",
                "Content",
                (
                    FieldSpec(
                        "file_path",
                        "Audio File",
                        widget="file",
                        default="",
                        filetypes=(("Audio Files", "*.wav *.mp3 *.ogg *.flac *.m4a"), ("All Files", "*.*")),
                    ),
                ),
            ),
            TabSpec(
                "info",
                "Media Info",
                (
                    FieldSpec("media_info", "Media Info", widget="info", persist=False),
                ),
            ),
        )

    @property
    def audio_path(self) -> str:
        return self.file_path

    @property
    def media_summary(self) -> str:
        return self.path_summary(self.file_path) or "Audio"

    def get_media_info(self) -> str:
        return describe_media_file(self.file_path)

    def _execute(self, context: CueExecutionContext) -> None:
        if not self.file_path:
            context.show_status(f"Audio cue missing file: {self.name}")
            return
        context.play_audio(self)
        if not context.audio_mixer.available and context.audio_mixer.last_error:
            context.show_status(f"Audio disabled: {context.audio_mixer.last_error}")
            return
        context.show_status(f"Running audio cue: {self.name}")

    def stop(self, context: CueExecutionContext) -> None:
        context.stop_audio(self)

    def is_finished(self, context: CueExecutionContext) -> bool:
        if not self.file_path or not context.audio_mixer.available:
            return True
        return not context.audio_mixer.is_cue_active(self.id)

    def ensure_loop(self, context: CueExecutionContext) -> None:
        if self.repeat and self.file_path and context.audio_mixer.available and not context.audio_mixer.is_cue_active(self.id):
            context.play_audio(self)

    def active_media_rows(self, context: CueExecutionContext) -> list[tuple[str, str, str, str]]:
        if not context.audio_mixer.is_cue_active(self.id):
            return []
        try:
            player = context.audio_mixer._players[self.id]
            total = player.get_length() / 1000.0
            current = player.get_time() / 1000.0
            progress = self.progress_text(current, total)
        except Exception:
            progress = "N/A"
        return [(self.name, "Audio", progress, "Loop" if self.repeat else "")]
