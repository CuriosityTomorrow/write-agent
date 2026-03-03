from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chapter, ChapterCharacter, ChapterIntel, Foreshadowing
from app.schemas.chapter import ChapterCreate, ChapterUpdate, ChapterResponse, ChapterIntelResponse
from app.schemas.style import ForeshadowingCreate, ForeshadowingUpdate, ForeshadowingResponse

router = APIRouter(prefix="/api/novels/{novel_id}/chapters", tags=["chapters"])


@router.get("", response_model=list[ChapterResponse])
async def list_chapters(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Chapter).where(Chapter.novel_id == novel_id).order_by(Chapter.chapter_number)
    )
    return result.scalars().all()


@router.post("", response_model=ChapterResponse)
async def create_chapter(novel_id: int, data: ChapterCreate, db: AsyncSession = Depends(get_db)):
    # 自动计算章节号
    result = await db.execute(
        select(func.max(Chapter.chapter_number)).where(Chapter.novel_id == novel_id)
    )
    max_num = result.scalar() or 0
    chapter = Chapter(
        novel_id=novel_id,
        chapter_number=max_num + 1,
        chapter_outline=data.chapter_outline,
        target_word_count=data.target_word_count,
        conflict_description=data.conflict_description,
    )
    db.add(chapter)
    await db.flush()

    # 配置角色
    for cid in (data.required_character_ids or []):
        db.add(ChapterCharacter(chapter_id=chapter.id, character_id=cid, is_required=True))
    for cid in (data.optional_character_ids or []):
        db.add(ChapterCharacter(chapter_id=chapter.id, character_id=cid, is_required=False))

    await db.commit()
    await db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(novel_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or chapter.novel_id != novel_id:
        raise HTTPException(404, "Chapter not found")
    return chapter


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(novel_id: int, chapter_id: int, data: ChapterUpdate, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or chapter.novel_id != novel_id:
        raise HTTPException(404, "Chapter not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(chapter, key, value)
    if data.content is not None:
        chapter.actual_word_count = len(data.content)
    await db.commit()
    await db.refresh(chapter)
    return chapter


@router.delete("/{chapter_id}")
async def delete_chapter(novel_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or chapter.novel_id != novel_id:
        raise HTTPException(404, "Chapter not found")
    # 只允许删除最新的章节（防止中间删除导致章节号混乱）
    result = await db.execute(
        select(func.max(Chapter.chapter_number)).where(Chapter.novel_id == novel_id)
    )
    max_num = result.scalar()
    if chapter.chapter_number != max_num:
        raise HTTPException(400, "只能删除最新的章节")
    await db.delete(chapter)
    await db.commit()
    return {"ok": True}


@router.get("/{chapter_id}/intel", response_model=ChapterIntelResponse | None)
async def get_chapter_intel(novel_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChapterIntel).where(ChapterIntel.chapter_id == chapter_id))
    return result.scalar_one_or_none()


# --- Foreshadowing ---
fs_router = APIRouter(prefix="/api/novels/{novel_id}/foreshadowings", tags=["foreshadowings"])


@fs_router.get("", response_model=list[ForeshadowingResponse])
async def list_foreshadowings(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Foreshadowing).where(Foreshadowing.novel_id == novel_id)
    )
    return result.scalars().all()


@fs_router.post("", response_model=ForeshadowingResponse)
async def create_foreshadowing(novel_id: int, data: ForeshadowingCreate, db: AsyncSession = Depends(get_db)):
    fs = Foreshadowing(novel_id=novel_id, **data.model_dump())
    db.add(fs)
    await db.commit()
    await db.refresh(fs)
    return fs


@fs_router.put("/{fs_id}", response_model=ForeshadowingResponse)
async def update_foreshadowing(novel_id: int, fs_id: int, data: ForeshadowingUpdate, db: AsyncSession = Depends(get_db)):
    fs = await db.get(Foreshadowing, fs_id)
    if not fs or fs.novel_id != novel_id:
        raise HTTPException(404, "Foreshadowing not found")
    for field in ("description", "foreshadowing_type", "expected_resolve_start", "expected_resolve_end"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(fs, field, val)
    if data.status:
        fs.status = data.status
    if data.resolved_chapter_id:
        fs.resolved_chapter_id = data.resolved_chapter_id
    if data.progress_note:
        notes = fs.progress_notes or []
        notes.append(data.progress_note)
        fs.progress_notes = notes
    await db.commit()
    await db.refresh(fs)
    return fs


class AdoptSuggestionRequest(BaseModel):
    description: str
    foreshadowing_type: str = "中线"
    expected_resolve_chapter: int | None = None


@fs_router.post("/adopt-suggestion", response_model=ForeshadowingResponse)
async def adopt_suggested_foreshadowing(
    novel_id: int,
    data: AdoptSuggestionRequest,
    db: AsyncSession = Depends(get_db),
):
    """将 AI 建议的伏笔采纳为正式伏笔"""
    resolve_start, resolve_end = None, None
    if data.expected_resolve_chapter and data.expected_resolve_chapter > 0:
        if data.foreshadowing_type == "短线":
            resolve_start = max(1, data.expected_resolve_chapter - 1)
            resolve_end = data.expected_resolve_chapter + 1
        elif data.foreshadowing_type == "中线":
            resolve_start = max(1, data.expected_resolve_chapter - 5)
            resolve_end = data.expected_resolve_chapter + 5

    fs = Foreshadowing(
        novel_id=novel_id,
        description=data.description,
        status="埋设",
        foreshadowing_type=data.foreshadowing_type,
        expected_resolve_start=resolve_start,
        expected_resolve_end=resolve_end,
    )
    db.add(fs)
    await db.commit()
    await db.refresh(fs)
    return fs
