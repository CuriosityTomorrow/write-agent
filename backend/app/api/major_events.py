# backend/app/api/major_events.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Novel, Outline, Character, Foreshadowing
from app.llm import get_provider, Message, GenerateConfig
from app.prompts import major_event
from app.services.memory_system import ContextBuilder

router = APIRouter(prefix="/api/novels/{novel_id}/major-events", tags=["major-events"])


class MajorEventIdeasRequest(BaseModel):
    range_summary: str  # 前端先调 range-summary 拿到的摘要文本
    model_id: str = "deepseek"


class MajorEventCreate(BaseModel):
    title: str
    description: str
    target_chapter_start: int
    target_chapter_end: int
    buildup_start_chapter: int
    model_id: str = "deepseek"


def _parse_json(text: str) -> dict:
    import json, re
    text = text.strip()
    m = re.search(r'```(?:json)?\s*\n?(.*?)```', text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


@router.post("/generate-ideas")
async def generate_major_event_ideas(
    novel_id: int, data: MajorEventIdeasRequest, db: AsyncSession = Depends(get_db)
):
    """基于摘要生成大事件方向建议"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")

    # 构建小说信息
    novel_info = f"类型: {novel.genre}\n世界观: {novel.world_setting or ''}\n主角: {novel.protagonist_identity or ''}\n力量体系: {novel.power_system or ''}"

    # 获取当前章节数
    from sqlalchemy import func
    from app.models import Chapter
    result = await db.execute(
        select(func.max(Chapter.chapter_number)).where(Chapter.novel_id == novel_id)
    )
    current_chapter = result.scalar() or 1

    provider = get_provider(data.model_id)
    prompt = major_event.build_major_event_ideas_prompt(
        data.range_summary, novel_info, current_chapter
    )
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=major_event.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.7, max_tokens=2000, stream=False),
    )
    return _parse_json(response)


@router.post("")
async def create_major_event(
    novel_id: int, data: MajorEventCreate, db: AsyncSession = Depends(get_db)
):
    """创建大事件：更新大纲 plot_point + 生成铺垫计划 + 自动创建伏笔"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")

    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    if not outline:
        raise HTTPException(400, "No outline found")

    # 生成铺垫计划
    novel_info = f"类型: {novel.genre}\n世界观: {novel.world_setting or ''}\n主角: {novel.protagonist_identity or ''}\n力量体系: {novel.power_system or ''}"

    provider = get_provider(data.model_id)
    prompt = major_event.build_buildup_plan_prompt(
        data.title, data.description,
        data.buildup_start_chapter, data.target_chapter_start, data.target_chapter_end,
        novel_info,
    )
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=major_event.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.5, max_tokens=2000, stream=False),
    )
    plan_data = _parse_json(response)
    buildup_plan = plan_data.get("buildup_plan", {})

    # 构建新的 plot_point
    new_plot_point = {
        "chapter_range": f"第{data.target_chapter_start}-{data.target_chapter_end}章",
        "title": data.title,
        "summary": data.description,
        "key_conflicts": data.description,
        "foreshadowing_plan": [],
        "event_scale": "major",
        "buildup_start_chapter": data.buildup_start_chapter,
        "buildup_plan": buildup_plan,
        "status": "铺垫中",
    }

    # 更新大纲
    plot_points = outline.plot_points or []
    plot_points.append(new_plot_point)
    outline.plot_points = plot_points
    # SQLAlchemy JSON 需要标记为已修改
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(outline, "plot_points")

    # 自动创建伏笔
    created_foreshadowings = []
    for stage_name, stage in buildup_plan.items():
        for fs_data in stage.get("foreshadowings", []):
            fs = Foreshadowing(
                novel_id=novel_id,
                description=f"[{data.title}] {fs_data.get('description', '')}",
                status="埋设",
                foreshadowing_type=fs_data.get("type", "中线"),
                expected_resolve_start=data.target_chapter_start,
                expected_resolve_end=data.target_chapter_end,
            )
            db.add(fs)
            created_foreshadowings.append(fs_data.get("description", ""))

    await db.commit()

    return {
        "plot_point": new_plot_point,
        "created_foreshadowings": created_foreshadowings,
    }


@router.get("")
async def list_major_events(novel_id: int, db: AsyncSession = Depends(get_db)):
    """列出所有大事件（从 plot_points 中筛选 event_scale=major）"""
    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    if not outline or not outline.plot_points:
        return []
    return [pp for pp in outline.plot_points if isinstance(pp, dict) and pp.get("event_scale") == "major"]
