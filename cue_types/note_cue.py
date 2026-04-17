from .base_cue import Cue, CueExecutionContext, FieldSpec, TabSpec


class NoteCue(Cue):
    @classmethod
    def cue_editor_tabs(cls) -> tuple[TabSpec, ...]:
        return (
            TabSpec(
                "note",
                "Note",
                (
                    FieldSpec("note", "Note", widget="text", default="", text_height=8),
                ),
            ),
        )

    @property
    def media_summary(self) -> str:
        return "Note"

    def _execute(self, context: CueExecutionContext) -> None:
        context.show_text(self.note)
        context.show_status(f"Running note cue: {self.name}")
