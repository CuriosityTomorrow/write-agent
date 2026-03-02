from typing import AsyncGenerator
from google import genai
from google.genai import types
from app.llm.base import LLMProvider, Message, GenerateConfig


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.5-pro", max_context: int = 1000000):
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._max_context = max_context

    async def generate(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> AsyncGenerator[str, None]:
        config = config or GenerateConfig()
        contents = [{"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]} for m in messages]
        gen_config = types.GenerateContentConfig(temperature=config.temperature, max_output_tokens=config.max_tokens, top_p=config.top_p, system_instruction=system_prompt or None)
        async for chunk in self._client.aio.models.generate_content_stream(model=self._model, contents=contents, config=gen_config):
            if chunk.text:
                yield chunk.text

    async def generate_complete(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> str:
        config = config or GenerateConfig()
        contents = [{"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]} for m in messages]
        gen_config = types.GenerateContentConfig(temperature=config.temperature, max_output_tokens=config.max_tokens, top_p=config.top_p, system_instruction=system_prompt or None)
        response = await self._client.aio.models.generate_content(model=self._model, contents=contents, config=gen_config)
        return response.text or ""

    def max_context_length(self) -> int:
        return self._max_context

    def model_id(self) -> str:
        return self._model

    def display_name(self) -> str:
        return f"Gemini ({self._model})"
