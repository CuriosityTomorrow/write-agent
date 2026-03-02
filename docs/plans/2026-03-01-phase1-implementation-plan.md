# Phase 1: 写作 Agent MVP 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 搭建完整可用的写作 Agent MVP，支持创建小说、生成大纲、逐章生成内容、结构化记忆系统、多模型切换、TXT 导出。

**Architecture:** Python FastAPI 后端 + React TypeScript 前端，MySQL 数据库 (Docker)，LLM Adapter Layer 统一适配多模型，Pipeline 式写作引擎，结构化记忆系统保障长篇连贯性。

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, MySQL 8, React 18, TypeScript, Vite, Zustand, TailwindCSS

---

## Task 1: 项目脚手架与 Docker 环境

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/Dockerfile`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: 创建 docker-compose.yml**

```yaml
# docker-compose.yml
version: "3.8"
services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-writeagent123}
      MYSQL_DATABASE: write_agent
      MYSQL_CHARACTER_SET_SERVER: utf8mb4
      MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    env_file: .env
    depends_on:
      mysql:
        condition: service_healthy
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

volumes:
  mysql_data:
```

**Step 2: 创建 backend/requirements.txt**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy[asyncio]==2.0.36
aiomysql==0.2.0
alembic==1.14.1
pydantic==2.10.4
pydantic-settings==2.7.1
python-dotenv==1.0.1
httpx==0.28.1
openai==1.59.7
anthropic==0.42.0
google-genai==1.0.0
zhipuai==2.1.5
tiktoken==0.8.0
python-multipart==0.0.20
```

**Step 3: 创建 backend/app/config.py**

```python
# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "mysql+aiomysql://root:writeagent123@localhost:3306/write_agent"

    # LLM API Keys
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    ZHIPU_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    MINIMAX_API_KEY: str = ""
    MINIMAX_GROUP_ID: str = ""
    XAI_API_KEY: str = ""
    DASHSCOPE_API_KEY: str = ""

    # App
    UPLOAD_DIR: str = "./uploads"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
```

**Step 4: 创建 backend/app/database.py**

```python
# backend/app/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session
```

**Step 5: 创建 backend/app/main.py**

```python
# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="写作 Agent API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}
```

**Step 6: 创建 .env.example 和 .gitignore**

`.env.example`:
```
DATABASE_URL=mysql+aiomysql://root:writeagent123@localhost:3306/write_agent
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
ZHIPU_API_KEY=
MINIMAX_API_KEY=
MINIMAX_GROUP_ID=
XAI_API_KEY=
```

`.gitignore`:
```
__pycache__/
*.pyc
.env
node_modules/
dist/
.vite/
uploads/
*.egg-info/
.mypy_cache/
```

**Step 7: 创建 backend/Dockerfile**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Step 8: 创建 backend/app/__init__.py**

空文件。

**Step 9: 验证后端启动**

```bash
cd backend && pip install -r requirements.txt
# 启动 MySQL
docker compose up mysql -d
# 启动后端
uvicorn app.main:app --reload
# 测试
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

**Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: project scaffolding - FastAPI + MySQL + Docker"
```

---

## Task 2: 数据模型 (SQLAlchemy Models)

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/novel.py`
- Create: `backend/app/models/character.py`
- Create: `backend/app/models/chapter.py`
- Create: `backend/app/models/style.py`
- Create: `backend/app/models/foreshadowing.py`

**Step 1: 创建 Novel 模型**

```python
# backend/app/models/novel.py
from datetime import datetime

from sqlalchemy import String, Text, Integer, Enum, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Novel(Base):
    __tablename__ = "novels"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    author_name: Mapped[str] = mapped_column(String(100))
    genre: Mapped[str] = mapped_column(String(20))  # 男频/女频
    mode: Mapped[str] = mapped_column(String(20))  # 长篇/短篇
    status: Mapped[str] = mapped_column(String(20), default="创作中")
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    synopsis: Mapped[str | None] = mapped_column(Text, nullable=True)
    highlights: Mapped[str | None] = mapped_column(Text, nullable=True)
    world_setting: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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

    # Relationships
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
```

**Step 2: 创建 Character 模型**

```python
# backend/app/models/character.py
from datetime import datetime

from sqlalchemy import String, Text, Integer, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))  # 主角/配角/反派
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    identity: Mapped[str | None] = mapped_column(Text, nullable=True)
    personality: Mapped[str | None] = mapped_column(Text, nullable=True)
    golden_finger: Mapped[str | None] = mapped_column(Text, nullable=True)
    background: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    emotional_state: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    novel = relationship("Novel", back_populates="characters")


class CharacterRelationship(Base):
    __tablename__ = "character_relationships"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    novel_id: Mapped[int] = mapped_column(ForeignKey("novels.id", ondelete="CASCADE"))
    character_a_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    character_b_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    relation_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    established_chapter_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
```

**Step 3: 创建 Chapter 模型**

```python
# backend/app/models/chapter.py
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
```

**Step 4: 创建 Foreshadowing 模型**

```python
# backend/app/models/foreshadowing.py
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
    status: Mapped[str] = mapped_column(String(20), default="埋设")  # 埋设/推进中/已解决
    resolved_chapter_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    progress_notes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    novel = relationship("Novel", back_populates="foreshadowings")
```

**Step 5: 创建 Style 模型**

```python
# backend/app/models/style.py
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
```

**Step 6: 创建 models/__init__.py 汇总导出**

```python
# backend/app/models/__init__.py
from app.models.novel import Novel, Outline
from app.models.character import Character, CharacterRelationship
from app.models.chapter import Chapter, ChapterCharacter, ChapterIntel
from app.models.foreshadowing import Foreshadowing
from app.models.style import WritingStyle, NarrativeBlueprint, StyleLibrary

__all__ = [
    "Novel", "Outline",
    "Character", "CharacterRelationship",
    "Chapter", "ChapterCharacter", "ChapterIntel",
    "Foreshadowing",
    "WritingStyle", "NarrativeBlueprint", "StyleLibrary",
]
```

**Step 7: 在 main.py 中导入 models 确保建表**

在 `backend/app/main.py` 的 lifespan 函数之前添加:
```python
import app.models  # noqa: F401  确保所有模型被注册
```

**Step 8: 验证数据库建表**

```bash
# 确保 MySQL 在运行
docker compose up mysql -d
# 启动后端 (会自动建表)
cd backend && uvicorn app.main:app --reload
# 检查表是否创建
docker compose exec mysql mysql -uroot -pwriteagent123 write_agent -e "SHOW TABLES;"
# Expected: 应该看到 novels, characters, chapters, etc.
```

**Step 9: Commit**

```bash
git add backend/app/models/
git commit -m "feat: add all SQLAlchemy data models"
```

---

## Task 3: Pydantic Schemas (API 请求/响应模型)

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/novel.py`
- Create: `backend/app/schemas/character.py`
- Create: `backend/app/schemas/chapter.py`
- Create: `backend/app/schemas/style.py`
- Create: `backend/app/schemas/llm.py`

**Step 1: Novel schemas**

