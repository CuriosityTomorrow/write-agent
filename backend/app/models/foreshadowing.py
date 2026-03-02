from datetime import datetime

from sqlalchemy import String, Text, Integer, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Foreshadowing(Base):
    __tablename__ = "foreshadowings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(Text)
    created_chapter_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="埋设")
    resolved_chapter_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    progress_notes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    novel = relationship("Novel", back_populates="foreshadowings")
