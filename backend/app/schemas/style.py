from pydantic import BaseModel
from datetime import datetime


class WritingStyleResponse(BaseModel):
    id: int
    name: str
    source_author: str | None = None
    source_work: str | None = None
    dimensions: dict | None = None
    sample_excerpts: list | None = None
    generated_prompt: str | None = None
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NarrativeBlueprintResponse(BaseModel):
    id: int
    name: str
    category: str | None = None
    source_authors: list | None = None
    source_works: list | None = None
    opening_pattern: dict | None = None
    character_archetypes: dict | None = None
    plot_cycle: dict | None = None
    stage_progression: list | None = None
    pacing: dict | None = None
    foreshadowing_rhythm: dict | None = None
    generated_prompt: str | None = None
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ForeshadowingCreate(BaseModel):
    description: str
    created_chapter_id: int | None = None


class ForeshadowingUpdate(BaseModel):
    status: str | None = None
    resolved_chapter_id: int | None = None
    progress_note: str | None = None


class ForeshadowingResponse(BaseModel):
    id: int
    novel_id: int
    description: str
    created_chapter_id: int | None = None
    status: str
    resolved_chapter_id: int | None = None
    progress_notes: list | None = None

    model_config = {"from_attributes": True}