```python
# backend/app/schemas/novel.py
from pydantic import BaseModel
from datetime import datetime


class NovelCreate(BaseModel):
    title: str
    author_name: str
    genre: str  # 男频/女频
    mode: str  # 长篇/短篇
    target_chapters: int | None = None
    selected_style_id: int | None = None
    selected_blueprint_id: int | None = None


class NovelUpdate(BaseModel):
    title: str | None = None
    author_name: str | None = None
    genre: str | None = None
    status: str | None = None
    cover_url: str | None = None
    synopsis: str | None = None
    highlights: str | None = None
    world_setting: dict | None = None
    core_conflict: str | None = None
    protagonist_identity: str | None = None
    golden_finger: str | None = None
    antagonist_setting: str | None = None
    power_system: str | None = None
    core_suspense: str | None = None
    story_stage: str | None = None
    style_tone: str | None = None
    target_chapters: int | None = None
    selected_style_id: int | None = None
    selected_blueprint_id: int | None = None


class NovelResponse(BaseModel):
    id: int
    title: str
    author_name: str
    genre: str
    mode: str
    status: str
    cover_url: str | None = None
    synopsis: str | None = None
    highlights: str | None = None
    world_setting: dict | None = None
    core_conflict: str | None = None
    protagonist_identity: str | None = None
    golden_finger: str | None = None
    antagonist_setting: str | None = None
    power_system: str | None = None
    core_suspense: str | None = None
    story_stage: str | None = None
    style_tone: str | None = None
    target_chapters: int | None = None
    selected_style_id: int | None = None
    selected_blueprint_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OutlineUpdate(BaseModel):
    story_background: str | None = None
    main_plot: str | None = None
    plot_points: list | None = None


class OutlineResponse(BaseModel):
    id: int
    novel_id: int
    story_background: str | None = None
    main_plot: str | None = None
    plot_points: list | None = None

    model_config = {"from_attributes": True}


class IdeaRequest(BaseModel):
    genre: str
    creative_idea: str
    model_id: str = "deepseek"


class IdeaResponse(BaseModel):
    world_setting: dict
    protagonist_identity: str
    core_conflict: str
    golden_finger: str
    antagonist_setting: str
    power_system: str
    core_suspense: str
    story_stage: str
    style_tone: str
    suggested_titles: list[str]
```

**Step 2: Character schemas**

```python
# backend/app/schemas/character.py
from pydantic import BaseModel
from datetime import datetime


class CharacterCreate(BaseModel):
    name: str
    role: str  # 主角/配角/反派
    tags: list[str] | None = None
    identity: str | None = None
    personality: str | None = None
    golden_finger: str | None = None
    background: str | None = None


class CharacterUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    tags: list[str] | None = None
    identity: str | None = None
    personality: str | None = None
    golden_finger: str | None = None
    background: str | None = None
    current_status: str | None = None
    current_location: str | None = None
    emotional_state: str | None = None


class CharacterResponse(BaseModel):
    id: int
    novel_id: int
    name: str
    role: str
    tags: list[str] | None = None
    identity: str | None = None
    personality: str | None = None
    golden_finger: str | None = None
    background: str | None = None
    current_status: str | None = None
    current_location: str | None = None
    emotional_state: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RelationshipCreate(BaseModel):
    character_a_id: int
    character_b_id: int
    relation_type: str
    description: str | None = None


class RelationshipResponse(BaseModel):
    id: int
    character_a_id: int
    character_b_id: int
    relation_type: str
    description: str | None = None

    model_config = {"from_attributes": True}
```

**Step 3: Chapter schemas**

```python
# backend/app/schemas/chapter.py
from pydantic import BaseModel
from datetime import datetime


class ChapterCreate(BaseModel):
    chapter_outline: str | None = None
    target_word_count: int | None = 3000
    conflict_description: str | None = None
    required_character_ids: list[int] | None = None
    optional_character_ids: list[int] | None = None
    foreshadowing_ids: list[int] | None = None  # 本章推进的伏笔


class ChapterUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    chapter_outline: str | None = None
    status: str | None = None
    conflict_description: str | None = None


class ChapterResponse(BaseModel):
    id: int
    novel_id: int
    chapter_number: int
    title: str | None = None
    content: str | None = None
    chapter_outline: str | None = None
    target_word_count: int | None = None
    actual_word_count: int | None = None
    status: str
    conflict_description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChapterIntelResponse(BaseModel):
    id: int
    chapter_id: int
    plot_summary: str | None = None
    character_updates: list | None = None
    relationship_changes: list | None = None
    new_foreshadowings: list | None = None
    resolved_foreshadowings: list | None = None
    timeline_events: list | None = None
    next_chapter_required_chars: list | None = None

    model_config = {"from_attributes": True}


class GenerateChapterRequest(BaseModel):
    model_id: str = "deepseek"


class GenerateOutlineRequest(BaseModel):
    target_chapters: int
    model_id: str = "deepseek"
```

**Step 4: LLM schemas**

```python
# backend/app/schemas/llm.py
from pydantic import BaseModel


class LLMConfig(BaseModel):
    provider: str  # deepseek, qwen, zhipu, minimax, gemini, claude, gpt, grok
    api_key: str


class LLMConfigUpdate(BaseModel):
    configs: dict[str, str]  # provider_name -> api_key


class AvailableModelsResponse(BaseModel):
    models: list[dict]  # [{id, name, provider, max_context}]
```

**Step 5: Style schemas**

```python
# backend/app/schemas/style.py
from pydantic import BaseModel
from datetime import datetime


class WritingStyleResponse(BaseModel):
    id: int
    name: str
    source_author: str | None = None
    source_work: str | None = None
    dimensions: dict | None = None
    sample_excerpts: list | None = None
    generated_prompt: str | None = None
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NarrativeBlueprintResponse(BaseModel):
    id: int
    name: str
    category: str | None = None
    source_authors: list | None = None
    source_works: list | None = None
    opening_pattern: dict | None = None
    character_archetypes: dict | None = None
    plot_cycle: dict | None = None
    stage_progression: list | None = None
    pacing: dict | None = None
    foreshadowing_rhythm: dict | None = None
    generated_prompt: str | None = None
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ForeshadowingCreate(BaseModel):
    description: str
    created_chapter_id: int | None = None


class ForeshadowingUpdate(BaseModel):
    status: str | None = None
    resolved_chapter_id: int | None = None
    progress_note: str | None = None  # 追加到 progress_notes


class ForeshadowingResponse(BaseModel):
    id: int
    novel_id: int
    description: str
    created_chapter_id: int | None = None
    status: str
    resolved_chapter_id: int | None = None
    progress_notes: list | None = None

    model_config = {"from_attributes": True}
```

**Step 6: schemas/__init__.py**

```python
# backend/app/schemas/__init__.py
```

**Step 7: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat: add Pydantic schemas for API"
```

---

## Task 4: LLM Adapter Layer

**Files:**
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/base.py`
- Create: `backend/app/llm/openai_compatible.py`
- Create: `backend/app/llm/gemini_provider.py`
- Create: `backend/app/llm/claude_provider.py`
- Create: `backend/app/llm/registry.py`

**Step 1: 创建 LLM 基类**

```python
# backend/app/llm/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncGenerator


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class GenerateConfig:
    temperature: float = 0.7
    max_tokens: int = 4096
    top_p: float = 0.9
    stream: bool = True


class LLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式生成文本，yield 每个 chunk"""
        ...

    @abstractmethod
    async def generate_complete(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> str:
        """非流式，返回完整文本"""
        ...

    @abstractmethod
    def max_context_length(self) -> int:
        ...

    @abstractmethod
    def model_id(self) -> str:
        ...

    @abstractmethod
    def display_name(self) -> str:
        ...
```

**Step 2: 创建 OpenAI 兼容适配器 (覆盖 DeepSeek, Qwen, GPT, Grok)**

```python
# backend/app/llm/openai_compatible.py
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.llm.base import LLMProvider, Message, GenerateConfig


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        display: str,
        max_context: int,
    ):
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._display = display
        self._max_context = max_context

    async def generate(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> AsyncGenerator[str, None]:
        config = config or GenerateConfig()
        msgs = self._build_messages(messages, system_prompt)
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=msgs,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            top_p=config.top_p,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def generate_complete(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> str:
        config = config or GenerateConfig(stream=False)
        msgs = self._build_messages(messages, system_prompt)
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=msgs,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            top_p=config.top_p,
            stream=False,
        )
        return response.choices[0].message.content or ""

    def _build_messages(self, messages: list[Message], system_prompt: str) -> list[dict]:
        msgs = []
        if system_prompt:
            msgs.append({"role": "system", "content": system_prompt})
        for m in messages:
            msgs.append({"role": m.role, "content": m.content})
        return msgs

    def max_context_length(self) -> int:
        return self._max_context

    def model_id(self) -> str:
        return self._model

    def display_name(self) -> str:
        return self._display
```

