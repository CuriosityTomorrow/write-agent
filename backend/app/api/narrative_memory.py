# backend/app/api/narrative_memory.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Novel, Chapter, ChapterIntel
from app.models.narrative_memory import NarrativeMemory
from app.schemas.narrative_memory import (
    NarrativeMemoryResponse, NarrativeMemoryUpdate,
    GenerateVolumeSummaryRequest, GenerateRangeSummaryRequest,
)
from app.services import writing_engine
from app.llm import get_provider, Message, GenerateConfig
from app.prompts import major_event

router = APIRouter(prefix="/api/novels/{novel_id}", tags=["narrative-memory"])


@router.get("/narrative-memories", response_model=list[NarrativeMemoryResponse])
async def list_narrative_memories(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NarrativeMemory)
        .where(NarrativeMemory.novel_id == novel_id)
        .order_by(NarrativeMemory.chapter_start)
    )
    return result.scalars().all()


@router.put("/narrative-memories/{mem_id}", response_model=NarrativeMemoryResponse)
async def update_narrative_memory(
    novel_id: int, mem_id: int, data: NarrativeMemoryUpdate, db: AsyncSession = Depends(get_db)
):
    mem = await db.get(NarrativeMemory, mem_id)
    if not mem or mem.novel_id != novel_id:
        raise HTTPException(404, "NarrativeMemory not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(mem, key, value)
    await db.commit()
    await db.refresh(mem)
    return mem


@router.post("/generate/volume-summary")
async def api_generate_volume_summary(
    novel_id: int, data: GenerateVolumeSummaryRequest, db: AsyncSession = Depends(get_db)
):
    result = await writing_engine.generate_volume_summary(
        novel_id, data.chapter_start, data.chapter_end, data.model_id, db
    )
    return result


@router.post("/generate/range-summary")
async def api_generate_range_summary(
    novel_id: int, data: GenerateRangeSummaryRequest, db: AsyncSession = Depends(get_db)
):
    """生成指定章节范围的摘要（用于回顾或大事件创意）"""
    # 收集 intel
    result = await db.execute(
        select(Chapter)
        .where(
            Chapter.novel_id == novel_id,
            Chapter.chapter_number >= data.chapter_start,
            Chapter.chapter_number <= data.chapter_end,
        )
        .order_by(Chapter.chapter_number)
    )
    chapters = result.scalars().all()

    intels_parts = []
    for ch in chapters:
        intel_result = await db.execute(
            select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
            .order_by(ChapterIntel.id.desc())
        )
        intel = intel_result.scalars().first()
        if intel:
            intels_parts.append(f"第{ch.chapter_number}章: {intel.plot_summary or ''}")

    if not intels_parts:
        raise HTTPException(400, "No intel found in specified range")

    intels_text = "\n".join(intels_parts)
    prompt = major_event.build_range_summary_prompt(intels_text, data.chapter_start, data.chapter_end)
    provider = get_provider(data.model_id)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=major_event.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.3, max_tokens=2000, stream=False),
    )
    from app.services.writing_engine import _parse_json
    return _parse_json(response)
