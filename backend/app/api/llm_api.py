from fastapi import APIRouter
from app.llm import list_available_models

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.get("/models")
async def get_models():
    return {"models": list_available_models()}
