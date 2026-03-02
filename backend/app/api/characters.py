from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Character, CharacterRelationship
from app.schemas.character import CharacterCreate, CharacterUpdate, CharacterResponse, RelationshipCreate, RelationshipResponse

router = APIRouter(prefix="/api/novels/{novel_id}/characters", tags=["characters"])


@router.get("", response_model=list[CharacterResponse])
async def list_characters(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Character).where(Character.novel_id == novel_id))
    return result.scalars().all()


@router.post("", response_model=CharacterResponse)
async def create_character(novel_id: int, data: CharacterCreate, db: AsyncSession = Depends(get_db)):
    char = Character(novel_id=novel_id, **data.model_dump())
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return char


@router.put("/{char_id}", response_model=CharacterResponse)
async def update_character(novel_id: int, char_id: int, data: CharacterUpdate, db: AsyncSession = Depends(get_db)):
    char = await db.get(Character, char_id)
    if not char or char.novel_id != novel_id:
        raise HTTPException(404, "Character not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(char, key, value)
    await db.commit()
    await db.refresh(char)
    return char


@router.delete("/{char_id}")
async def delete_character(novel_id: int, char_id: int, db: AsyncSession = Depends(get_db)):
    char = await db.get(Character, char_id)
    if not char or char.novel_id != novel_id:
        raise HTTPException(404, "Character not found")
    await db.delete(char)
    await db.commit()
    return {"ok": True}


rel_router = APIRouter(prefix="/api/novels/{novel_id}/relationships", tags=["relationships"])


@rel_router.get("", response_model=list[RelationshipResponse])
async def list_relationships(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CharacterRelationship).where(CharacterRelationship.novel_id == novel_id))
    return result.scalars().all()


@rel_router.post("", response_model=RelationshipResponse)
async def create_relationship(novel_id: int, data: RelationshipCreate, db: AsyncSession = Depends(get_db)):
    rel = CharacterRelationship(novel_id=novel_id, **data.model_dump())
    db.add(rel)
    await db.commit()
    await db.refresh(rel)
    return rel
