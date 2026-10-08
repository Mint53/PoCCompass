"""FastAPI application (separate from function_app.py so tests and the OpenAPI exporter can import it)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.controllers import chat, common, items, modes, projects
from app.core.errors import AppError

logger = logging.getLogger(__name__)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app() -> FastAPI:
    app = FastAPI(title="PoC Compass API", version="1.0.0")

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        parts = []
        for err in exc.errors()[:5]:
            loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
            parts.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
        return _error(400, "VALIDATION_ERROR", "入力内容が正しくありません。" + " / ".join(parts))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error: %r", exc)
        return _error(500, "INTERNAL_ERROR",
                      "サーバーでエラーが発生しました。時間をおいて再実行し、解決しない場合は管理者に連絡してください。")

    api = APIRouter(prefix="/api")
    for r in (common.router, modes.router, projects.router, items.router, chat.router):
        api.include_router(r)
    app.include_router(api)
    return app


app = create_app()
