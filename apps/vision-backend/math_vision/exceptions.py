"""Package exceptions for the math vision OCR pipeline.

The pipeline runs a mandatory step-check system: each stage validates its
output before the next one starts. Domain exceptions carry a step number so
callers (CLI, HTTP handlers) can report exactly where control halted.
"""

from __future__ import annotations


class MathVisionError(Exception):
    """Base class for all math_vision pipeline failures."""


class StepCheckError(MathVisionError):
    """A mandatory pipeline step failed its integrity check.

    ``step`` is the pipeline stage number (1-6) and ``detail`` a
    human-readable explanation of what went wrong.
    """

    def __init__(self, step: int, detail: str) -> None:
        self.step = step
        self.detail = detail
        super().__init__(detail)


class AssetError(StepCheckError):
    """The image could not be loaded or is not a decodable asset."""

    def __init__(self, detail: str) -> None:
        super().__init__(step=1, detail=detail)


class PreprocessingError(StepCheckError):
    """The preprocessed matrix failed structural verification (Step 2)."""

    def __init__(self, detail: str) -> None:
        super().__init__(step=2, detail=detail)


class ExtractionQualityError(StepCheckError):
    """Tesseract produced no usable text (Step 3).

    Not usually fatal: the pipeline sets the fallback flag so the Gemini
    vision layer relies on the image alone, but the reading is still
    reported as a failed local extraction.
    """

    def __init__(self, detail: str) -> None:
        super().__init__(step=3, detail=detail)


class GeminiSyncError(StepCheckError):
    """The Gemini transmission dictionary could not be compiled (Step 4)."""

    def __init__(self, detail: str) -> None:
        super().__init__(step=4, detail=detail)


class ExpressionValidationError(StepCheckError):
    """The validated text is not a structurally valid math expression (Step 5)."""

    def __init__(self, detail: str) -> None:
        super().__init__(step=5, detail=detail)


class EvaluationError(StepCheckError):
    """The expression could not be evaluated safely (Step 6)."""

    def __init__(self, detail: str) -> None:
        super().__init__(step=6, detail=detail)


class MissingApiKeyError(MathVisionError):
    """GEMINI_API_KEY is not present in the environment.

    Raised before any model call so the process can demand authentication
    cleanly instead of sending an unauthenticated request.
    """

    def __init__(self) -> None:
        super().__init__(
            "GEMINI_API_KEY is not set. Provide your private key via the "
            "environment (e.g. `export GEMINI_API_KEY=...` or a .env file) "
            "before running the vision validation layer. Get a key at "
            "https://aistudio.google.com/apikey — never hardcode it in code."
        )
