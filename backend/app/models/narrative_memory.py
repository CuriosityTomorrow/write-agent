from datetime import datetime

from sqlalchemy import String, Text, Integer, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class NarrativeMemory(Base):
    __tablename__ = "narrative_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    memory_type: Mapped[str] = mapped_column(String(20))  # "volume" / "arc" / "global"
    chapter_start: Mapped[int] = mapped_column(Integer)
    chapter_end: Mapped[int] = mapped_column(Integer)

    plot_progression: Mapped[str] = mapped_column(Text)
    character_states: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    relationship_changes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    unresolved_threads: Mapped[list | None] = mapped_column(JSON, nullable=True)
    world_state_changes: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    novel = relationship("Novel", back_populates="narrative_memories")
