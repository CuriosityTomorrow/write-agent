from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Novel, Outline
from app.schemas.novel import NovelCreate, NovelUpdate, NovelResponse, OutlineUpdate, OutlineResponse

router = APIRouter(prefix="/api/novels", tags=["novels"])


@router.get("", response_model=list[NovelResponse])
async def list_novels(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Novel).order_by(Novel.updated_at.desc()))
    return result.scalars().all()


@router.post("", response_model=NovelResponse)
async def create_novel(data: NovelCreate, db: AsyncSession = Depends(get_db)):
    novel = Novel(**data.model_dump())
    db.add(novel)
    await db.commit()
    await db.refresh(novel)
    outline = Outline(novel_id=novel.id)
    db.add(outline)
    await db.commit()
    return novel


@router.get("/{novel_id}", response_model=NovelResponse)
async def get_novel(novel_id: int, db: AsyncSession = Depends(get_db)):
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")
    return novel


@router.put("/{novel_id}", response_model=NovelResponse)
async def update_novel(novel_id: int, data: NovelUpdate, db: AsyncSession = Depends(get_db)):
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(novel, key, value)
    await db.commit()
    await db.refresh(novel)
    return novel


@router.delete("/{novel_id}")
async def delete_novel(novel_id: int, db: AsyncSession = Depends(get_db)):
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")
    await db.delete(novel)
    await db.commit()
    return {"ok": True}


@router.get("/{novel_id}/outline", response_model=OutlineResponse)
async def get_outline(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = result.scalar_one_or_none()
    if not outline:
        raise HTTPException(404, "Outline not found")
    return outline


@router.put("/{novel_id}/outline", response_model=OutlineResponse)
async def update_outline(novel_id: int, data: OutlineUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = result.scalar_one_or_none()
    if not outline:
        raise HTTPException(404, "Outline not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(outline, key, value)
    await db.commit()
    await db.refresh(outline)
    return outline
