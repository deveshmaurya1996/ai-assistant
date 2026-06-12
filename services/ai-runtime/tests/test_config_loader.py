from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.config_loader import (
    AIModelsConfigError,
    config_path,
    load_ai_models_config,
)


class TestConfigLoader(unittest.TestCase):
    def setUp(self) -> None:
        os.environ.pop("AI_MODELS_CONFIG", None)
        load_ai_models_config(reload=True)

    def tearDown(self) -> None:
        os.environ.pop("AI_MODELS_CONFIG", None)
        load_ai_models_config(reload=True)

    def test_default_path_points_at_planner_config(self) -> None:
        path = config_path()
        self.assertEqual(path.name, "ai-models.yaml")
        self.assertEqual(path.parent.name, "planner-config")
        self.assertTrue(path.is_file(), f"expected repo config at {path}")

    def test_loads_models_from_default_path(self) -> None:
        cfg = load_ai_models_config(reload=True)
        model_ids = [m.get("id") for m in cfg.get("models") or []]
        self.assertIn("nvidia/deepseek-v4-flash", model_ids)
        self.assertIn("nvidia/qwen3-next-80b", model_ids)
        self.assertNotIn("nvidia/qwen3-coder-480b", model_ids)

    def test_fails_fast_when_config_missing(self) -> None:
        os.environ["AI_MODELS_CONFIG"] = "planner-config/does-not-exist.yaml"
        with self.assertRaises(AIModelsConfigError):
            load_ai_models_config(reload=True)


class TestCodingRouting(unittest.TestCase):
    def setUp(self) -> None:
        os.environ.pop("AI_MODELS_CONFIG", None)
        load_ai_models_config(reload=True)

    def test_coding_chain_order(self) -> None:
        from models.config_loader import routing_for_task, routing_tiers_for_task

        chain = routing_for_task("coding")
        self.assertEqual(
            chain[:5],
            [
                "nvidia/qwen3-next-80b",
                "groq/gpt-oss-120b",
                "groq/llama-3.3-70b",
                "groq/gpt-oss-20b",
                "pollinations/openai",
            ],
        )
        tiers = routing_tiers_for_task("coding")
        self.assertEqual(
            tiers["tier1"],
            ["nvidia/qwen3-next-80b", "groq/gpt-oss-120b"],
        )


if __name__ == "__main__":
    unittest.main()
