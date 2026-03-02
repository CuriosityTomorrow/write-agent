from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Novel(Base):
    __tablename__ = "novels"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    author_name: Mapped[str] = mapped_column(String(100))
    genre: Mapped[str] = mapped_column(String(20))
    mode: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="创作中")
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    synopsis: Mapped[str | None] = mapped_column(Text, nullable=True)
    highlights: Mapped[str | None] = mapped_column(Text, nullable=True)
    world_setting: Mapped[str | None] = mapped_column(Text, nullable=True)
    core_conflict: Mapped[str | None] = mapped_column(Text, nullable=True)
    protagonist_identity: Mapped[str | None] = mapped_column(Text, nullable=True)
    golden_finger: Mapped[str | None] = mapped_column(Text, nullable=True)
    antagonist_setting: Mapped[str | None] = mapped_column(Text, nullable=True)
    power_system: Mapped[str | None] = mapped_column(Text, nullable=True)
    core_suspense: Mapped[str | None] = mapped_column(Text, nullable=True)
    story_stage: Mapped[str | None] = mapped_column(Text, nullable=True)
    style_tone: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_chapters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selected_style_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selected_blueprint_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    characters = relationship("Character", back_populates="novel", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="novel", cascade="all, delete-orphan", order_by="Chapter.chapter_number")
    outline = relationship("Outline", back_populates="novel", uselist=False, cascade="all, delete-orphan")
    foreshadowings = relationship("Foreshadowing", back_populates="novel", cascade="all, delete-orphan")


class Outline(Base):
    __tablename__ = "outlines"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    story_background: Mapped[str | None] = mapped_column(Text, nullable=True)
    main_plot: Mapped[str | None] = mapped_column(Text, nullable=True)
    plot_points: Mapped[list | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    novel = relationship("Novel", back_populates="outline")
