from __future__ import annotations

from orchestration.prompt_loader import load_prompt_file


def platform_capabilities_block() -> str:
    try:
        return load_prompt_file("scheduling", "platform.md")
    except FileNotFoundError:
        return "Platform scheduling tools: reminder.create, automation.create, reminder.list, reminder.cancel."
