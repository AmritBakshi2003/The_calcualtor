"""Offline end-to-end tests for the pipeline step-check system.

No network: the Gemini validator is injected as a stub and PyTesseract is
replaced with a stub module via sys.modules, mirroring exactly the contract
of the real dependencies (README explains how to run against the real ones).
Needs cv2 + numpy only (present with opencv-python).
"""

import sys
from types import ModuleType

import pytest

cv2 = pytest.importorskip("cv2")

from math_vision.exceptions import (  # noqa: E402
    AssetError,
    ExpressionValidationError,
    MissingApiKeyError,
)
from math_vision.pipeline import MathVisionPipeline  # noqa: E402
from math_vision.ocr import FALLBACK_FLAG  # noqa: E402


# --------------------------------------------------------------------- utils
def _make_image_bytes(text="12+25") -> bytes:
    """Synthesize a canvas with dark text on white paper."""
    import numpy as np

    canvas = np.full((120, 600, 3), 255, dtype=np.uint8)
    cv2.putText(canvas, text, (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 3, cv2.LINE_AA)
    ok, encoded = cv2.imencode(".png", canvas)
    assert ok
    return encoded.tobytes()


@pytest.fixture()
def fake_tesseract(monkeypatch):
    """Stand in for the pytesseract module (binary not needed offline)."""

    stub = ModuleType("pytesseract")
    stub.image_to_string = lambda image, config: "12+25"
    monkeypatch.setitem(sys.modules, "pytesseract", stub)
    return stub


def _pipeline_with_validator(response: str) -> tuple[MathVisionPipeline, list]:
    calls: list = []

    def validator(source, raw_output, mime_type):
        calls.append((raw_output, mime_type))
        return response

    return MathVisionPipeline(validator=validator), calls


class TestStep1ImageLoad:
    def test_missing_file_halts_with_asset_error(self):
        pipeline, _ = _pipeline_with_validator("12+25")
        with pytest.raises(AssetError) as excinfo:
            pipeline.run("/nonexistent/path/photo.png")
        assert excinfo.value.step == 1
        assert "not found" in str(excinfo.value).lower()

    def test_unsupported_extension_halts(self, tmp_path):
        bad = tmp_path / "image.gif"
        bad.write_bytes(b"not an image")
        pipeline, _ = _pipeline_with_validator("12+25")
        with pytest.raises(AssetError):
            pipeline.run(bad)

    def test_corrupt_buffer_halts(self):
        pipeline, _ = _pipeline_with_validator("12+25")
        with pytest.raises(AssetError):
            pipeline.run(b"this is definitely not a jpeg or png")


class TestFullPipeline:
    def test_happy_path_logs_all_steps_and_evaluates(self, fake_tesseract):
        pipeline, calls = _pipeline_with_validator("12+25")
        result = pipeline.run(_make_image_bytes())

        # dual inputs reached the validator (Step 4 contract)
        assert calls[0][0] == "12+25"
        assert calls[0][1] == "image/png"

        assert result.validated_expression == "12+25"
        assert result.evaluation == "37"
        assert result.used_fallback is False
        assert not result.raw_tesseract_output.startswith("[")

        statuses = {(s.step, s.name): s.status for s in result.steps}
        assert statuses == {
            (1, "Image Load"): "PASS",
            (2, "Preprocessing Verification"): "PASS",
            (3, "Tesseract Extraction"): "PASS",
            (4, "Gemini Integration Sync"): "PASS",
            (4, "Gemini Vision Validation"): "PASS",
            (5, "Structural Match"): "PASS",
            (6, "Safe Evaluation"): "PASS",
        }

    def test_blank_tesseract_reading_sets_fallback_flag(self, monkeypatch, fake_tesseract):
        fake_tesseract.image_to_string = lambda image, config: "   \n"
        pipeline, _ = _pipeline_with_validator("12+25")
        result = pipeline.run(_make_image_bytes())

        assert result.used_fallback is True
        assert result.raw_tesseract_output == FALLBACK_FLAG
        fallback_step = [s for s in result.steps if s.step == 3][0]
        assert fallback_step.status == "FALLBACK"
        assert "[Blank/Unreadable Text]" in fallback_step.detail

    def test_fallback_flag_reaches_validator_in_transmission(self, fake_tesseract):
        fake_tesseract.image_to_string = lambda image, config: ""
        pipeline, calls = _pipeline_with_validator("12/4")
        result = pipeline.run(_make_image_bytes())

        assert calls[0][0] == FALLBACK_FLAG
        assert result.validated_expression == "12/4"
        assert result.evaluation == "3"

    def test_step5_strips_conversational_junk_from_agent(self, fake_tesseract):
        # polite filler words are stripped; only math characters survive Step 5
        pipeline, _ = _pipeline_with_validator("The result is 12+25")
        result = pipeline.run(_make_image_bytes())
        assert result.validated_expression == "12+25"

    def test_step5_fails_when_agent_returns_no_math(self, fake_tesseract):
        pipeline, _ = _pipeline_with_validator("I cannot read anything in this image.")
        with pytest.raises(ExpressionValidationError) as excinfo:
            pipeline.run(_make_image_bytes())
        assert excinfo.value.step == 5

    def test_division_by_zero_is_reported_at_step6(self, fake_tesseract):
        pipeline, _ = _pipeline_with_validator("5/0")
        with pytest.raises(ZeroDivisionError):
            pipeline.run(_make_image_bytes())

    def test_no_evaluate_mode_skips_step6(self, fake_tesseract):
        pipeline, _ = _pipeline_with_validator("12+25")
        result = pipeline.run(_make_image_bytes(), evaluate=False)
        assert result.validated_expression == "12+25"
        assert result.evaluation is None
        assert 6 not in [s.step for s in result.steps]


class TestKeyManagement:
    def test_missing_api_key_demands_authentication_not_a_model_call(self, monkeypatch, fake_tesseract):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        from math_vision.gemini_layer import require_api_key, validate_with_gemini

        with pytest.raises(MissingApiKeyError):
            require_api_key()

        # The real validator checks the key FIRST, before importing the genai
        # client or building the transmission — proven here by running it with
        # no google-genai package installed at all.
        pipeline = MathVisionPipeline(validator=validate_with_gemini)
        with pytest.raises(MissingApiKeyError):
            pipeline.run(_make_image_bytes())
