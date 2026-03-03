from typing import AsyncGenerator
from openai import AsyncOpenAI
from app.llm.base import LLMProvider, Message, GenerateConfig


class OpenAICompatibleProvider(LLMProvider):
    # 带 reasoning/thinking 的模型需要更大的 max_tokens（reasoning tokens 计入总数）
    REASONING_MODELS = {"gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro", "deepseek-reasoner", "o1", "o1-mini", "o3", "o3-mini", "o4-mini"}
    REASONING_MULTIPLIER = 4  # reasoning 通常占 50-75%，4x 留足余量

    def __init__(self, api_key: str, base_url: str, model: str, display: str, max_context: int):
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._display = display
        self._max_context = max_context
        self._is_reasoning = any(r in model for r in self.REASONING_MODELS)

    def _effective_max_tokens(self, max_tokens: int) -> int:
        if self._is_reasoning:
            return max_tokens * self.REASONING_MULTIPLIER
        return max_tokens

    async def generate(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> AsyncGenerator[str, None]:
        config = config or GenerateConfig()
        msgs = self._build_messages(messages, system_prompt)
        effective_tokens = self._effective_max_tokens(config.max_tokens)
        stream = await self._client.chat.completions.create(model=self._model, messages=msgs, temperature=config.temperature, max_tokens=effective_tokens, top_p=config.top_p, stream=True)
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def generate_complete(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> str:
        config = config or GenerateConfig(stream=False)
        msgs = self._build_messages(messages, system_prompt)
        effective_tokens = self._effective_max_tokens(config.max_tokens)
        response = await self._client.chat.completions.create(model=self._model, messages=msgs, temperature=config.temperature, max_tokens=effective_tokens, top_p=config.top_p, stream=False)
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
