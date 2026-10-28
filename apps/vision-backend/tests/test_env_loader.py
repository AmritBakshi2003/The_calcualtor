"""Tests for the .env loader (no real keys are used)."""

import os
from pathlib import Path

from math_vision.env_loader import find_env_file, load_env_file


def _write_env(tmp_path: Path, content: str) -> Path:
    path = tmp_path / ".env"
    path.write_text(content, encoding="utf-8")
    return path


class TestLoadEnvFile:
    def test_loads_pair_into_environ(self, tmp_path, monkeypatch):
        env = _write_env(tmp_path, "FAKE_TEST_KEY_1=\"abc\"\n")
        monkeypatch.delenv("FAKE_TEST_KEY_1", raising=False)

        assert load_env_file(env) == 1
        assert os.environ["FAKE_TEST_KEY_1"] == "abc"

    def test_existing_environment_wins(self, tmp_path, monkeypatch):
        env = _write_env(tmp_path, "FAKE_TEST_KEY_2=\"from-file\"\n")
        monkeypatch.setenv("FAKE_TEST_KEY_2", "from-shell")

        load_env_file(env)
        assert os.environ["FAKE_TEST_KEY_2"] == "from-shell"

    def test_skips_comments_and_malformed_lines(self, tmp_path, monkeypatch):
        env = _write_env(
            tmp_path,
            "# comment\n\nFAKE_TEST_KEY_3=v\nnot-a-pair\n=\n",
        )
        for key in ("FAKE_TEST_KEY_3", "not-a-pair"):
            monkeypatch.delenv(key, raising=False)

        assert load_env_file(env) == 1

    def test_missing_file_is_not_an_error(self, tmp_path):
        assert load_env_file(tmp_path / "nope.env") == 0

    def test_find_env_file_walks_parents(self, tmp_path, monkeypatch):
        _write_env(tmp_path, "\n")
        nested = tmp_path / "sub" / "dir"
        nested.mkdir(parents=True)
        monkeypatch.chdir(nested)

        assert find_env_file() == (tmp_path / ".env").resolve()


class TestNoLeakGuarantees:
    def test_loader_never_returns_or_logs_values(self, tmp_path, monkeypatch, capsys):
        """The count is the only thing the loader reports — never a value."""
        monkeypatch.delenv("FAKE_TEST_KEY_4", raising=False)
        env = _write_env(tmp_path, "FAKE_TEST_KEY_4=\"super-secret\"")

        assert load_env_file(env) == 1  # count only
        captured = capsys.readouterr()
        assert "super-secret" not in captured.out
        assert "super-secret" not in captured.err

    def test_env_file_is_never_committed(self):
        """The project ignores .env — the exact path a real key lives in."""
        import subprocess

        repo_root = Path(__file__).resolve().parents[3]
        ignored = subprocess.run(
            ["git", "check-ignore", "-q", "apps/vision-backend/.env"],
            cwd=repo_root,
            capture_output=True,
        )
        assert ignored.returncode == 0, ".env must stay git-ignored"
