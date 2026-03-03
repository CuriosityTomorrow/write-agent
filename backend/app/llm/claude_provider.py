from typing import AsyncGenerator
from anthropic import AsyncAnthropic
from app.llm.base import LLMProvider, Message, GenerateConfig


class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6", max_context: int = 200000, base_url: str | None = None, display: str | None = None):
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self._client = AsyncAnthropic(**kwargs)
        self._model = model
        self._max_context = max_context
        self._display = display

    async def generate(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> AsyncGenerator[str, None]:
        config = config or GenerateConfig()
        msgs = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        async with self._client.messages.stream(model=self._model, messages=msgs, system=system_prompt or "", max_tokens=config.max_tokens, temperature=config.temperature, top_p=config.top_p) as stream:
            async for text in stream.text_stream:
                yield text

    async def generate_complete(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> str:
        config = config or GenerateConfig()
        msgs = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        response = await self._client.messages.create(model=self._model, messages=msgs, system=system_prompt or "", max_tokens=config.max_tokens, temperature=config.temperature, top_p=config.top_p)
        return response.content[0].text

    def max_context_length(self) -> int:
        return self._max_context

    def model_id(self) -> str:
        return self._model

    def display_name(self) -> str:
        return self._display or f"Claude ({self._model})"
