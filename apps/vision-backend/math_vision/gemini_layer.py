"""Vision agent validation layer (Google Gemini 2.5 Flash via google-genai).

Step 4-5 territory: the agent receives BOTH the original visual asset and the
Tesseract text payload in one transmission dictionary, cross-examines the raw
OCR text against the actual glyph shapes in the image (correcting handwritten
edge cases like "＋" read as "t", "/" read as "7", or "0" read as "O"), and
must answer with ONLY the raw mathematical string.

Key management: the API key is read exclusively from the environment
(``GEMINI_API_KEY``, which the modern google-genai client also uses natively).
No placeholder/mock tokens exist in this codebase — a missing key raises
``MissingApiKeyError`` gracefully before any network call happens.
"""

from __future__ import annotations

import os
from pathlib import Path

from .exceptions import GeminiSyncError, MissingApiKeyError
from .expression_eval import strip_non_math

API_KEY_ENV_VAR = "GEMINI_API_KEY"
MODEL_ID = "gemini-2.5-flash"
FALLBACK_MARKER_FLAG = "[Blank/Unreadable Text]"

#: The max_output_tokens bound plus temperature 0 keep the agent deterministic
#: and cheap; a math expression never needs multiple pages of tokens.
GENERATION_CONFIG_KWARGS = {"temperature": 0.0, "max_output_tokens": 256}

SYSTEM_INSTRUCTION = (
    "You are a specialized mathematical text VALIDATION agent. A local OCR "
    "engine (Tesseract) has already read a line of handwritten or printed "
    "mathematics from an image, and its raw output is attached below as the "
    "TESSERART PAYLOAD. You receive BOTH the original image and that payload "
    "in this message.\n\n"
    "TASK — cross-examine the text artifact against the original spatial "
    "image and correct recognition errors:\n"
    "+ Task 1: compare every glyph in the OCR text with the real ink shapes in "
    "the image. The OCR payload is a hint, never the source of truth.\n"
    "+ Task 2: correct classic handwritten edge cases — a plus sign misread as "
    "'t' or 'f' is '+', a division slash misread as '7' is '/', a handwritten "
    "zero misread as the letter 'O' is '0', a five misread as 'S' is '5', a "
    "one misread as 'l' or 'I' is '1', an 'x'-like mark between numbers is "
    "multiplication '*'.\n"
    "+ Task 3: when the payload is the fallback flag "
    "\"[Blank/Unreadable Text]\", the local OCR engine read nothing — rely "
    "entirely on your own reading of the image.\n"
    "+ Task 4: output exactly ONE normalized arithmetic expression using only "
    "the characters 0-9 + - * / . ( ). Convert '×' or 'x' to '*', '÷' to '/', "
    "'−' or '–' to '-', and evaluate nothing: printing the result of the "
    "expression is FORBIDDEN.\n"
    "+ Task 5: when the image contains no readable arithmetic line at all, "
    "answer with the single word UNREADABLE.\n\n"
    "OUTPUT CONTRACT — absolute and non-negotiable:\n"
    "* Output ONLY the raw mathematical string expression.\n"
    "* No Markdown, no code blocks or backticks, no quotes.\n"
    "* No conversational explanation, no prefix like 'The expression is', no "
    "suffix like '= result'.\n"
    "* No trailing whitespace or newline decoration.\n"
)


def require_api_key() -> None:
    """Demand authentication before any model call. Raises MissingApiKeyError."""
    if not os.environ.get(API_KEY_ENV_VAR):
        raise MissingApiKeyError()


def read_image_bytes(source: os.PathLike | str | bytes) -> bytes:
    """Return the raw image bytes for the transmission dictionary."""
    if isinstance(source, (bytes, bytearray)):
        return bytes(source)
    return Path(source).read_bytes()


def build_transmission(
    image_bytes: bytes,
    mime_type: str,
    raw_tesseract_output: str,
) -> list:
    """Compile the dual-input model payload.

    Part 1: the original visual asset bytes.
    Part 2: the verification-checked Tesseract payload plus the instruction to
    cross-examine. Both parts live in ONE contents list, so the model sees the
    image and the OCR hint together.

    Raises GeminiSyncError when either input is missing — the Step 4 check.
    """
    if not image_bytes:
        raise GeminiSyncError("Original visual asset is missing from the transmission packet.")
    if raw_tesseract_output is None:
        raise GeminiSyncError("Tesseract text payload is missing from the transmission packet.")

    from google.genai import types

    return [
        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        types.Part.from_text(
            text=(
                f"RAW TESSERACT OUTPUT (payload; may be the fallback flag "
                f"\"{FALLBACK_MARKER_FLAG}\" when local OCR read nothing):\n"
                f"{raw_tesseract_output}\n\n"
                "Validate this payload against the image and output the "
                "corrected raw mathematical expression only."
            )
        ),
    ]


def extract_model_text(response) -> str:
    """Pull the raw text out of a generate_content response."""
    if response is None or getattr(response, "text", None) is None:
        return ""
    return str(response.text).strip()


def unwrap_output(text: str) -> str:
    """Remove accidental Markdown wrappers the agent may have slipped past.

    The system instruction forbids them, but politeness leaks are cheap to
    guard against before Step 5's structural regex check.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Drop a single fenced block: first fence line and last fence line.
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        while lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    if "UNREADABLE" in cleaned.upper():
        return ""
    return cleaned


def validate_with_gemini(
    source: os.PathLike | str | bytes,
    raw_tesseract_output: str,
    mime_type: str = "image/png",
) -> str:
    """Run the vision validation agent and return the cleaned candidate.

    Does NOT evaluate. The pipeline sanitizes the returned text with the
    structural regex (Step 5) before it reaches the execution engine.
    """
    require_api_key()  # demand auth before creating the client

    from google import genai
    from google.genai import types

    payload = build_transmission(
        read_image_bytes(source), mime_type, raw_tesseract_output
    )

    client = genai.Client()
    response = client.models.generate_content(
        model=MODEL_ID,
        contents=payload,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            **GENERATION_CONFIG_KWARGS,
        ),
    )

    # The model itself is treated as untrusted output: unwrap Markdown noise,
    # then strip anything beyond math characters (Step 5 runs again later, but
    # the validator returns the closest-to-correct candidate it can).
    return strip_non_math(unwrap_output(extract_model_text(response)))
