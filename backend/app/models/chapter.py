from datetime import datetime

from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    chapter_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    chapter_outline: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="草稿")
    conflict_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    novel = relationship("Novel", back_populates="chapters")
    intel = relationship("ChapterIntel", back_populates="chapter", uselist=False, cascade="all, delete-orphan")
    chapter_characters = relationship("ChapterCharacter", back_populates="chapter", cascade="all, delete-orphan")


class ChapterCharacter(Base):
    __tablename__ = "chapter_characters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    role_in_chapter: Mapped[str | None] = mapped_column(Text, nullable=True)

    chapter = relationship("Chapter", back_populates="chapter_characters")


class ChapterIntel(Base):
    __tablename__ = "chapter_intels"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    plot_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    character_updates: Mapped[list | None] = mapped_column(JSON, nullable=True)
    relationship_changes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    new_foreshadowings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    resolved_foreshadowings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    timeline_events: Mapped[list | None] = mapped_column(JSON, nullable=True)
    next_chapter_required_chars: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    chapter = relationship("Chapter", back_populates="intel")
