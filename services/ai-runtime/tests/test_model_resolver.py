
import unittest

from models.model_resolver import litellm_kwargs


class TestTaskThinkingOverrides(unittest.TestCase):
    def test_fast_chat_disables_thinking_when_present(self) -> None:
        kwargs = litellm_kwargs(
            "nvidia/nemotron-3-ultra", stream=True, task="fast_chat", allow_thinking=False
        )
        extra = kwargs.get("extra_body") or {}
        chat_kwargs = extra.get("chat_template_kwargs") or {}
        self.assertFalse(chat_kwargs.get("thinking"))
        self.assertFalse(chat_kwargs.get("enable_thinking"))

    def test_planner_allows_thinking_on_nemotron(self) -> None:
        kwargs = litellm_kwargs(
            "nvidia/nemotron-3-ultra", stream=True, task="planner", allow_thinking=True
        )
        extra = kwargs.get("extra_body") or {}
        chat_kwargs = extra.get("chat_template_kwargs") or {}
        self.assertTrue(chat_kwargs.get("enable_thinking"))


if __name__ == "__main__":
    unittest.main()
