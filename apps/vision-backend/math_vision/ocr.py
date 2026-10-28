"""Local OCR parsing (PyTesseract).

Step 3 of the pipeline: feed the cleaned binary matrix to Tesseract with
Page Segmentation Mode 7 (--psm 7), treating the visual field as a single
uniform text line, and isolate the result into ``raw_tesseract_output``.
"""

from __future__ import annotations

from dataclasses import dataclass

from .exceptions import ExtractionQualityError

#: Consistent with the calculator suite scanner: read the field as ONE line.
TESSERACT_CONFIG = "--psm 7"

#: Logged instead of the empty string when Tesseract reads nothing. The
#: downstream vision agent interprets the flag as "rely entirely on your
#: visual cortex"; it is never sent to the evaluator as math.
FALLBACK_FLAG = "[Blank/Unreadable Text]"


@dataclass(frozen=True)
class OcrReading:
    """Raw local-OCR result plus a quality flag."""

    #: Exact string Tesseract extracted, whitespace-trimmed; the fallback flag
    #: when Tesseract returned nothing at all.
    raw_tesseract_output: str
    #: True when Tesseract returned blank text and the fallback flag was set.
    used_fallback: bool


def extract_text(binary: "object") -> OcrReading:
    """Run PyTesseract over the binary matrix.

    Raises ExtractionQualityError when the OCR engine itself cannot run
    (binary missing, language data unavailable). A blank reading is NOT an
    exception: it sets the fallback flag so the vision layer takes over.
    """
    import pytesseract  # imported lazily: heavy/optional dependency

    raw = pytesseract.image_to_string(binary, config=TESSERACT_CONFIG)
    text = (raw or "").strip()

    if text:
        reading = OcrReading(raw_tesseract_output=text, used_fallback=False)
    else:
        # Faint handwriting is a quality problem, not a crash: log the flag
        # and let the Gemini layer carry recognition on its own.
        reading = OcrReading(raw_tesseract_output=FALLBACK_FLAG, used_fallback=True)

    return reading
