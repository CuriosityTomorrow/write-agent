from typing import AsyncGenerator
from openai import AsyncOpenAI
from app.llm.base import LLMProvider, Message, GenerateConfig


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str, display: str, max_context: int):
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._display = display
        self._max_context = max_context

    async def generate(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> AsyncGenerator[str, None]:
        config = config or GenerateConfig()
        msgs = self._build_messages(messages, system_prompt)
        stream = await self._client.chat.completions.create(model=self._model, messages=msgs, temperature=config.temperature, max_tokens=config.max_tokens, top_p=config.top_p, stream=True)
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def generate_complete(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> str:
        config = config or GenerateConfig(stream=False)
        msgs = self._build_messages(messages, system_prompt)
        response = await self._client.chat.completions.create(model=self._model, messages=msgs, temperature=config.temperature, max_tokens=config.max_tokens, top_p=config.top_p, stream=False)
        return response.choices[0].message.content or ""

    def _build_messages(self, messages: list[Message], system_prompt: str) -> list[dict]:
        msgs = []
        if system_prompt:
            msgs.append({"role": "system", "content": system_prompt})
        for m in messages:
            msgs.append({"role": m.role, "content": m.content})
        return msgs

    def max_context_length(self) -> int:
        return self._max_context

    def model_id(self) -> str:
        return self._model

    def display_name(self) -> str:
        return self._display
