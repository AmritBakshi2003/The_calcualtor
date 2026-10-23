"""Command-line entry point.

Usage:
    python -m math_vision.cli path/to/photo.jpg [--no-evaluate] [--json]
"""

from __future__ import annotations

import argparse
import json
import sys

from .env_loader import load_env_file
from .exceptions import MathVisionError, MissingApiKeyError
from .pipeline import run_pipeline

AUTH_REQUIRED_BANNER = """
=========================================================
🔑  GEMINI_API_KEY REQUIRED — NO KEY IS HARDCODED
---------------------------------------------------------
This pipeline refuses to start the vision layer without
authentication. Provide YOUR PRIVATE key via the
environment, never in code or the repo:

    export GEMINI_API_KEY="your-private-key"
    # or add GEMINI_API_KEY=... to apps/vision-backend/.env

Find the key at: https://aistudio.google.com/apikey
=========================================================
"""


def _build_result_payload(result) -> dict:
    return {
        "raw_tesseract_output": result.raw_tesseract_output,
        "used_fallback": result.used_fallback,
        "validated_expression": result.validated_expression,
        "evaluation": result.evaluation,
        "steps": [
            {"step": s.step, "name": s.name, "status": s.status, "detail": s.detail}
            for s in result.steps
        ],
    }


def main(argv: list[str] | None = None) -> int:
    # Pick up GEMINI_API_KEY from the git-ignored .env when present (values
    # are read into os.environ only — never printed). Exported variables win.
    load_env_file()
    parser = argparse.ArgumentParser(
        prog="math_vision",
        description="OCR + Gemini-validated math extraction from an image.",
    )
    parser.add_argument("image", help="Path to a .jpg/.jpeg/.png image")
    parser.add_argument(
        "--no-evaluate", action="store_true",
        help="stop after Step 5 and print the validated expression only",
    )
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    try:
        result = run_pipeline(args.image, evaluate=not args.no_evaluate)
    except MissingApiKeyError:
        print(AUTH_REQUIRED_BANNER, file=sys.stderr)
        return 2
    except MathVisionError as exc:
        print(f"[halted] Step {exc.step if hasattr(exc, 'step') else '?'}: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(_build_result_payload(result), indent=2))
    else:
        for s in result.steps:
            print(f"Step {s.step} [{s.name}] {s.status}: {s.detail}")
        print("-" * 57)
        print(f"Validated expression : {result.validated_expression}")
        if result.evaluation is not None:
            print(f"Result               : {result.evaluation}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
