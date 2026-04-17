# Cue types package
from .base_cue import Cue
from .video_cue import VideoCue
from .image_cue import ImageCue
from .audio_cue import AudioCue
from .note_cue import NoteCue
from .stop_cue import StopCue
from .fade_cue import FadeCue

# Register all available cue classes so loaders can instantiate them dynamically.
Cue.register("video", VideoCue)
Cue.register("image", ImageCue)
Cue.register("audio", AudioCue)
Cue.register("note", NoteCue)
Cue.register("stop", StopCue)
Cue.register("fade", FadeCue)
