"""Auth endpoints: register, login, logout, me (docs/api/auth.md)."""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth import security, service
from app.modules.auth.dependencies import SESSION_COOKIE_NAME, AuthSession
from app.modules.auth.models import UserRole
from app.modules.auth.schemas import LoginRequest, RegisterRequest, SessionRead, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]


def _session_response(auth: service.AuthenticatedSession) -> SessionRead:
    secret = get_settings().session_secret.get_secret_value()
    return SessionRead(
        user=UserRead.from_user(auth.user),
        csrf_token=security.csrf_token_for(auth.token, secret),
        expires_at=auth.session.expires_at,
    )


def _set_session_cookie(response: Response, auth: service.AuthenticatedSession) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE_NAME,
        auth.token,
        max_age=settings.session_max_age_seconds,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.session_cookie_samesite,
    )


@router.post(
    "/register",
    status_code=HTTPStatus.CREATED,
    responses={HTTPStatus.CONFLICT: {"model": ErrorResponse}},
)
async def register(body: RegisterRequest, response: Response, db: DbSession) -> SessionRead:
    """Create a customer account and sign it in.

    The role is always ``customer``; staff accounts are created with the
    command-line tool. The phone starts unverified (FR-003).

    Raises:
        APIError: 409 ``phone_already_registered``.
    """
    user = await service.create_user(
        db, name=body.name, phone=body.phone, password=body.password, role=UserRole.CUSTOMER
    )
    auth = await service.start_session(db, user)
    _set_session_cookie(response, auth)
    return _session_response(auth)


@router.post("/login", responses={HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse}})
async def login(body: LoginRequest, response: Response, db: DbSession) -> SessionRead:
    """Sign in with phone and password and start a new session.

    Raises:
        APIError: 401 ``invalid_credentials`` for any failure.
    """
    user = await service.authenticate(db, phone=body.phone, password=body.password)
    auth = await service.start_session(db, user)
    _set_session_cookie(response, auth)
    return _session_response(auth)


@router.post(
    "/logout",
    status_code=HTTPStatus.NO_CONTENT,
    responses={
        HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
        HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
    },
)
async def logout(auth: AuthSession, db: DbSession) -> Response:
    """Revoke the current session and clear its cookie.

    Raises:
        APIError: 401 ``not_authenticated``; 403 ``csrf_failed``.
    """
    await service.revoke_session(db, auth.session)
    response = Response(status_code=HTTPStatus.NO_CONTENT)
    settings = get_settings()
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.session_cookie_samesite,
    )
    return response


@router.get("/me", responses={HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse}})
async def me(auth: AuthSession) -> SessionRead:
    """Return the signed-in user and the session's CSRF token.

    Raises:
        APIError: 401 ``not_authenticated``.
    """
    return _session_response(auth)