**Step 3: 创建 Gemini 适配器**

```python
# backend/app/llm/gemini_provider.py
from typing import AsyncGenerator

from google import genai
from google.genai import types

from app.llm.base import LLMProvider, Message, GenerateConfig


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.5-pro", max_context: int = 1000000):
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._max_context = max_context

    async def generate(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> AsyncGenerator[str, None]:
        config = config or GenerateConfig()
        contents = [{"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]} for m in messages]
        gen_config = types.GenerateContentConfig(
            temperature=config.temperature,
            max_output_tokens=config.max_tokens,
            top_p=config.top_p,
            system_instruction=system_prompt or None,
        )
        async for chunk in self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=contents,
            config=gen_config,
        ):
            if chunk.text:
                yield chunk.text

    async def generate_complete(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> str:
        config = config or GenerateConfig()
        contents = [{"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]} for m in messages]
        gen_config = types.GenerateContentConfig(
            temperature=config.temperature,
            max_output_tokens=config.max_tokens,
            top_p=config.top_p,
            system_instruction=system_prompt or None,
        )
        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=contents,
            config=gen_config,
        )
        return response.text or ""

    def max_context_length(self) -> int:
        return self._max_context

    def model_id(self) -> str:
        return self._model

    def display_name(self) -> str:
        return f"Gemini ({self._model})"
```

**Step 4: 创建 Claude 适配器**

```python
# backend/app/llm/claude_provider.py
from typing import AsyncGenerator

from anthropic import AsyncAnthropic

from app.llm.base import LLMProvider, Message, GenerateConfig


class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6", max_context: int = 200000):
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model
        self._max_context = max_context

    async def generate(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> AsyncGenerator[str, None]:
        config = config or GenerateConfig()
        msgs = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        async with self._client.messages.stream(
            model=self._model,
            messages=msgs,
            system=system_prompt or "",
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            top_p=config.top_p,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def generate_complete(
        self,
        messages: list[Message],
        system_prompt: str = "",
        config: GenerateConfig | None = None,
    ) -> str:
        config = config or GenerateConfig()
        msgs = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        response = await self._client.messages.create(
            model=self._model,
            messages=msgs,
            system=system_prompt or "",
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            top_p=config.top_p,
        )
        return response.content[0].text

    def max_context_length(self) -> int:
        return self._max_context

    def model_id(self) -> str:
        return self._model

    def display_name(self) -> str:
        return f"Claude ({self._model})"
```

**Step 5: 创建 LLM Registry (模型注册中心)**

```python
# backend/app/llm/registry.py
from app.config import settings
from app.llm.base import LLMProvider
from app.llm.openai_compatible import OpenAICompatibleProvider
from app.llm.gemini_provider import GeminiProvider
from app.llm.claude_provider import ClaudeProvider

# 模型配置表
MODEL_CONFIGS = {
    "deepseek": {
        "class": OpenAICompatibleProvider,
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "display": "DeepSeek V3",
        "max_context": 64000,
        "api_key_setting": "DEEPSEEK_API_KEY",
    },
    "qwen": {
        "class": OpenAICompatibleProvider,
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-max",
        "display": "通义千问 Max",
        "max_context": 32000,
        "api_key_setting": "DASHSCOPE_API_KEY",
    },
    "gpt": {
        "class": OpenAICompatibleProvider,
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o",
        "display": "GPT-4o",
        "max_context": 128000,
        "api_key_setting": "OPENAI_API_KEY",
    },
    "grok": {
        "class": OpenAICompatibleProvider,
        "base_url": "https://api.x.ai/v1",
        "model": "grok-3",
        "display": "Grok 3",
        "max_context": 131072,
        "api_key_setting": "XAI_API_KEY",
    },
    "gemini": {
        "class": GeminiProvider,
        "model": "gemini-2.5-pro",
        "max_context": 1000000,
        "api_key_setting": "GOOGLE_API_KEY",
    },
    "claude": {
        "class": ClaudeProvider,
        "model": "claude-sonnet-4-6",
        "max_context": 200000,
        "api_key_setting": "ANTHROPIC_API_KEY",
    },
}


def get_provider(provider_id: str) -> LLMProvider:
    """根据 provider_id 创建对应的 LLM Provider 实例"""
    if provider_id not in MODEL_CONFIGS:
        raise ValueError(f"Unknown provider: {provider_id}. Available: {list(MODEL_CONFIGS.keys())}")

    cfg = MODEL_CONFIGS[provider_id]
    api_key = getattr(settings, cfg["api_key_setting"], "")

    if not api_key:
        raise ValueError(f"API key not configured for {provider_id}. Set {cfg['api_key_setting']} in .env")

    provider_class = cfg["class"]

    if provider_class == OpenAICompatibleProvider:
        return provider_class(
            api_key=api_key,
            base_url=cfg["base_url"],
            model=cfg["model"],
            display=cfg["display"],
            max_context=cfg["max_context"],
        )
    elif provider_class == GeminiProvider:
        return provider_class(api_key=api_key, model=cfg["model"], max_context=cfg["max_context"])
    elif provider_class == ClaudeProvider:
        return provider_class(api_key=api_key, model=cfg["model"], max_context=cfg["max_context"])
    else:
        raise ValueError(f"Unknown provider class for {provider_id}")


def list_available_models() -> list[dict]:
    """列出所有已配置 API Key 的可用模型"""
    models = []
    for pid, cfg in MODEL_CONFIGS.items():
        api_key = getattr(settings, cfg["api_key_setting"], "")
        models.append({
            "id": pid,
            "name": cfg.get("display", cfg["model"]),
            "model": cfg["model"],
            "max_context": cfg["max_context"],
            "available": bool(api_key),
        })
    return models
```

**Step 6: llm/__init__.py**

```python
# backend/app/llm/__init__.py
from app.llm.base import LLMProvider, Message, GenerateConfig
from app.llm.registry import get_provider, list_available_models

__all__ = ["LLMProvider", "Message", "GenerateConfig", "get_provider", "list_available_models"]
```

**Step 7: Commit**

```bash
git add backend/app/llm/
git commit -m "feat: LLM adapter layer - DeepSeek/Qwen/GPT/Grok/Gemini/Claude"
```

---

## Task 5: 核心 API 路由 (Novel + Character CRUD)

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/novels.py`
- Create: `backend/app/api/characters.py`
- Create: `backend/app/api/llm_api.py`
- Modify: `backend/app/main.py` (注册路由)

**Step 1: Novel CRUD API**

```python
# backend/app/api/novels.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Novel, Outline
from app.schemas.novel import NovelCreate, NovelUpdate, NovelResponse, OutlineUpdate, OutlineResponse

router = APIRouter(prefix="/api/novels", tags=["novels"])


@router.get("", response_model=list[NovelResponse])
async def list_novels(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Novel).order_by(Novel.updated_at.desc()))
    return result.scalars().all()


@router.post("", response_model=NovelResponse)
async def create_novel(data: NovelCreate, db: AsyncSession = Depends(get_db)):
    novel = Novel(**data.model_dump())
    db.add(novel)
    await db.commit()
    await db.refresh(novel)
    # 同时创建空大纲
    outline = Outline(novel_id=novel.id)
    db.add(outline)
    await db.commit()
    return novel


@router.get("/{novel_id}", response_model=NovelResponse)
async def get_novel(novel_id: int, db: AsyncSession = Depends(get_db)):
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")
    return novel


@router.put("/{novel_id}", response_model=NovelResponse)
async def update_novel(novel_id: int, data: NovelUpdate, db: AsyncSession = Depends(get_db)):
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(novel, key, value)
    await db.commit()
    await db.refresh(novel)
    return novel


