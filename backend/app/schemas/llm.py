from pydantic import BaseModel


class LLMConfig(BaseModel):
    provider: str
    api_key: str


class LLMConfigUpdate(BaseModel):
    configs: dict[str, str]


class AvailableModelsResponse(BaseModel):
    models: list[dict]
