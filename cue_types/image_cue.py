from .base_cue import Cue, CueExecutionContext, FieldSpec, TabSpec


class ImageCue(Cue):
    @classmethod
    def cue_editor_tabs(cls) -> tuple[TabSpec, ...]:
        return (
            TabSpec(
                "content",
                "Content",
                (
                    FieldSpec(
                        "file_path",
                        "Image File",
                        widget="file",
                        default="",
                        filetypes=(("Image Files", "*.png *.jpg *.jpeg *.gif *.bmp"), ("All Files", "*.*")),
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
    def image_path(self) -> str:
        return self.file_path

    @property
    def media_summary(self) -> str:
        return self.path_summary(self.file_path) or "Image"

    def get_media_info(self) -> str:
        if not self.file_path:
            return ""
        return f"File: {self.file_path}\nResolution: N/A\nFormat: N/A"

    def _execute(self, context: CueExecutionContext) -> None:
        if not self.file_path:
            context.show_status(f"Image cue missing file: {self.name}")
            return
        context.show_image(self.file_path)
        context.show_status(f"Running image cue: {self.name}")
