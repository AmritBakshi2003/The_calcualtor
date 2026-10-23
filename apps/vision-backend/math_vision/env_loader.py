"""Minimal stdlib-only .env loader.

The pipeline reads GEMINI_API_KEY from the environment. For local runs the
developer can keep the key in ``apps/vision-backend/.env`` (git-ignored);
this loader promotes those variables into ``os.environ`` without printing,
logging or returning any value.

Rules:
* existing environment variables always win (never overwritten);
* values are read once and immediately stored — nothing is echoed;
* a missing .env file is not an error.
"""

from __future__ import annotations

import os
from pathlib import Path

ENV_FILE_NAME = ".env"


def find_env_file(start_dir: Path | None = None) -> Path | None:
    """Locate the .env file relative to the working directory (and nearest parents)."""
    directory = Path(start_dir or os.getcwd()).resolve()
    for candidate in (directory, *directory.parents):
        path = candidate / ENV_FILE_NAME
        if path.is_file():
            return path
    return None


def load_env_file(path: Path | str | None = None) -> int:
    """Load KEY=VALUE pairs into os.environ. Returns the count of vars set.

    Existing environment entries are never overridden. Values are not logged.
    """
    env_path = Path(path) if path else find_env_file()
    if env_path is None or not env_path.is_file():
        return 0

    loaded = 0
    try:
        text = env_path.read_text(encoding="utf-8")
    except OSError:
        return 0

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key in os.environ or not key:
            continue
        os.environ[key] = value
        loaded += 1
    return loaded