@router.delete("/{novel_id}")
async def delete_novel(novel_id: int, db: AsyncSession = Depends(get_db)):
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(404, "Novel not found")
    await db.delete(novel)
    await db.commit()
    return {"ok": True}


@router.get("/{novel_id}/outline", response_model=OutlineResponse)
async def get_outline(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = result.scalar_one_or_none()
    if not outline:
        raise HTTPException(404, "Outline not found")
    return outline


@router.put("/{novel_id}/outline", response_model=OutlineResponse)
async def update_outline(novel_id: int, data: OutlineUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = result.scalar_one_or_none()
    if not outline:
        raise HTTPException(404, "Outline not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(outline, key, value)
    await db.commit()
    await db.refresh(outline)
    return outline
```

**Step 2: Character CRUD API**

```python
# backend/app/api/characters.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Character, CharacterRelationship
from app.schemas.character import (
    CharacterCreate, CharacterUpdate, CharacterResponse,
    RelationshipCreate, RelationshipResponse,
)

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


# --- Relationships ---
rel_router = APIRouter(prefix="/api/novels/{novel_id}/relationships", tags=["relationships"])


@rel_router.get("", response_model=list[RelationshipResponse])
async def list_relationships(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CharacterRelationship).where(CharacterRelationship.novel_id == novel_id)
    )
    return result.scalars().all()


@rel_router.post("", response_model=RelationshipResponse)
async def create_relationship(novel_id: int, data: RelationshipCreate, db: AsyncSession = Depends(get_db)):
    rel = CharacterRelationship(novel_id=novel_id, **data.model_dump())
    db.add(rel)
    await db.commit()
    await db.refresh(rel)
    return rel
```

**Step 3: LLM 信息 API**

```python
# backend/app/api/llm_api.py
from fastapi import APIRouter

from app.llm import list_available_models

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.get("/models")
async def get_models():
    return {"models": list_available_models()}
```

**Step 4: 注册路由到 main.py**

在 `backend/app/main.py` 的 `app` 创建之后添加:

```python
from app.api.novels import router as novels_router
from app.api.characters import router as characters_router, rel_router as relationships_router
from app.api.llm_api import router as llm_router

app.include_router(novels_router)
app.include_router(characters_router)
app.include_router(relationships_router)
app.include_router(llm_router)
```

**Step 5: 验证 API**

```bash
cd backend && uvicorn app.main:app --reload
# 测试创建小说
curl -X POST http://localhost:8000/api/novels \
  -H "Content-Type: application/json" \
  -d '{"title":"测试小说","author_name":"测试作者","genre":"男频","mode":"长篇"}'
# Expected: 返回创建的小说 JSON
```

**Step 6: Commit**

```bash
git add backend/app/api/ backend/app/main.py
git commit -m "feat: Novel + Character CRUD APIs"
```

---

## Task 6: Prompt 模板

**Files:**
- Create: `backend/app/prompts/__init__.py`
- Create: `backend/app/prompts/idea_generator.py`
- Create: `backend/app/prompts/outline_generator.py`
- Create: `backend/app/prompts/chapter_generator.py`
- Create: `backend/app/prompts/intel_extractor.py`

**Step 1: 创意生成 Prompt**

```python
# backend/app/prompts/idea_generator.py

SYSTEM_PROMPT = """你是一位经验丰富的网络小说策划编辑，擅长根据用户的创意灵感，快速设计出完整的小说框架。
你的输出必须是严格的 JSON 格式，不要包含任何其他文字。"""

def build_idea_prompt(genre: str, creative_idea: str) -> str:
    return f"""请根据以下创作思路，生成一个完整的小说模板设定。

【方向】{genre}
【创作思路】{creative_idea}

请严格按以下 JSON 格式输出：
{{
  "world_setting": {{
    "name": "世界观名称",
    "description": "世界观详细描述，200字以内"
  }},
  "protagonist_identity": "主角身份设定，100字以内",
  "core_conflict": "核心冲突描述，100字以内",
  "golden_finger": "金手指设定，100字以内",
  "antagonist_setting": "反派设定，100字以内",
  "power_system": "力量体系描述，150字以内",
  "core_suspense": "核心悬念，100字以内",
  "story_stage": "故事舞台描述，100字以内",
  "style_tone": "风格基调，50字以内",
  "suggested_titles": ["建议小说名1", "建议小说名2", "建议小说名3"]
}}"""
```

**Step 2: 大纲生成 Prompt**

```python
# backend/app/prompts/outline_generator.py

SYSTEM_PROMPT = """你是一位资深网络小说大纲策划师。根据小说设定生成详细的故事大纲。
输出必须是严格的 JSON 格式。"""

def build_outline_prompt(novel_settings: dict, target_chapters: int, blueprint_prompt: str = "") -> str:
    blueprint_section = f"\n【叙事蓝图指导】\n{blueprint_prompt}" if blueprint_prompt else ""

    return f"""请根据以下小说设定，生成一个约 {target_chapters} 章的故事大纲。

【小说设定】
- 类型: {novel_settings.get('genre', '')}
- 世界观: {novel_settings.get('world_setting', '')}
- 主角: {novel_settings.get('protagonist_identity', '')}
- 核心冲突: {novel_settings.get('core_conflict', '')}
- 金手指: {novel_settings.get('golden_finger', '')}
- 反派: {novel_settings.get('antagonist_setting', '')}
- 力量体系: {novel_settings.get('power_system', '')}
- 核心悬念: {novel_settings.get('core_suspense', '')}
- 舞台: {novel_settings.get('story_stage', '')}
- 基调: {novel_settings.get('style_tone', '')}
{blueprint_section}

请严格按以下 JSON 格式输出：
{{
  "story_background": "故事背景，300字以内",
  "characters": [
    {{
      "name": "角色名",
      "role": "主角/配角/反派",
      "identity": "身份设定",
      "personality": "性格特征",
      "tags": ["标签1", "标签2"]
    }}
  ],
  "main_plot": "主要情节概述，500字以内",
  "plot_points": [
    {{
      "chapter_range": "第1-10章",
      "title": "阶段标题",
      "summary": "这个阶段的情节概述"
    }}
  ],
  "highlights": "作品亮点，200字以内",
  "synopsis": "作品简介，200字以内"
}}"""
```

**Step 3: 章节生成 Prompt**

```python
# backend/app/prompts/chapter_generator.py

SYSTEM_PROMPT_TEMPLATE = """你是一位专业的网络小说作家。请根据提供的上下文信息，生成高质量的章节内容。

要求：
1. 严格遵循角色设定和当前状态
2. 保持与前文的情节连贯性
3. 推进指定的伏笔和冲突
4. 内容需要有适当的场景描写、对话和心理活动
5. 段落格式符合网文排版：段首空两格，对话独立成段
{style_instruction}"""


def build_chapter_prompt(
    novel_info: str,
    character_context: str,
    recent_intel: str,
    foreshadowing_context: str,
    chapter_config: str,
    blueprint_context: str = "",
) -> str:
    sections = [
        f"【小说信息】\n{novel_info}",
        f"【本章涉及角色】\n{character_context}",
        f"【近期章节情报】\n{recent_intel}",
    ]
    if foreshadowing_context:
        sections.append(f"【伏笔追踪】\n{foreshadowing_context}")
    if blueprint_context:
        sections.append(f"【叙事节奏指导】\n{blueprint_context}")
    sections.append(f"【本章要求】\n{chapter_config}")
    sections.append("\n请直接开始写作，先输出章节标题（格式：第X章 标题），然后是正文内容。不要输出任何解释性文字。")

    return "\n\n".join(sections)
```

**Step 4: 情报提取 Prompt**

```python
# backend/app/prompts/intel_extractor.py

SYSTEM_PROMPT = """你是一位小说分析师。请仔细阅读章节内容，提取结构化的章节情报。
输出必须是严格的 JSON 格式，不要包含其他文字。"""

def build_intel_prompt(chapter_content: str, character_names: list[str]) -> str:
    chars = "、".join(character_names)
    return f"""请分析以下章节内容，提取章节情报。

已知角色列表：{chars}

【章节内容】
{chapter_content}

请严格按以下 JSON 格式输出：
{{
  "plot_summary": "本章情节摘要，200字以内",
  "character_updates": [
    {{
      "name": "角色名",
      "status_change": "本章中该角色的处境变化",
      "emotional_state": "当前情绪状态",
      "location": "当前位置"
    }}
  ],
  "relationship_changes": [
    {{
      "char_a": "角色A",
      "char_b": "角色B",
      "change": "关系变化描述",
      "trigger": "触发原因"
    }}
  ],
  "new_foreshadowings": ["新埋设的伏笔描述1"],
  "resolved_foreshadowings": ["本章解决的伏笔描述1"],
  "timeline_events": [
    {{
      "time": "故事内时间",
      "event": "事件描述"
    }}
  ],
  "next_chapter_required_chars": ["下一章必须出现的角色名1", "角色名2"]
}}"""
```

**Step 5: Commit**

```bash
git add backend/app/prompts/
git commit -m "feat: prompt templates for idea/outline/chapter/intel"
```

---

## Task 7: 写作引擎核心服务

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/writing_engine.py`
- Create: `backend/app/services/memory_system.py`

**Step 1: 记忆系统 - Context Builder**

```python
# backend/app/services/memory_system.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Novel, Character, Chapter, ChapterIntel, ChapterCharacter,
    CharacterRelationship, Foreshadowing, Outline,
    WritingStyle, NarrativeBlueprint,
)


class ContextBuilder:
    """为章节生成组装完整的上下文信息"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_context(
        self,
        novel_id: int,
        chapter_number: int,
        required_char_ids: list[int],
        optional_char_ids: list[int],
        foreshadowing_ids: list[int] | None = None,
    ) -> dict:
        """组装写作上下文，返回各部分文本"""
        novel = await self.db.get(Novel, novel_id)

        context = {
            "novel_info": await self._build_novel_info(novel),
            "character_context": await self._build_character_context(novel_id, required_char_ids, optional_char_ids),
            "recent_intel": await self._build_recent_intel(novel_id, chapter_number),
            "foreshadowing_context": await self._build_foreshadowing_context(novel_id, foreshadowing_ids),
            "blueprint_context": await self._build_blueprint_context(novel),
            "style_prompt": await self._build_style_prompt(novel),
        }
        return context

    async def _build_novel_info(self, novel: Novel) -> str:
        parts = [f"小说: {novel.title}", f"类型: {novel.genre}", f"模式: {novel.mode}"]
        if novel.world_setting:
            parts.append(f"世界观: {novel.world_setting}")
        if novel.core_conflict:
            parts.append(f"核心冲突: {novel.core_conflict}")
        if novel.power_system:
            parts.append(f"力量体系: {novel.power_system}")

        # 加载大纲摘要
        result = await self.db.execute(select(Outline).where(Outline.novel_id == novel.id))
        outline = result.scalar_one_or_none()
        if outline and outline.main_plot:
            parts.append(f"主线情节: {outline.main_plot}")
        return "\n".join(parts)

    async def _build_character_context(
        self, novel_id: int, required_ids: list[int], optional_ids: list[int]
    ) -> str:
        parts = []

        # 必选角色 - 完整信息
        for cid in required_ids:
            char = await self.db.get(Character, cid)
            if char:
                parts.append(self._format_character_full(char))

        # 可选角色 - 简要信息
        for cid in optional_ids:
            char = await self.db.get(Character, cid)
            if char:
                parts.append(f"[可选] {char.name}({char.role}): {char.identity or ''}")

        # 角色关系
        all_ids = required_ids + optional_ids
        if len(all_ids) >= 2:
            result = await self.db.execute(
                select(CharacterRelationship).where(
                    CharacterRelationship.novel_id == novel_id,
                    CharacterRelationship.character_a_id.in_(all_ids),
                    CharacterRelationship.character_b_id.in_(all_ids),
                )
            )
            for rel in result.scalars().all():
                char_a = await self.db.get(Character, rel.character_a_id)
                char_b = await self.db.get(Character, rel.character_b_id)
                if char_a and char_b:
                    parts.append(f"关系: {char_a.name} ↔ {char_b.name}: {rel.relation_type} - {rel.description or ''}")

        return "\n".join(parts)

    def _format_character_full(self, char: Character) -> str:
        lines = [f"[必选] {char.name}({char.role})"]
        if char.identity:
            lines.append(f"  身份: {char.identity}")
        if char.personality:
            lines.append(f"  性格: {char.personality}")
        if char.golden_finger:
            lines.append(f"  金手指: {char.golden_finger}")
        if char.current_status:
            lines.append(f"  当前状态: {char.current_status}")
        if char.current_location:
            lines.append(f"  当前位置: {char.current_location}")
        if char.emotional_state:
            lines.append(f"  情绪: {char.emotional_state}")
        return "\n".join(lines)

    async def _build_recent_intel(self, novel_id: int, current_chapter_number: int) -> str:
        """获取近期章节情报: 前2章完整情报 + 前3-5章摘要"""
        result = await self.db.execute(
            select(Chapter)
            .where(Chapter.novel_id == novel_id, Chapter.chapter_number < current_chapter_number)
            .order_by(Chapter.chapter_number.desc())
            .limit(5)
        )
        recent_chapters = list(reversed(result.scalars().all()))
        parts = []

        for i, ch in enumerate(recent_chapters):
            result = await self.db.execute(
                select(ChapterIntel).where(ChapterIntel.chapter_id == ch.id)
            )
            intel = result.scalar_one_or_none()
            if not intel:
                continue

            distance = current_chapter_number - ch.chapter_number
            if distance <= 2:
                # 近期: 完整情报
                parts.append(f"--- 第{ch.chapter_number}章 {ch.title or ''} ---")
                parts.append(f"情节: {intel.plot_summary or ''}")
                if intel.character_updates:
                    for cu in intel.character_updates:
                        parts.append(f"  {cu.get('name','')}: {cu.get('status_change','')}")
                if intel.relationship_changes:
                    for rc in intel.relationship_changes:
                        parts.append(f"  关系变化: {rc.get('char_a','')}↔{rc.get('char_b','')}: {rc.get('change','')}")
            else:
                # 中期: 仅摘要
                parts.append(f"第{ch.chapter_number}章摘要: {intel.plot_summary or ''}")

        return "\n".join(parts) if parts else "（这是第一章，暂无前文情报）"

    async def _build_foreshadowing_context(self, novel_id: int, selected_ids: list[int] | None) -> str:
        # 所有未解决伏笔
        result = await self.db.execute(
            select(Foreshadowing).where(
                Foreshadowing.novel_id == novel_id,
                Foreshadowing.status.in_(["埋设", "推进中"]),
            )
        )
        active = result.scalars().all()
        if not active:
            return ""

        parts = ["当前活跃伏笔:"]
        for f in active:
            marker = "【本章推进】" if selected_ids and f.id in selected_ids else ""
            parts.append(f"  - {f.description} ({f.status}) {marker}")
        return "\n".join(parts)

    async def _build_blueprint_context(self, novel: Novel) -> str:
        if not novel.selected_blueprint_id:
            return ""
        bp = await self.db.get(NarrativeBlueprint, novel.selected_blueprint_id)
        if not bp or not bp.generated_prompt:
            return ""
        return bp.generated_prompt

    async def _build_style_prompt(self, novel: Novel) -> str:
        if not novel.selected_style_id:
            return ""
        style = await self.db.get(WritingStyle, novel.selected_style_id)
        if not style or not style.generated_prompt:
            return ""
        return style.generated_prompt
```

**Step 2: 写作引擎**

```python
# backend/app/services/writing_engine.py
import json
from typing import AsyncGenerator

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm import get_provider, Message, GenerateConfig
from app.models import (
    Novel, Character, Chapter, ChapterIntel, ChapterCharacter, Foreshadowing, Outline,
)
from app.prompts import idea_generator, outline_generator, chapter_generator, intel_extractor
from app.services.memory_system import ContextBuilder


async def generate_idea(genre: str, creative_idea: str, model_id: str, db: AsyncSession) -> dict:
    """根据创作思路生成智能模板"""
    provider = get_provider(model_id)
    prompt = idea_generator.build_idea_prompt(genre, creative_idea)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=idea_generator.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.8, max_tokens=2000, stream=False),
    )
    return json.loads(response)


async def generate_outline(novel_id: int, target_chapters: int, model_id: str, db: AsyncSession) -> dict:
    """生成小说大纲"""
    novel = await db.get(Novel, novel_id)
    if not novel:
        raise ValueError("Novel not found")

    novel_settings = {
        "genre": novel.genre,
        "world_setting": novel.world_setting,
        "protagonist_identity": novel.protagonist_identity,
        "core_conflict": novel.core_conflict,
        "golden_finger": novel.golden_finger,
        "antagonist_setting": novel.antagonist_setting,
        "power_system": novel.power_system,
        "core_suspense": novel.core_suspense,
        "story_stage": novel.story_stage,
        "style_tone": novel.style_tone,
    }

    # 获取叙事蓝图 prompt (如果有)
    blueprint_prompt = ""
    if novel.selected_blueprint_id:
        from app.models import NarrativeBlueprint
        bp = await db.get(NarrativeBlueprint, novel.selected_blueprint_id)
        if bp and bp.generated_prompt:
            blueprint_prompt = bp.generated_prompt

    provider = get_provider(model_id)
    prompt = outline_generator.build_outline_prompt(novel_settings, target_chapters, blueprint_prompt)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=outline_generator.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.7, max_tokens=4000, stream=False),
    )
    return json.loads(response)


async def generate_chapter_stream(
    novel_id: int,
    chapter_id: int,
    model_id: str,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """流式生成章节内容"""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise ValueError("Chapter not found")

    # 获取本章角色配置
    result = await db.execute(
        select(ChapterCharacter).where(ChapterCharacter.chapter_id == chapter_id)
    )
    chapter_chars = result.scalars().all()
    required_ids = [cc.character_id for cc in chapter_chars if cc.is_required]
    optional_ids = [cc.character_id for cc in chapter_chars if not cc.is_required]

    # 构建上下文
    builder = ContextBuilder(db)
    ctx = await builder.build_context(
        novel_id=novel_id,
        chapter_number=chapter.chapter_number,
        required_char_ids=required_ids,
        optional_char_ids=optional_ids,
    )

    # 组装本章配置
    chapter_config_parts = [f"章节序号: 第{chapter.chapter_number}章"]
    if chapter.chapter_outline:
        chapter_config_parts.append(f"章纲: {chapter.chapter_outline}")
    if chapter.conflict_description:
        chapter_config_parts.append(f"本章冲突: {chapter.conflict_description}")
    if chapter.target_word_count:
        chapter_config_parts.append(f"目标字数: {chapter.target_word_count}字")

    # 构建完整 prompt
    style_instruction = ""
    if ctx["style_prompt"]:
        style_instruction = f"\n\n【文笔风格要求】\n{ctx['style_prompt']}"

    system_prompt = chapter_generator.SYSTEM_PROMPT_TEMPLATE.format(style_instruction=style_instruction)

    prompt = chapter_generator.build_chapter_prompt(
        novel_info=ctx["novel_info"],
        character_context=ctx["character_context"],
        recent_intel=ctx["recent_intel"],
        foreshadowing_context=ctx["foreshadowing_context"],
        chapter_config="\n".join(chapter_config_parts),
        blueprint_context=ctx["blueprint_context"],
    )

    provider = get_provider(model_id)
    full_content = ""
    async for chunk in provider.generate(
        messages=[Message(role="user", content=prompt)],
        system_prompt=system_prompt,
        config=GenerateConfig(temperature=0.8, max_tokens=8000),
    ):
        full_content += chunk
        yield chunk

    # 生成完毕后更新章节内容
    chapter.content = full_content
    chapter.actual_word_count = len(full_content)
    chapter.status = "已完成"
    await db.commit()


async def extract_chapter_intel(chapter_id: int, model_id: str, db: AsyncSession) -> dict:
    """提取章节情报并更新角色状态"""
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or not chapter.content:
        raise ValueError("Chapter not found or has no content")

    # 获取角色名列表
    result = await db.execute(
        select(Character).where(Character.novel_id == chapter.novel_id)
    )
    characters = result.scalars().all()
    char_names = [c.name for c in characters]
    char_map = {c.name: c for c in characters}

    provider = get_provider(model_id)
    prompt = intel_extractor.build_intel_prompt(chapter.content, char_names)
    response = await provider.generate_complete(
        messages=[Message(role="user", content=prompt)],
        system_prompt=intel_extractor.SYSTEM_PROMPT,
        config=GenerateConfig(temperature=0.3, max_tokens=3000, stream=False),
    )
    intel_data = json.loads(response)

    # 保存 ChapterIntel
    intel = ChapterIntel(
        chapter_id=chapter_id,
        plot_summary=intel_data.get("plot_summary"),
        character_updates=intel_data.get("character_updates"),
        relationship_changes=intel_data.get("relationship_changes"),
        new_foreshadowings=intel_data.get("new_foreshadowings"),
        resolved_foreshadowings=intel_data.get("resolved_foreshadowings"),
        timeline_events=intel_data.get("timeline_events"),
        next_chapter_required_chars=intel_data.get("next_chapter_required_chars"),
    )
    db.add(intel)

    # 更新角色状态
    for cu in intel_data.get("character_updates", []):
        char = char_map.get(cu.get("name"))
        if char:
            if cu.get("status_change"):
                char.current_status = cu["status_change"]
            if cu.get("emotional_state"):
                char.emotional_state = cu["emotional_state"]
            if cu.get("location"):
                char.current_location = cu["location"]

    # 创建新伏笔
    for fs_desc in intel_data.get("new_foreshadowings", []):
        fs = Foreshadowing(
            novel_id=chapter.novel_id,
            description=fs_desc,
            created_chapter_id=chapter.chapter_number,
            status="埋设",
        )
        db.add(fs)

    await db.commit()
    return intel_data
```

**Step 3: prompts/__init__.py**

```python
# backend/app/prompts/__init__.py
```

**Step 4: services/__init__.py**

```python
# backend/app/services/__init__.py
```

**Step 5: Commit**

```bash
git add backend/app/services/ backend/app/prompts/__init__.py
git commit -m "feat: writing engine + memory system (Context Builder)"
```

---

## Task 8: 章节 API + 写作 API (流式输出)

**Files:**
- Create: `backend/app/api/chapters.py`
- Create: `backend/app/api/writing.py`
- Modify: `backend/app/main.py` (注册新路由)

**Step 1: Chapter CRUD + Foreshadowing API**

```python
# backend/app/api/chapters.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Chapter, ChapterCharacter, ChapterIntel, Foreshadowing
from app.schemas.chapter import ChapterCreate, ChapterUpdate, ChapterResponse, ChapterIntelResponse
from app.schemas.style import ForeshadowingCreate, ForeshadowingUpdate, ForeshadowingResponse

router = APIRouter(prefix="/api/novels/{novel_id}/chapters", tags=["chapters"])


@router.get("", response_model=list[ChapterResponse])
async def list_chapters(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Chapter).where(Chapter.novel_id == novel_id).order_by(Chapter.chapter_number)
    )
    return result.scalars().all()


@router.post("", response_model=ChapterResponse)
async def create_chapter(novel_id: int, data: ChapterCreate, db: AsyncSession = Depends(get_db)):
    # 自动计算章节号
    result = await db.execute(
        select(func.max(Chapter.chapter_number)).where(Chapter.novel_id == novel_id)
    )
    max_num = result.scalar() or 0
    chapter = Chapter(
        novel_id=novel_id,
        chapter_number=max_num + 1,
        chapter_outline=data.chapter_outline,
        target_word_count=data.target_word_count,
        conflict_description=data.conflict_description,
    )
    db.add(chapter)
    await db.flush()

    # 配置角色
    for cid in (data.required_character_ids or []):
        db.add(ChapterCharacter(chapter_id=chapter.id, character_id=cid, is_required=True))
    for cid in (data.optional_character_ids or []):
        db.add(ChapterCharacter(chapter_id=chapter.id, character_id=cid, is_required=False))

    await db.commit()
    await db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(novel_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or chapter.novel_id != novel_id:
        raise HTTPException(404, "Chapter not found")
    return chapter


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(novel_id: int, chapter_id: int, data: ChapterUpdate, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter or chapter.novel_id != novel_id:
        raise HTTPException(404, "Chapter not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(chapter, key, value)
    if data.content is not None:
        chapter.actual_word_count = len(data.content)
    await db.commit()
    await db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}/intel", response_model=ChapterIntelResponse | None)
async def get_chapter_intel(novel_id: int, chapter_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChapterIntel).where(ChapterIntel.chapter_id == chapter_id))
    return result.scalar_one_or_none()


# --- Foreshadowing ---
fs_router = APIRouter(prefix="/api/novels/{novel_id}/foreshadowings", tags=["foreshadowings"])


@fs_router.get("", response_model=list[ForeshadowingResponse])
async def list_foreshadowings(novel_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Foreshadowing).where(Foreshadowing.novel_id == novel_id)
    )
    return result.scalars().all()


@fs_router.post("", response_model=ForeshadowingResponse)
async def create_foreshadowing(novel_id: int, data: ForeshadowingCreate, db: AsyncSession = Depends(get_db)):
    fs = Foreshadowing(novel_id=novel_id, **data.model_dump())
    db.add(fs)
    await db.commit()
    await db.refresh(fs)
    return fs


@fs_router.put("/{fs_id}", response_model=ForeshadowingResponse)
async def update_foreshadowing(novel_id: int, fs_id: int, data: ForeshadowingUpdate, db: AsyncSession = Depends(get_db)):
    fs = await db.get(Foreshadowing, fs_id)
    if not fs or fs.novel_id != novel_id:
        raise HTTPException(404, "Foreshadowing not found")
    if data.status:
        fs.status = data.status
    if data.resolved_chapter_id:
        fs.resolved_chapter_id = data.resolved_chapter_id
    if data.progress_note:
        notes = fs.progress_notes or []
        notes.append(data.progress_note)
        fs.progress_notes = notes
    await db.commit()
    await db.refresh(fs)
    return fs
```

**Step 2: 写作 API (创意生成、大纲生成、章节流式生成、情报提取)**

```python
# backend/app/api/writing.py
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Novel, Character, Chapter, Outline
from app.schemas.novel import IdeaRequest, IdeaResponse
from app.schemas.chapter import GenerateChapterRequest, GenerateOutlineRequest
from app.services import writing_engine

router = APIRouter(prefix="/api", tags=["writing"])


@router.post("/generate/idea")
async def api_generate_idea(data: IdeaRequest, db: AsyncSession = Depends(get_db)):
    result = await writing_engine.generate_idea(data.genre, data.creative_idea, data.model_id, db)
    return result


@router.post("/novels/{novel_id}/generate/outline")
async def api_generate_outline(novel_id: int, data: GenerateOutlineRequest, db: AsyncSession = Depends(get_db)):
    result = await writing_engine.generate_outline(novel_id, data.target_chapters, data.model_id, db)

    # 保存大纲和角色
    outline_result = await db.execute(select(Outline).where(Outline.novel_id == novel_id))
    outline = outline_result.scalar_one_or_none()
    if outline:
        outline.story_background = result.get("story_background")
        outline.main_plot = result.get("main_plot")
        outline.plot_points = result.get("plot_points")

    # 保存角色
    for char_data in result.get("characters", []):
        char = Character(
            novel_id=novel_id,
            name=char_data["name"],
            role=char_data.get("role", "配角"),
            identity=char_data.get("identity"),
            personality=char_data.get("personality"),
            tags=char_data.get("tags"),
        )
        db.add(char)

    # 更新小说的简介和亮点
    novel = await db.get(Novel, novel_id)
    if novel:
        novel.synopsis = result.get("synopsis")
        novel.highlights = result.get("highlights")
        novel.target_chapters = data.target_chapters

    await db.commit()
    return result


@router.post("/novels/{novel_id}/chapters/{chapter_id}/generate")
async def api_generate_chapter(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    async def event_stream():
        async for chunk in writing_engine.generate_chapter_stream(novel_id, chapter_id, data.model_id, db):
            yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/novels/{novel_id}/chapters/{chapter_id}/extract-intel")
async def api_extract_intel(
    novel_id: int,
    chapter_id: int,
    data: GenerateChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await writing_engine.extract_chapter_intel(chapter_id, data.model_id, db)
    return result
```

**Step 3: 注册新路由到 main.py**

在 main.py 中添加:
```python
from app.api.chapters import router as chapters_router, fs_router as foreshadowings_router
from app.api.writing import router as writing_router

app.include_router(chapters_router)
app.include_router(foreshadowings_router)
app.include_router(writing_router)
```

**Step 4: Commit**

```bash
git add backend/app/api/chapters.py backend/app/api/writing.py backend/app/main.py
git commit -m "feat: chapter CRUD + writing APIs with SSE streaming"
```

---

## Task 9: 导出服务

**Files:**
- Create: `backend/app/services/export_service.py`
- Create: `backend/app/api/export.py`
- Modify: `backend/app/main.py`

**Step 1: TXT 导出**

```python
# backend/app/services/export_service.py
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
                    if not paragraph.startswith("　　"):
                        paragraph = f"　　{paragraph}"
                    lines.append(paragraph)
                else:
                    lines.append("")
        lines.append("")
        lines.append("")

    return "\n".join(lines)
```

**Step 2: 导出 API**

```python
# backend/app/api/export.py
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
```

**Step 3: 注册路由, Commit**

```bash
# 在 main.py 注册 export router
git add backend/app/services/export_service.py backend/app/api/export.py backend/app/main.py
git commit -m "feat: TXT export with web novel formatting"
```

---

## Task 10: 前端脚手架

**Files:**
- 整个 `frontend/` 目录通过 Vite 创建

**Step 1: 初始化 React 项目**

```bash
cd /Users/samdediannao/write-agent
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install zustand axios react-router-dom @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

**Step 2: 配置 TailwindCSS**

修改 `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

修改 `frontend/src/index.css`:
```css
@import "tailwindcss";
```

**Step 3: 创建基础目录结构**

```bash
mkdir -p frontend/src/{pages,components,services,stores,types}
```

**Step 4: 创建 API Service**

```typescript
// frontend/src/services/api.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// Novel
export const listNovels = () => api.get('/novels')
export const createNovel = (data: any) => api.post('/novels', data)
export const getNovel = (id: number) => api.get(`/novels/${id}`)
export const updateNovel = (id: number, data: any) => api.put(`/novels/${id}`, data)
export const deleteNovel = (id: number) => api.delete(`/novels/${id}`)

// Outline
export const getOutline = (novelId: number) => api.get(`/novels/${novelId}/outline`)
export const updateOutline = (novelId: number, data: any) => api.put(`/novels/${novelId}/outline`, data)

// Characters
export const listCharacters = (novelId: number) => api.get(`/novels/${novelId}/characters`)
export const createCharacter = (novelId: number, data: any) => api.post(`/novels/${novelId}/characters`, data)
export const updateCharacter = (novelId: number, charId: number, data: any) => api.put(`/novels/${novelId}/characters/${charId}`, data)

// Chapters
export const listChapters = (novelId: number) => api.get(`/novels/${novelId}/chapters`)
export const createChapter = (novelId: number, data: any) => api.post(`/novels/${novelId}/chapters`, data)
export const getChapter = (novelId: number, chapterId: number) => api.get(`/novels/${novelId}/chapters/${chapterId}`)
export const updateChapter = (novelId: number, chapterId: number, data: any) => api.put(`/novels/${novelId}/chapters/${chapterId}`, data)
export const getChapterIntel = (novelId: number, chapterId: number) => api.get(`/novels/${novelId}/chapters/${chapterId}/intel`)

// Foreshadowings
export const listForeshadowings = (novelId: number) => api.get(`/novels/${novelId}/foreshadowings`)

// Writing
export const generateIdea = (data: any) => api.post('/generate/idea', data)
export const generateOutline = (novelId: number, data: any) => api.post(`/novels/${novelId}/generate/outline`, data)
export const extractIntel = (novelId: number, chapterId: number, data: any) => api.post(`/novels/${novelId}/chapters/${chapterId}/extract-intel`, data)

// LLM
export const getModels = () => api.get('/llm/models')

// Export
export const exportTxt = (novelId: number) => `/api/novels/${novelId}/export/txt`
```

**Step 5: 创建路由和基础页面骨架**

```typescript
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NovelList from './pages/NovelList'
import NovelDetail from './pages/NovelDetail'
import ChapterEditor from './pages/ChapterEditor'
import CreateWizard from './pages/CreateWizard'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/" element={<NovelList />} />
            <Route path="/create" element={<CreateWizard />} />
            <Route path="/novel/:id" element={<NovelDetail />} />
            <Route path="/novel/:novelId/chapter/:chapterId" element={<ChapterEditor />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

**Step 6: 创建占位页面组件**

每个页面先创建最简骨架 (NovelList, NovelDetail, ChapterEditor, CreateWizard)，后续 task 逐步填充。

```typescript
// frontend/src/pages/NovelList.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listNovels } from '../services/api'

export default function NovelList() {
  const { data, isLoading } = useQuery({ queryKey: ['novels'], queryFn: () => listNovels().then(r => r.data) })

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">我的小说</h1>
        <Link to="/create" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          创建新小说
        </Link>
      </div>
      {isLoading ? (
        <p>加载中...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((novel: any) => (
            <Link key={novel.id} to={`/novel/${novel.id}`} className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition">
              <h3 className="font-bold text-lg">{novel.title}</h3>
              <p className="text-sm text-gray-500">{novel.author_name} · {novel.genre} · {novel.mode}</p>
              <p className="text-sm text-gray-400 mt-1">{novel.status}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

```typescript
// frontend/src/pages/NovelDetail.tsx
export default function NovelDetail() {
  return <div className="max-w-6xl mx-auto p-6"><h1>小说详情 (待实现)</h1></div>
}
```

```typescript
// frontend/src/pages/ChapterEditor.tsx
export default function ChapterEditor() {
  return <div className="max-w-6xl mx-auto p-6"><h1>章节编辑器 (待实现)</h1></div>
}
```

```typescript
// frontend/src/pages/CreateWizard.tsx
export default function CreateWizard() {
  return <div className="max-w-6xl mx-auto p-6"><h1>创建向导 (待实现)</h1></div>
}
```

**Step 7: 验证前端启动**

```bash
cd frontend && npm run dev
# 访问 http://localhost:5173
```

**Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: React frontend scaffolding with routing and API service"
```

---

## Task 11: 前端 - 创建向导页

**Files:**
- Modify: `frontend/src/pages/CreateWizard.tsx`

完整实现创建向导的 6 步流程：选方向 → 输入创意 → AI 生成模板 → 作品信息 → 生成大纲 → 完成。

这是一个较大的前端组件，需要包含：
- 步骤导航条
- 每步的表单/展示组件
- 调用 `generateIdea` 和 `generateOutline` API
- 支持修改 AI 生成的内容
- 最终创建小说和大纲

（代码较长，实施时由 subagent 根据上述 API 和 schema 实现）

**Step 1-5:** TDD 不适用于纯前端 UI，此 task 采用组件驱动开发。实现后手动测试完整流程。

**Step 6: Commit**

```bash
git add frontend/src/pages/CreateWizard.tsx
git commit -m "feat: create wizard - 6-step novel creation flow"
```

---

## Task 12: 前端 - 小说详情页 + 章节管理

**Files:**
- Modify: `frontend/src/pages/NovelDetail.tsx`

实现：
- 小说基本信息展示/编辑
- 大纲查看/编辑
- 角色列表管理 (增删改)
- 章节列表 + 新建章节
- 伏笔追踪面板
- 导出 TXT 按钮

**Commit:**

```bash
git add frontend/src/pages/NovelDetail.tsx
git commit -m "feat: novel detail page with chapters, characters, foreshadowings"
```

---

## Task 13: 前端 - 章节编辑器 (核心页面)

**Files:**
- Modify: `frontend/src/pages/ChapterEditor.tsx`

实现对应需求步骤 7-12 的完整流程：
- 左侧：章节配置面板 (角色选择、伏笔选择、冲突描述、目标字数)
- 中间：章节内容区 (流式显示生成内容、支持手动编辑)
- 右侧：章节情报面板 (角色状态、关系变化、下章必现角色)
- SSE 流式接收章节内容
- 生成完成后自动触发情报提取
- 支持重新生成

**关键实现：SSE 流式接收**

```typescript
// 核心: 流式接收章节内容
const generateChapter = async () => {
  setGenerating(true)
  setContent('')
  const response = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: selectedModel }),
  })
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const data = JSON.parse(line.slice(6))
        setContent(prev => prev + data.content)
      }
    }
  }
  setGenerating(false)
  // 自动提取情报
  await extractIntel(novelId, chapterId, { model_id: selectedModel })
}
```

**Commit:**

```bash
git add frontend/src/pages/ChapterEditor.tsx
git commit -m "feat: chapter editor with SSE streaming and intel extraction"
```

---

## Task 14: 端到端集成测试

**Step 1:** 启动 MySQL + 后端 + 前端

```bash
docker compose up mysql -d
cd backend && uvicorn app.main:app --reload &
cd frontend && npm run dev &
```

**Step 2:** 完整走一遍流程

1. 访问 http://localhost:5173
2. 点击"创建新小说"
3. 选择男频，输入创意思路
4. AI 生成智能模板，确认/修改
5. 输入作者名和小说名
6. 生成大纲，确认角色和情节
7. 进入小说详情页，新建章节
8. 配置角色和伏笔，生成章节内容
9. 查看章节情报
10. 导出 TXT

**Step 3:** 修复发现的问题

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end testing"
```

---

## 依赖关系

```
Task 1 (脚手架)
  → Task 2 (数据模型)
    → Task 3 (Schemas)
      → Task 4 (LLM Layer) [独立]
      → Task 5 (CRUD API)
        → Task 6 (Prompts) [独立]
        → Task 7 (写作引擎)
          → Task 8 (章节+写作 API)
            → Task 9 (导出)
  → Task 10 (前端脚手架) [可与 Task 2-9 并行]
    → Task 11 (创建向导)
    → Task 12 (小说详情)
    → Task 13 (章节编辑器)
      → Task 14 (集成测试)
```

后端 Task 1-9 可以先全部完成，前端 Task 10-13 可以在后端 API 就绪后并行开发。
