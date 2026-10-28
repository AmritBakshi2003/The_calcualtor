"""Image preprocessing subsystem (OpenCV).

Pipeline stage order — each matches a mandatory pipeline step check:

Step 1  load the asset from a filesystem path or binary buffer (.jpg/.jpeg/.png)
Step 2  grayscale -> dynamic INTER_CUBIC upscale -> Gaussian adaptive
        thresholding -> structural verification of the processed matrix

Heavy dependencies (cv2, numpy) are imported lazily inside functions so the
pure-python modules (expression evaluation, sanitising) stay importable in
environments without OpenCV.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .exceptions import AssetError, PreprocessingError

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

#: Longest side the image is upscaled towards. Real-world handwritten photos
#: frequently arrive at ~720-1080 px; one line of digits then occupies too few
#: pixels for reliable stroke classification, so we upscale before thresholding.
TARGET_LONG_SIDE = 1200
#: Hard cap on the scale factor: bounding memory use on hostile/patological
#: inputs (e.g. a 64 x 4 favicon would otherwise grow to enormous canvases).
MAX_UPSCALE_FACTOR = 4.0
#: Oversized inputs are downscaled to keep thresholding tractable.
MAX_LONG_SIDE = 4000
#: Gaussian-window adaptive threshold constants (odd block size, local mean
#: minus a constant C) tuned for pen strokes over uneven lighting and shadows.
ADAPTIVE_BLOCK_SIZE = 35
ADAPTIVE_C = 11


@dataclass(frozen=True)
class PreprocessedImage:
    """Verified preprocessing artefacts handed to the OCR stage."""

    original: "object"  # np.ndarray (BGR/gray); typed loosely to avoid numpy import at module load
    grayscale: "object"  # np.ndarray uint8 2-D
    upscaled: "object"  # np.ndarray uint8 2-D
    binary: "object"  # np.ndarray uint8 2-D {0, 255}
    scale_factor: float

    @property
    def width(self) -> int:
        return int(self.binary.shape[1])

    @property
    def height(self) -> int:
        return int(self.binary.shape[0])


def validate_source(source: os.PathLike | str | bytes) -> None:
    """Cheap pre-flight so unreadable assets fail with a meaningful error."""
    if isinstance(source, (str, os.PathLike)):
        path = Path(source)
        if not path.is_file():
            raise AssetError(f"Image file not found: {path}")
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise AssetError(
                f"Unsupported image format {path.suffix or '(none)'}: "
                f"expected one of {sorted(SUPPORTED_EXTENSIONS)}"
            )
    elif not isinstance(source, (bytes, bytearray)):
        raise AssetError(f"Unsupported image source type: {type(source).__name__}")


def load_image(source: os.PathLike | str | bytes) -> "object":
    """Step 1 — decode the asset. Raises AssetError on any failure."""
    import cv2
    import numpy as np

    validate_source(source)

    if isinstance(source, (bytes, bytearray)):
        buffer = np.frombuffer(bytearray(source), dtype=np.uint8)
        image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        if image is None:
            raise AssetError(
                "Binary image buffer could not be decoded as JPEG/PNG "
                "(file corrupt, truncated, or not an image)."
            )
        return image

    path = Path(source)
    # cv2.imread returns None (not an exception) on unreadable assets.
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise AssetError(f"Image could not be read (corrupt or unsupported): {path}")
    return image


def to_grayscale(image: "object") -> "object":
    """Convert the decoded image to a single-channel grayscale matrix."""
    import cv2
    import numpy as np

    if image is None or getattr(image, "size", 0) == 0:
        raise PreprocessingError("Image matrix is empty before conversion.")
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def dynamic_upscale(grayscale: "object") -> tuple["object", float]:
    """Upscale the grayscale matrix so digit strokes meet pixel criteria.

    Uses cv2.INTER_CUBIC — smooth interpolation keeps the relative thickness
    of pen strokes after enlargement. Returns the resampled matrix and the
    applied scale factor (1.0 means untouched).
    """
    import cv2

    gray = grayscale
    long_side = max(gray.shape[0], gray.shape[1])
    scale = 1.0

    if long_side < TARGET_LONG_SIDE:
        scale = min(TARGET_LONG_SIDE / long_side, MAX_UPSCALE_FACTOR)
    elif long_side > MAX_LONG_SIDE:
        # Downscale near-flat so per-pixel work stays tractable.
        scale = MAX_LONG_SIDE / long_side

    if abs(scale - 1.0) < 1e-3:
        return gray, 1.0

    new_width = max(1, int(round(gray.shape[1] * scale)))
    new_height = max(1, int(round(gray.shape[0] * scale)))
    resized = cv2.resize(gray, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
    return resized, scale


def apply_adaptive_threshold(grayscale: "object") -> "object":
    """Binary-clean the matrix with a Gaussian-window adaptive threshold.

    Adaptive (rather than global) thresholding removes uneven lighting,
    camera shadows and background noise pixel-locally, which is what hand
    photos on desks need.
    """
    import cv2

    return cv2.adaptiveThreshold(
        grayscale,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        ADAPTIVE_BLOCK_SIZE,
        ADAPTIVE_C,
    )


def verify_matrix(grayscale: "object", binary: "object") -> None:
    """Step 2 — structural consistency check. Raises PreprocessingError."""
    import numpy as np

    if grayscale is None or getattr(grayscale, "size", 0) == 0:
        raise PreprocessingError("Preprocessed grayscale matrix is empty.")
    if grayscale.ndim != 2:
        raise PreprocessingError(
            f"Grayscale matrix must be single-channel, got ndim={grayscale.ndim}."
        )

    values = np.unique(grayscale)
    if values.size < 2:
        raise PreprocessingError(
            "Preprocessed matrix is flat (single grey level) — no high-contrast "
            "data to extract. Retake the image with even lighting."
        )

    binary_values = set(np.unique(binary).tolist())
    if binary_values != {0, 255}:
        raise PreprocessingError(
            "Adaptive threshold did not produce a clean binary matrix with ink "
            "and paper classes (unique values: " + str(sorted(binary_values)[:8]) + ")."
        )
    if not np.any(binary == 0):
        raise PreprocessingError(
            "Binary matrix contains no ink — the threshold erased everything. "
            "Retake the image with stronger contrast."
        )


def build_preprocessed_image(source: os.PathLike | str | bytes) -> PreprocessedImage:
    """Run the full preprocessing sequence and verify it (Steps 1-2)."""
    original = load_image(source)  # Step 1
    grayscale = to_grayscale(original)
    upscaled, scale_factor = dynamic_upscale(grayscale)
    binary = apply_adaptive_threshold(upscaled)
    verify_matrix(grayscale, binary)  # Step 2
    return PreprocessedImage(
        original=original,
        grayscale=grayscale,
        upscaled=upscaled,
        binary=binary,
        scale_factor=scale_factor,
    )
