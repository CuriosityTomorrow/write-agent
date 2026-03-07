from app.prompts.presets.base import BASE_PRESET
from app.prompts.presets.upgrade_fantasy import PRESET as UPGRADE_FANTASY_PRESET

_GENRE_MAP = {
    "玄幻": UPGRADE_FANTASY_PRESET,
    "仙侠": UPGRADE_FANTASY_PRESET,
    "奇幻": UPGRADE_FANTASY_PRESET,
    "武侠": UPGRADE_FANTASY_PRESET,
}


def get_preset(genre: str) -> dict:
    """根据小说类型返回对应的预设配置，找不到则 fallback 到 BASE_PRESET"""
    return _GENRE_MAP.get(genre, BASE_PRESET)
