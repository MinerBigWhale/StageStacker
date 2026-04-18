from .base_cue import Cue, CueExecutionContext, FieldSpec, TabSpec
from .media_info import describe_media_file


class VideoCue(Cue):
    @classmethod
    def cue_editor_tabs(cls) -> tuple[TabSpec, ...]:
        return (
            TabSpec(
                "content",
                "Content",
                (
                    FieldSpec(
                        "file_path",
                        "Video File",
                        widget="file",
                        default="",
                        filetypes=(("Video Files", "*.mp4 *.mov *.avi *.mkv"), ("All Files", "*.*")),
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
    def video_path(self) -> str:
        return self.file_path

    @property
    def media_summary(self) -> str:
        return self.path_summary(self.file_path) or "Video"

    def get_media_info(self) -> str:
        return describe_media_file(self.file_path)

    def _execute(self, context: CueExecutionContext) -> None:
        if not self.file_path:
            context.show_status(f"Video cue missing file: {self.name}")
            return
        context.play_video(self)
        if not context.preview_surface.available and context.preview_surface.last_error:
            context.show_status(f"Video preview disabled: {context.preview_surface.last_error}")
            return
        context.show_status(f"Running video cue: {self.name}")

    def stop(self, context: CueExecutionContext) -> None:
        context.stop_video_if_current(self)

    def is_finished(self, context: CueExecutionContext) -> bool:
        if not self.file_path or not context.preview_surface.available:
            return True
        return not context.preview_surface.is_playing()

    def ensure_loop(self, context: CueExecutionContext) -> None:
        if self.repeat and self.file_path and context.preview_surface.available and not context.preview_surface.is_playing():
            context.play_video(self)

    def active_media_rows(self, context: CueExecutionContext) -> list[tuple[str, str, str, str]]:
        if context.app.current_video_cue_id != self.id or not context.preview_surface.is_playing():
            return []
        try:
            total = context.preview_surface.player.get_length() / 1000.0
            current = context.preview_surface.position_seconds()
            progress = self.progress_text(current, total)
        except Exception:
            progress = "N/A"
        return [(self.name, "Video", progress, "Loop" if self.repeat else "")]
