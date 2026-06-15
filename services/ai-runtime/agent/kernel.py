from __future__ import annotations

from typing import Any, AsyncIterator

from agent.request_context import RequestContext
from orchestration.agent_pipeline import iter_agent_turn_sse


async def run_turn(context: RequestContext, message: str, request: Any) -> AsyncIterator[str]:
    """Single agent entry — delegates to orchestration pipeline."""
    from api.agent import AgentTurnRequest

    payload = AgentTurnRequest(
        query=message,
        routing_query=context.routing_query or message[:512],
        user_id=context.scope.user_id,
        chat_history=context.chat_history,
        chat_session_id=context.chat_session_id,
        source=context.source,
        rag_enabled=context.rag_enabled,
        confirmed=context.confirmed,
        tool_results=context.tool_results,
        skip_planning=context.skip_planning,
        attachments=context.attachments,
        resolved_attachments=context.resolved_attachments,
        personality_id=context.personality_id,
        assistant_display_name=context.assistant_display_name,
        system_prompt=context.system_prompt,
        file_retrieval_context=context.file_retrieval_context,
        session_context=context.session_context,
        timezone=context.timezone or None,
        preferred_model_id=context.preferred_model_id,
        session_model_id=context.session_model_id,
    )
    async for frame in iter_agent_turn_sse(payload, request):
        yield frame
