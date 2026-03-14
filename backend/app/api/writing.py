import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Novel, Character, Chapter, Outline
from pydantic import BaseModel
from app.schemas.novel import IdeaRequest, IdeaResponse
from app.schemas.chapter import GenerateChapterRequest, GenerateOutlineRequest
from app.services import writing_engine


class RegenerateFieldRequest(BaseModel):
    field_name: str
    current_value: str
    creative_idea: str
    genre: str
    suggestion: str = ""
    model_id: str = "deepseek"


class RegenerateNovelFieldRequest(BaseModel):
    field_name: str
    current_value: str = ""
    suggestion: str = ""
    model_id: str = "deepseek"
    chapter_number: int | None = None


class GenerateOutlineFromPromptRequest(BaseModel):
    genre: str
    mode: str
    user_prompt: str
    suggestion: str = ""
    model_id: str = "deepseek"


class ExtractFromOutlineRequest(BaseModel):
    outline_text: str
    model_id: str = "deepseek"


class GenerateCharacterRequest(BaseModel):
    prompt: str
    model_id: str = "deepseek"
    existing_character: dict | None = None


async def _save_characters(novel_id: int, characters_data: list, db: AsyncSession):
    """Save characters for a novel, deleting existing ones first."""
    existing = await db.execute(select(Character).where(Character.novel_id == novel_id))
    for c in existing.scalars().all():
        await db.delete(c)
    for char_data in characters_data:
        char = Character(
            novel_id=novel_id,
            name=char_data["name"],
            role=char_data.get("role", "配角"),
            identity=char_data.get("identity"),
            personality=char_data.get("personality"),
            tags=char_data.get("tags"),
            personality_tags=char_data.get("personality_tags"),
            motivation=char_data.get("motivation"),
            behavior_rules=char_data.get("behavior_rules"),
            speech_pattern=char_data.get("speech_pattern"),
            growth_arc_type=char_data.get("growth_arc_type"),
            relationship_masks=char_data.get("relationship_masks"),
        )
        db.add(char)


router = APIRouter(prefix="/api", tags=["writing"])


@router.post("/generate/idea")
async def api_generate_idea(data: IdeaRequest, db: AsyncSession = Depends(get_db)):
    result = await writing_engine.generate_idea(data.genre, data.creative_idea, data.model_id, db)
    return result


@router.post("/generate/regenerate-field")
async def api_regenerate_field(data: RegenerateFieldRequest):
    result = await writing_engine.regenerate_single_field(
        field_name=data.field_name,
        current_value=data.current_value,
        creative_idea=data.creative_idea,
        genre=data.genre,
        suggestion=data.suggestion,
        model_id=data.model_id,
    )
    return {"value": result}


@router.post("/novels/{novel_id}/generate/regenerate-field")
async def api_regenerate_novel_field(
    novel_id: int,
    data: RegenerateNovelFieldRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await writing_engine.regenerate_novel_field(
        novel_id=novel_id,
        field_name=data.field_name,
        current_value=data.current_value,
        suggestion=data.suggestion,
        model_id=data.model_id,
        db=db,
        chapter_number=data.chapter_number,
    )
    return {"value": result}


@router.post("/novels/{novel_id}/generate/outline")
async def api_generate_outline(novel_id: int, data: GenerateOutlineRequest, db: AsyncSession = Depends(get_db)):
    result = await writing_engine.generate_outline(novel_id, data.target_chapters, data.model_id, db)

    # 保存大纲和角色
    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    if outline:
        outline.story_background = result.get("story_background")
        outline.main_plot = result.get("main_plot")
        outline.plot_points = result.get("plot_points")

    await _save_characters(novel_id, result.get("characters", []), db)

    # 更新小说的简介和亮点
    novel = await db.get(Novel, novel_id)
    if novel:
        novel.synopsis = result.get("synopsis")
        novel.highlights = result.get("highlights")
        novel.target_chapters = data.target_chapters

    await db.commit()
    return result


@router.post("/novels/{novel_id}/chapters/{chapter_id}/generate")
async def api_generate_chapter(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    async def event_stream():
        async for chunk in writing_engine.generate_chapter_stream(
            novel_id, chapter_id, data.model_id, db,
            suggestion=data.suggestion,
            existing_content=data.existing_content,
        ):
            yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/novels/{novel_id}/chapters/{chapter_id}/extract-intel")
async def api_extract_intel(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await writing_engine.extract_chapter_intel(chapter_id, data.model_id, db)
    # 自动触发一致性检查
    try:
        conflicts = await writing_engine.check_consistency(chapter_id, data.model_id, db)
        result["consistency_conflicts"] = conflicts
    except Exception:
        result["consistency_conflicts"] = None
    return result


@router.post("/novels/{novel_id}/chapters/{chapter_id}/check-consistency")
async def api_check_consistency(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    conflicts = await writing_engine.check_consistency(chapter_id, data.model_id, db)
    return {"conflicts": conflicts}


@router.post("/generate/outline-from-prompt")
async def api_generate_outline_from_prompt(data: GenerateOutlineFromPromptRequest):
    result = await writing_engine.generate_outline_from_prompt(
        genre=data.genre,
        mode=data.mode,
        user_prompt=data.user_prompt,
        suggestion=data.suggestion,
        model_id=data.model_id,
    )
    return {"outline": result}


@router.post("/novels/{novel_id}/generate/extract-from-outline")
async def api_extract_from_outline(
    novel_id: int,
    data: ExtractFromOutlineRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await writing_engine.extract_from_outline(
        novel_id=novel_id,
        outline_text=data.outline_text,
        model_id=data.model_id,
        db=db,
    )

    # Save outline fields
    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    if outline:
        outline.story_background = result.get("story_background")
        outline.main_plot = result.get("main_plot")
        outline.plot_points = result.get("plot_points")
        outline.raw_outline = data.outline_text

    # Save characters (idempotent re-extraction)
    await _save_characters(novel_id, result.get("characters", []), db)

    # Update novel synopsis and highlights
    novel = await db.get(Novel, novel_id)
    if novel:
        novel.synopsis = result.get("synopsis")
        novel.highlights = result.get("highlights")

    await db.commit()
    return result


@router.post("/novels/{novel_id}/generate/character")
async def api_generate_character(
    novel_id: int,
    data: GenerateCharacterRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await writing_engine.generate_character(
        novel_id=novel_id,
        prompt=data.prompt,
        model_id=data.model_id,
        db=db,
        existing_character=data.existing_character,
    )
    return result
