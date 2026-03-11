from pydantic import BaseModel
from datetime import datetime


class NovelCreate(BaseModel):
    title: str
    author_name: str
    genre: str
    mode: str
    world_setting: str | None = None
    protagonist_identity: str | None = None
    core_conflict: str | None = None
    golden_finger: str | None = None
    antagonist_setting: str | None = None
    power_system: str | None = None
    core_suspense: str | None = None
    story_stage: str | None = None
    style_tone: str | None = None
    target_chapters: int | None = None
    selected_style_id: int | None = None
    selected_blueprint_id: int | None = None


class NovelUpdate(BaseModel):
    title: str | None = None
    author_name: str | None = None
    genre: str | None = None
    status: str | None = None
    cover_url: str | None = None
    synopsis: str | None = None
    highlights: str | None = None
    world_setting: str | None = None
    core_conflict: str | None = None
    protagonist_identity: str | None = None
    golden_finger: str | None = None
    antagonist_setting: str | None = None
    power_system: str | None = None
    core_suspense: str | None = None
    story_stage: str | None = None
    style_tone: str | None = None
    target_chapters: int | None = None
    selected_style_id: int | None = None
    selected_blueprint_id: int | None = None


class NovelResponse(BaseModel):
    id: int
    title: str
    author_name: str
    genre: str
    mode: str
    status: str
    cover_url: str | None = None
    synopsis: str | None = None
    highlights: str | None = None
    world_setting: str | None = None
    core_conflict: str | None = None
    protagonist_identity: str | None = None
    golden_finger: str | None = None
    antagonist_setting: str | None = None
    power_system: str | None = None
    core_suspense: str | None = None
    story_stage: str | None = None
    style_tone: str | None = None
    target_chapters: int | None = None
    selected_style_id: int | None = None
    selected_blueprint_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OutlineUpdate(BaseModel):
    story_background: str | None = None
    main_plot: str | None = None
    plot_points: list | None = None
    raw_outline: str | None = None


class OutlineResponse(BaseModel):
    id: int
    novel_id: int
    story_background: str | None = None
    main_plot: str | None = None
    plot_points: list | None = None
    raw_outline: str | None = None

    model_config = {"from_attributes": True}


class IdeaRequest(BaseModel):
    genre: str
    creative_idea: str
    model_id: str = "deepseek"


class IdeaResponse(BaseModel):
    world_setting: str
    protagonist_identity: str
    core_conflict: str
    golden_finger: str
    antagonist_setting: str
    power_system: str
    core_suspense: str
    story_stage: str
    style_tone: str
    suggested_titles: list[str]
