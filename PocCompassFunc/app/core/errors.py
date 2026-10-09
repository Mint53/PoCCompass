"""Application errors -> SPEC §10 error envelope. Services raise these; controllers never build error JSON by hand."""

from __future__ import annotations


class AppError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class ValidationFailed(AppError):
    status_code = 400
    code = "VALIDATION_ERROR"


class Unauthenticated(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"


class AiNotConfigured(AppError):
    status_code = 503
    code = "AI_NOT_CONFIGURED"

    def __init__(self, message: str = "AI の接続設定がありません。管理者に AZURE_OPENAI_ENDPOINT の設定を依頼してください。"):
        super().__init__(message)


class AiFailed(AppError):
    status_code = 502
    code = "AI_FAILED"

    def __init__(self, message: str = "AI の呼び出しに失敗しました。時間をおいて再実行してください。"):
        super().__init__(message)
