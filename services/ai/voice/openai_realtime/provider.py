
class OpenAIRealtimeVoiceProvider:
    async def connect(self) -> None:
        raise NotImplementedError(
            "OpenAI Realtime provider: implement WebSocket session via API gateway"
        )
