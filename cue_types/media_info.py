from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Any

try:
    from PIL import ExifTags, Image
except Exception:  # pragma: no cover - optional dependency
    ExifTags = None
    Image = None

try:
    from mutagen import File as MutagenFile
except Exception:  # pragma: no cover - optional dependency
    MutagenFile = None

try:
    from tinytag import TinyTag
except Exception:  # pragma: no cover - optional dependency
    TinyTag = None


def describe_media_file(path: str) -> str:
    target = Path(path)
    if not path:
        return ""
    if not target.exists():
        return f"File: {path}\nStatus: File not found"

    metadata: OrderedDict[str, str] = OrderedDict()
    _add(metadata, "File", str(target))
    _add(metadata, "Filename", target.name)
    _add(metadata, "Extension", target.suffix.lower())
    _add(metadata, "Size", _format_size(target.stat().st_size))

    _populate_tinytag(metadata, target)
    _populate_mutagen(metadata, target)
    _populate_image(metadata, target)

    return "\n".join(f"{label}: {value}" for label, value in metadata.items())


def _populate_tinytag(metadata: OrderedDict[str, str], path: Path) -> None:
    if TinyTag is None:
        return
    try:
        tag = TinyTag.get(str(path), image=False)
    except Exception:
        return

    _add(metadata, "Title", getattr(tag, "title", None))
    _add(metadata, "Author", getattr(tag, "artist", None) or getattr(tag, "albumartist", None))
    _add(metadata, "Album", getattr(tag, "album", None))
    _add(metadata, "Genre", getattr(tag, "genre", None))
    _add(metadata, "Comment", getattr(tag, "comment", None))
    _add(metadata, "Year", getattr(tag, "year", None))
    _add(metadata, "Track", getattr(tag, "track", None))
    _add(metadata, "Disc", getattr(tag, "disc", None))
    _add(metadata, "Length", _format_duration(getattr(tag, "duration", None)))
    _add(metadata, "Bit Rate", _format_kbps(getattr(tag, "bitrate", None)))
    _add(metadata, "Sample Rate", _format_hz(getattr(tag, "samplerate", None)))
    _add(metadata, "Channels", getattr(tag, "channels", None))
    _add(metadata, "BPM", getattr(tag, "bpm", None))

    for key in ("composer", "copyright", "publisher"):
        _add(metadata, key.replace("_", " ").title(), getattr(tag, key, None))

    extra = getattr(tag, "extra", None) or getattr(tag, "other", None) or {}
    if isinstance(extra, dict):
        for key, value in sorted(extra.items()):
            _add(metadata, key.replace("_", " ").title(), value)


def _populate_mutagen(metadata: OrderedDict[str, str], path: Path) -> None:
    if MutagenFile is None:
        return
    try:
        media = MutagenFile(str(path), easy=False)
    except Exception:
        return
    if media is None:
        return

    info = getattr(media, "info", None)
    if info is not None:
        _add(metadata, "Length", _format_duration(getattr(info, "length", None)))
        bitrate = getattr(info, "bitrate", None)
        if bitrate and bitrate > 10000:
            bitrate = bitrate / 1000
        _add(metadata, "Bit Rate", _format_kbps(bitrate))
        _add(metadata, "Sample Rate", _format_hz(getattr(info, "sample_rate", None)))
        _add(metadata, "Channels", getattr(info, "channels", None))
        _add(metadata, "Bits Per Sample", getattr(info, "bits_per_sample", None))
        _add(metadata, "Codec", getattr(info, "codec", None) or type(info).__name__)

    mime = getattr(media, "mime", None)
    if mime:
        _add(metadata, "Mime Type", ", ".join(mime))

    tags = getattr(media, "tags", None)
    if not tags:
        return

    known_keys = {
        "tit2": "Title",
        "title": "Title",
        "tpe1": "Author",
        "artist": "Author",
        "author": "Author",
        "talb": "Album",
        "album": "Album",
        "tcon": "Genre",
        "genre": "Genre",
        "tcop": "Copyright",
        "copyright": "Copyright",
        "tbpm": "BPM",
        "bpm": "BPM",
        "trck": "Track",
        "tracknumber": "Track",
        "tpos": "Disc",
        "discnumber": "Disc",
        "tdrc": "Year",
        "date": "Year",
        "year": "Year",
        "comm": "Comment",
        "comment": "Comment",
    }

    for raw_key in tags.keys():
        norm_key = str(raw_key).lower()
        label = known_keys.get(norm_key, raw_key if isinstance(raw_key, str) else str(raw_key))
        _add(metadata, str(label).replace("_", " ").title(), _extract_mutagen_value(tags[raw_key]))


def _populate_image(metadata: OrderedDict[str, str], path: Path) -> None:
    if Image is None:
        return
    try:
        with Image.open(path) as image:
            _add(metadata, "Format", image.format)
            _add(metadata, "Resolution", f"{image.width} x {image.height}")
            _add(metadata, "Mode", image.mode)

            dpi = image.info.get("dpi")
            if isinstance(dpi, tuple):
                _add(metadata, "DPI", f"{dpi[0]} x {dpi[1]}")

            for key, value in image.info.items():
                if key == "dpi":
                    continue
                _add(metadata, key.replace("_", " ").title(), value)

            if ExifTags is None:
                return
            exif = image.getexif()
            for key, value in exif.items():
                tag_name = ExifTags.TAGS.get(key, str(key))
                _add(metadata, tag_name.replace("_", " ").title(), value)
    except Exception:
        return


def _extract_mutagen_value(value: Any) -> Any:
    if isinstance(value, (list, tuple)):
        cleaned = [_extract_mutagen_value(item) for item in value]
        cleaned = [item for item in cleaned if item not in (None, "", [])]
        return ", ".join(str(item) for item in cleaned)
    text = getattr(value, "text", None)
    if text is not None:
        return _extract_mutagen_value(text)
    return value


def _add(metadata: OrderedDict[str, str], label: str, value: Any) -> None:
    if value in (None, "", [], (), {}):
        return
    if label in metadata:
        return
    metadata[label] = str(value)


def _format_duration(seconds: Any) -> str | None:
    if seconds in (None, ""):
        return None
    try:
        total = max(0, int(round(float(seconds))))
    except Exception:
        return str(seconds)
    minutes, secs = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:d}:{secs:02d}"


def _format_kbps(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        numeric = float(value)
    except Exception:
        return str(value)
    return f"{numeric:.0f} kbps"


def _format_hz(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        numeric = int(value)
    except Exception:
        return str(value)
    return f"{numeric} Hz"


def _format_size(size: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{size} B"
