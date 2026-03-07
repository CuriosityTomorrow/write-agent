# backend/app/schemas/narrative_memory.py
from pydantic import BaseModel
from datetime import datetime


class NarrativeMemoryResponse(BaseModel):
    id: int
    novel_id: int
    memory_type: str
    chapter_start: int
    chapter_end: int
    plot_progression: str
    character_states: dict | None = None
    relationship_changes: list | None = None
    unresolved_threads: list | None = None
    world_state_changes: list | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NarrativeMemoryUpdate(BaseModel):
    plot_progression: str | None = None
    character_states: dict | None = None
    relationship_changes: list | None = None
    unresolved_threads: list | None = None
    world_state_changes: list | None = None


class GenerateVolumeSummaryRequest(BaseModel):
    chapter_start: int
    chapter_end: int
    model_id: str = "deepseek"


class GenerateRangeSummaryRequest(BaseModel):
    chapter_start: int
    chapter_end: int
    model_id: str = "deepseek"
