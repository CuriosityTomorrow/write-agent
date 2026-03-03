from pydantic import BaseModel
from datetime import datetime


class ChapterCreate(BaseModel):
    chapter_outline: str | None = None
    target_word_count: int | None = 3000
    conflict_description: str | None = None
    required_character_ids: list[int] | None = None
    optional_character_ids: list[int] | None = None
    foreshadowing_ids: list[int] | None = None


class ChapterUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    chapter_outline: str | None = None
    status: str | None = None
    conflict_description: str | None = None


class ChapterResponse(BaseModel):
    id: int
    novel_id: int
    chapter_number: int
    title: str | None = None
    content: str | None = None
    chapter_outline: str | None = None
    target_word_count: int | None = None
    actual_word_count: int | None = None
    status: str
    conflict_description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChapterIntelResponse(BaseModel):
    id: int
    chapter_id: int
    plot_summary: str | None = None
    character_updates: list | None = None
    relationship_changes: list | None = None
    new_foreshadowings: list | None = None
    resolved_foreshadowings: list | None = None
    timeline_events: list | None = None
    next_chapter_required_chars: list | None = None
    suggested_foreshadowings: list | None = None

    model_config = {"from_attributes": True}


class GenerateChapterRequest(BaseModel):
    model_id: str = "deepseek"
    suggestion: str = ""


class GenerateOutlineRequest(BaseModel):
    target_chapters: int
    model_id: str = "deepseek"
