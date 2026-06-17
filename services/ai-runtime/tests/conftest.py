from __future__ import annotations

import os

import pytest


def pytest_configure(config: pytest.Config) -> None:
  """Keep unit tests fast when local .env points at services that are not running."""
  os.environ["MODEL_HEALTH_V2"] = "false"
  os.environ["DATABASE_URL"] = ""
