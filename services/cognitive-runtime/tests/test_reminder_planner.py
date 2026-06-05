import pytest

from orchestration.reminder_planner import plan_reminder_action


def test_plan_reminder_action_returns_create_for_timed_intent():
    items = plan_reminder_action("call my father at 9 pm", user_prompt="call my father at 9 pm")
    assert len(items) == 1
    assert items[0]["tool"] == "reminder.create"
    assert items[0]["args"]["userPrompt"] == "call my father at 9 pm"


def test_plan_reminder_action_uses_full_user_prompt_not_intent_only():
    items = plan_reminder_action(
        "set a reminder to drink water every 1 hour",
        user_prompt="hey can you set a reminder to drink water every 1 hour",
        timezone="Asia/Kolkata",
    )
    assert items[0]["args"]["userPrompt"] == (
        "hey can you set a reminder to drink water every 1 hour"
    )


def test_plan_reminder_action_includes_timezone():
    items = plan_reminder_action(
        "remind me at 9pm to call father",
        user_prompt="remind me at 9pm to call father",
        timezone="Asia/Kolkata",
    )
    assert items[0]["args"]["timezone"] == "Asia/Kolkata"


def test_plan_reminder_action_skips_non_remind():
    assert plan_reminder_action("what is the weather") == []


@pytest.mark.asyncio
async def test_plan_tools_schedules_reminder_without_integrations(monkeypatch):
    from orchestration import planner

    async def _empty_tools(*_args, **_kwargs):
        return set(), [], [], set(), []

    monkeypatch.setattr(planner, "_available_tools", _empty_tools)

    result = await planner.plan_tools(
        "hey can you set a reminder to drink water every 1 hour",
        "",
        "user-1",
        routing_query="set a reminder to drink water every 1 hour",
        timezone="America/New_York",
    )

    assert result["planner"] == "heuristic-reminder"
    tools = result["tools"]
    assert len(tools) == 1
    assert tools[0]["tool"] == "reminder.create"
    assert tools[0]["args"]["userPrompt"] == (
        "hey can you set a reminder to drink water every 1 hour"
    )
    assert tools[0]["args"]["timezone"] == "America/New_York"
