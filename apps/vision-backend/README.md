# math_vision — Gemini-validated OCR math backend

A production-ready Python backend that takes a photo of **handwritten or
printed arithmetic**, cleans it up with OpenCV, reads it locally with
Tesseract, then uses **Google Gemini 2.5 Flash Vision** as an agentic
validation layer — cross-examining the raw OCR text against the actual glyph
shapes — before evaluating the expression in an isolated, injection-safe
execution engine.

It mirrors the scanner workflow of the TypeScript app in
`apps/web/src/features/scan/` (same single-line PSM mode, same fallback-flag
philosophy) while adding the two accuracy layers that pure browser OCR cannot
get: vision-model cross-validation and step-by-step integrity checks.

## Pipeline (each stage is logged and verified before the next runs)

| Step | Name | What it checks |
|---|---|---|
| 1 | Image Load | path or binary buffer (.jpg/.jpeg/.png) decodes; meaningful asset error otherwise (halt) |
| 2 | Preprocessing Verification | grayscale matrix non-empty, high-contrast, clean binary ink/paper classes |
| 3 | Tesseract Extraction | `--psm 7` single-line read logged verbatim; blank read logs the fallback flag `[Blank/Unreadable Text]` |
| 4 | Gemini Integration Sync | original image bytes + Tesseract payload compiled into one transmission dictionary |
| 5 | Structural Match | regex check — only `0-9 + - * / . ( )` survive; non-math junk is stripped or rejected |
| 6 | Safe Evaluation | AST-whitelisted engine (no eval of raw input, no names/calls/attributes) computes the result |

## Architecture

```
math_vision/
├── preprocessing.py   OpenCV: grayscale -> dynamic INTER_CUBIC upscale -> Gaussian adaptive threshold
├── ocr.py             PyTesseract --psm 7 -> raw_tesseract_output (+ fallback flag)
├── gemini_layer.py    google-genai client, dual-input prompt, strict output contract
├── expression_eval.py structural regex + AST whitelist + safe evaluation
├── pipeline.py        orchestrates Steps 1-6 with StepCheck logging
└── cli.py             command-line entry point
```

## Setup

```bash
cd apps/vision-backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Tesseract binary (OS package, not the pip one):
#   Ubuntu/Debian: sudo apt-get install tesseract-ocr
#   macOS:         brew install tesseract
```

## Usage

```bash
# validate + evaluate
python -m math_vision.cli samples/handwritten_sum.jpg

# print each StepCheck, machine-readable
python -m math_vision.cli samples/photo.png --json

# stop after Step 5 — validated expression only, no arithmetic
python -m math_vision.cli samples/photo.png --no-evaluate
```

From Python:

```python
from math_vision import run_pipeline, MissingApiKeyError

result = run_pipeline("photo.png")
print(result.validated_expression)   # corrected math string
print(result.evaluation)             # "42"
print(result.used_fallback)          # True when Tesseract read nothing
```

## Tests

Offline unit tests (no network, no Tesseract binary needed):

```bash
python -m pytest tests/ -q
```

The Gemini validator is injected as a callable in the pipeline tests, so the
full orchestration is exercised without spending API quota.

=========================================================
🔑  **BEFORE FIRST RUN — INPUT YOUR PRIVATE `GEMINI_API_KEY`**
---------------------------------------------------------
The pipeline embeds **zero** API keys or mock tokens. It reads the
key from the environment only and refuses to call the model without it:

1. Get your key: https://aistudio.google.com/apikey
2. Provide it — either:
   * `export GEMINI_API_KEY="your-private-key"` (shell), or
   * `cp .env.example .env` and fill `GEMINI_API_KEY` (`.env` is
     git-ignored; only `GEMINI_API_KEY` is read from it)
3. Run again. Missing key → `MissingApiKeyError` → exit code 2 and a
   graceful authentication prompt instead of a broken request.

Never commit `.env`, never paste the key into source code,
tickets or logs. Rotate it if it ever leaks.
=========================================================
