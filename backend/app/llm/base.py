from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class GenerateConfig:
    temperature: float = 0.7
    max_tokens: int = 4096
    top_p: float = 0.9
    stream: bool = True


class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> AsyncGenerator[str, None]: ...

    @abstractmethod
    async def generate_complete(self, messages: list[Message], system_prompt: str = "", config: GenerateConfig | None = None) -> str: ...

    @abstractmethod
    def max_context_length(self) -> int: ...

    @abstractmethod
    def model_id(self) -> str: ...

    @abstractmethod
    def display_name(self) -> str: ...
