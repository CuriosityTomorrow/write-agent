from pydantic import BaseModel
from datetime import datetime


class CharacterCreate(BaseModel):
    name: str
    gender: str | None = None
    role: str
    tags: list[str] | None = None
    identity: str | None = None
    personality: str | None = None
    golden_finger: str | None = None
    background: str | None = None
    personality_tags: list[str] | None = None
    motivation: str | None = None
    behavior_rules: dict | None = None
    speech_pattern: str | None = None
    growth_arc_type: str | None = None
    relationship_masks: dict | None = None


class CharacterUpdate(BaseModel):
    name: str | None = None
    gender: str | None = None
    role: str | None = None
    tags: list[str] | None = None
    identity: str | None = None
    personality: str | None = None
    golden_finger: str | None = None
    background: str | None = None
    current_status: str | None = None
    current_location: str | None = None
    emotional_state: str | None = None
    personality_tags: list[str] | None = None
    motivation: str | None = None
    behavior_rules: dict | None = None
    speech_pattern: str | None = None
    growth_arc_type: str | None = None
    relationship_masks: dict | None = None


class CharacterResponse(BaseModel):
    id: int
    novel_id: int
    name: str
    gender: str | None = None
    role: str
    tags: list[str] | None = None
    identity: str | None = None
    personality: str | None = None
    golden_finger: str | None = None
    background: str | None = None
    current_status: str | None = None
    current_location: str | None = None
    emotional_state: str | None = None
    personality_tags: list[str] | None = None
    motivation: str | None = None
    behavior_rules: dict | None = None
    speech_pattern: str | None = None
    growth_arc_type: str | None = None
    relationship_masks: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RelationshipCreate(BaseModel):
    character_a_id: int
    character_b_id: int
    relation_type: str
    description: str | None = None


class RelationshipResponse(BaseModel):
    id: int
    character_a_id: int
    character_b_id: int
    relation_type: str
    description: str | None = None

    model_config = {"from_attributes": True}
