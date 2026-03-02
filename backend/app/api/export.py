from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.export_service import export_novel_txt

router = APIRouter(prefix="/api/novels/{novel_id}/export", tags=["export"])


@router.get("/txt")
async def export_txt(novel_id: int, db: AsyncSession = Depends(get_db)):
    content = await export_novel_txt(novel_id, db)
    return Response(
        content=content.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=novel_{novel_id}.txt"},
    )
