from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
import app.models  # noqa: F401


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


from app.api.novels import router as novels_router
from app.api.characters import router as characters_router, rel_router as relationships_router
from app.api.llm_api import router as llm_router

app.include_router(novels_router)
app.include_router(characters_router)
app.include_router(relationships_router)
app.include_router(llm_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
