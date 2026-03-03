from app.config import settings
from app.llm.base import LLMProvider
from app.llm.openai_compatible import OpenAICompatibleProvider
from app.llm.gemini_provider import GeminiProvider
from app.llm.claude_provider import ClaudeProvider

MODEL_CONFIGS = {
    "deepseek": {"class": OpenAICompatibleProvider, "base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat", "display": "DeepSeek V3", "max_context": 64000, "api_key_setting": "DEEPSEEK_API_KEY"},
    "qwen": {"class": OpenAICompatibleProvider, "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen-max", "display": "\u901a\u4e49\u5343\u95ee Max", "max_context": 32000, "api_key_setting": "DASHSCOPE_API_KEY"},
    "gpt": {"class": OpenAICompatibleProvider, "base_url": "https://api.openai.com/v1", "model": "gpt-4o", "display": "GPT-4o", "max_context": 128000, "api_key_setting": "OPENAI_API_KEY"},
    "grok": {"class": OpenAICompatibleProvider, "base_url": "https://api.x.ai/v1", "model": "grok-3", "display": "Grok 3", "max_context": 131072, "api_key_setting": "XAI_API_KEY"},
    "gemini": {"class": GeminiProvider, "model": "gemini-2.5-pro", "max_context": 1000000, "api_key_setting": "GOOGLE_API_KEY"},
    "claude": {"class": ClaudeProvider, "model": "claude-sonnet-4-6", "max_context": 200000, "api_key_setting": "ANTHROPIC_API_KEY"},
    "zhipu": {"class": ClaudeProvider, "base_url": "https://open.bigmodel.cn/api/anthropic", "model": "glm-5", "display": "智谱 GLM-5", "max_context": 128000, "api_key_setting": "ZHIPU_API_KEY"},
    "gemini-flash": {"class": OpenAICompatibleProvider, "base_url": "https://deeprouter.top/v1", "model": "gemini-3-flash-preview", "display": "Gemini 3 Flash (DeepRouter)", "max_context": 128000, "api_key_setting": "DEEPROUTER_API_KEY"},
}


def get_provider(provider_id: str) -> LLMProvider:
    if provider_id not in MODEL_CONFIGS:
        raise ValueError(f"Unknown provider: {provider_id}. Available: {list(MODEL_CONFIGS.keys())}")
    cfg = MODEL_CONFIGS[provider_id]
    api_key = getattr(settings, cfg["api_key_setting"], "")
    if not api_key:
        raise ValueError(f"API key not configured for {provider_id}. Set {cfg['api_key_setting']} in .env")
    provider_class = cfg["class"]
    if provider_class == OpenAICompatibleProvider:
        return provider_class(api_key=api_key, base_url=cfg["base_url"], model=cfg["model"], display=cfg["display"], max_context=cfg["max_context"])
    elif provider_class == GeminiProvider:
        return provider_class(api_key=api_key, model=cfg["model"], max_context=cfg["max_context"])
    elif provider_class == ClaudeProvider:
        return provider_class(api_key=api_key, model=cfg["model"], max_context=cfg["max_context"], base_url=cfg.get("base_url"), display=cfg.get("display"))
    else:
        raise ValueError(f"Unknown provider class for {provider_id}")


def list_available_models() -> list[dict]:
    models = []
    for pid, cfg in MODEL_CONFIGS.items():
        api_key = getattr(settings, cfg["api_key_setting"], "")
        models.append({"id": pid, "name": cfg.get("display", cfg["model"]), "model": cfg["model"], "max_context": cfg["max_context"], "available": bool(api_key)})
    return models
