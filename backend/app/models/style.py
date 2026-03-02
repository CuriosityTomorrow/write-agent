from datetime import datetime

from sqlalchemy import String, Text, Integer, Boolean, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WritingStyle(Base):
    __tablename__ = "writing_styles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    source_author: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_work: Mapped[str | None] = mapped_column(String(200), nullable=True)
    dimensions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sample_excerpts: Mapped[list | None] = mapped_column(JSON, nullable=True)
    generated_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class NarrativeBlueprint(Base):
    __tablename__ = "narrative_blueprints"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_authors: Mapped[list | None] = mapped_column(JSON, nullable=True)
    source_works: Mapped[list | None] = mapped_column(JSON, nullable=True)
    opening_pattern: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    character_archetypes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    plot_cycle: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stage_progression: Mapped[list | None] = mapped_column(JSON, nullable=True)
    pacing: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    foreshadowing_rhythm: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    generated_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class StyleLibrary(Base):
    __tablename__ = "style_libraries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    author: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_path: Mapped[str] = mapped_column(String(500))
    file_type: Mapped[str] = mapped_column(String(10))
    total_words: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_chapters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    analysis_status: Mapped[str] = mapped_column(String(20), default="未分析")
    extracted_style_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    extracted_blueprint_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
