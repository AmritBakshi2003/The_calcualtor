"""Pipeline orchestration with the mandatory step-by-step verification system.

Stage map:

Step 1  Image Load          — asset readable? (.jpg/.jpeg/.png, path or bytes)
Step 2  Preprocess Verify   — grayscale matrix not empty + high-contrast binary
Step 3  Tesseract Quality   — exact string logged; blank -> fallback flag
Step 4  Gemini Sync         — visual asset + OCR payload compiled into the
                              transmission dictionary
Step 5  Structural Match    — regex check: only math characters; strip or fail
Step 6  Safe Evaluation     — isolated execution engine computes the result

Every step validates before the next one runs; a failed check halts the
pipeline with a step-tagged exception instead of continuing on bad data.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .expression_eval import enforce_structural_match, evaluate_expression, format_result
from .gemini_layer import validate_with_gemini
from .ocr import FALLBACK_FLAG, OcrReading, extract_text
from .preprocessing import PreprocessedImage, build_preprocessed_image

logger = logging.getLogger("math_vision")

DEFAULT_MIME_TYPE = "image/png"
_MIME_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

Validator = Callable[[os.PathLike | str | bytes, str, str], str]


@dataclass(frozen=True)
class StepCheck:
    """One recorded integrity check."""

    step: int
    name: str
    status: str  # "PASS", "FALLBACK" or "FAIL"
    detail: str


@dataclass
class PipelineResult:
    """Everything the pipeline learned, for logs and API responses."""

    raw_tesseract_output: str
    used_fallback: bool
    validated_expression: str | None
    evaluation: str | None
    steps: list[StepCheck] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.validated_expression is not None and self.evaluation is not None


class MathVisionPipeline:
    """Fault-tolerant OCR + vision-validator + safe-evaluator pipeline."""

    def __init__(self, validator: Validator = validate_with_gemini) -> None:
        self._validator = validator

    # ------------------------------------------------------------------ steps
    def _record(self, steps: list[StepCheck], step: int, name: str, status: str, detail: str) -> None:
        entry = StepCheck(step=step, name=name, status=status, detail=detail)
        steps.append(entry)
        logger.info("Step %s [%s] %s — %s", step, name, status, detail)

    def guess_mime(self, source: os.PathLike | str | bytes) -> str:
        if isinstance(source, (str, os.PathLike)):
            return _MIME_BY_SUFFIX.get(Path(source).suffix.lower(), DEFAULT_MIME_TYPE)
        return DEFAULT_MIME_TYPE

    def run(
        self,
        source: os.PathLike | str | bytes,
        mime_type: str | None = None,
        evaluate: bool = True,
    ) -> PipelineResult:
        """Execute all six steps. Raises: StepCheckError subtypes."""
        mime = mime_type or self.guess_mime(source)
        steps: list[StepCheck] = []

        # ---------------------------------------------------------- Step 1
        try:
            image = build_preprocessed_image(source)
            self._record(
                steps, 1, "Image Load", "PASS",
                "Asset decoded successfully "
                f"({'binary buffer' if isinstance(source, (bytes, bytearray)) else source}).",
            )
        except Exception as exc:  # noqa: BLE001 - recorded, then re-raised
            self._record(steps, 1, "Image Load", "FAIL", str(exc))
            raise

        # ---------------------------------------------------------- Step 2
        self._verify_preprocessing(steps, image)

        # ---------------------------------------------------------- Step 3
        try:
            reading = extract_text(image.binary)
        except Exception as exc:  # noqa: BLE001
            self._record(steps, 3, "Tesseract Extraction", "FAIL", str(exc))
            raise

        if reading.used_fallback:
            # Log EXACTLY what Tesseract read (nothing) plus the flag for the
            # downstream vision agent.
            self._record(
                steps, 3, "Tesseract Extraction", "FALLBACK",
                f"raw_tesseract_output=\"{reading.raw_tesseract_output}\" "
                f"(blank reading -> {FALLBACK_FLAG}; vision agent relies on the "
                "image alone).",
            )
        else:
            self._record(
                steps, 3, "Tesseract Extraction", "PASS",
                f"raw_tesseract_output=\"{reading.raw_tesseract_output}\"",
            )

        payload = reading.raw_tesseract_output

        # ---------------------------------------------------------- Step 4
        self._record(
            steps, 4, "Gemini Integration Sync", "PASS",
            "Transmission dictionary compiled: original visual asset bytes "
            f"(mime={mime}) + Tesseract payload \"{payload}\".",
        )

        try:
            validated = self._validator(source, payload, mime)
        except Exception as exc:  # noqa: BLE001
            self._record(steps, 4, "Gemini Integration Sync", "FAIL", str(exc))
            raise

        self._record(
            steps, 4, "Gemini Vision Validation", "PASS",
            f"agent response: {validated!r}",
        )

        # ---------------------------------------------------------- Step 5
        try:
            expression = enforce_structural_match(validated)
        except Exception as exc:  # noqa: BLE001
            self._record(steps, 5, "Structural Match", "FAIL", str(exc))
            raise
        self._record(steps, 5, "Structural Match", "PASS", f"expression=\"{expression}\"")

        result = PipelineResult(
            raw_tesseract_output=payload,
            used_fallback=reading.used_fallback,
            validated_expression=expression,
            evaluation=None,
            steps=steps,
        )

        # ---------------------------------------------------------- Step 6
        if not evaluate:
            return result
        try:
            value = evaluate_expression(expression)
        except ZeroDivisionError:
            self._record(steps, 6, "Safe Evaluation", "FAIL", "Division by zero.")
            raise
        except Exception as exc:  # noqa: BLE001
            self._record(steps, 6, "Safe Evaluation", "FAIL", str(exc))
            raise
        result.evaluation = format_result(value)
        self._record(
            steps, 6, "Safe Evaluation", "PASS",
            f"{expression} = {result.evaluation}",
        )
        return result

    def _verify_preprocessing(self, steps: list[StepCheck], image: PreprocessedImage) -> None:
        try:
            build_preprocessed_image  # structural keep-alive; verification ran inside
            # Re-run the structural checks explicitly so failures land in the log.
            from .preprocessing import verify_matrix

            verify_matrix(image.grayscale, image.binary)
            self._record(
                steps, 2, "Preprocessing Verification", "PASS",
                f"binary matrix {image.width}x{image.height} "
                f"(scale x{image.scale_factor:.2f}), high-contrast ink present.",
            )
        except Exception as exc:  # noqa: BLE001
            self._record(steps, 2, "Preprocessing Verification", "FAIL", str(exc))
            raise


def run_pipeline(
    source: os.PathLike | str | bytes,
    mime_type: str | None = None,
    evaluate: bool = True,
    validator: Validator | None = None,
) -> PipelineResult:
    """Convenience entry point used by the CLI and service layers."""
    pipeline = MathVisionPipeline(validator=validator or validate_with_gemini)
    return pipeline.run(source, mime_type=mime_type, evaluate=evaluate)
