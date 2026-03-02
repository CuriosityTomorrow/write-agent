from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Novel, Chapter


async def export_novel_txt(novel_id: int, db: AsyncSession) -> str:
    """导出小说为 TXT 格式 (网文排版)"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise ValueError("Novel not found")

    result = await db.execute(
        select(Chapter)
        .where(Chapter.novel_id == novel_id, Chapter.content.isnot(None))
        .order_by(Chapter.chapter_number)
    )
    chapters = result.scalars().all()

    lines = [f"《{novel.title}》", f"作者：{novel.author_name}", "", ""]

    for ch in chapters:
        title = ch.title or f"第{ch.chapter_number}章"
        lines.append(f"  {title}")
        lines.append("")
        # 网文排版：每段开头空两格
        if ch.content:
            for paragraph in ch.content.split("\n"):
                paragraph = paragraph.strip()
                if paragraph:
                    if not paragraph.startswith("\u3000\u3000"):
                        paragraph = f"\u3000\u3000{paragraph}"
                    lines.append(paragraph)
                else:
                    lines.append("")
        lines.append("")
        lines.append("")

    return "\n".join(lines)
