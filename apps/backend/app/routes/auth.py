"""
auth.py — Authentication routes.

Routes:
  POST /auth/register  — create new account
  POST /auth/login     — exchange credentials for JWT
  GET  /auth/me        — return current user (requires valid JWT)

MongoDB operations use Motor's async driver via the get_db() dependency.
Passwords are hashed with bcrypt; tokens are HS256 JWTs.

All errors use HTTPException so FastAPI serialises them as:
  { "detail": "..." }
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import (
    LoginRequest,
    Token,
    UserCreate,
    UserInDB,
    UserOut,
    UserPreferences,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Reusable bearer extractor (does NOT auto-raise on missing token)
_bearer = HTTPBearer(auto_error=False)
CredDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _doc_to_user_out(doc: dict) -> UserOut:
    """Convert a raw MongoDB document to a UserOut Pydantic model."""
    prefs_doc = doc.get("preferences") or {}
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        display_name=doc.get("display_name"),
        preferences=UserPreferences(**prefs_doc),
        created_at=doc.get("created_at", datetime.now(tz=timezone.utc)),
    )


async def _get_current_user(credentials: CredDep, db=Depends(get_db)) -> UserOut:
    """
    FastAPI dependency — extracts and validates the Bearer token,
    then fetches the user from MongoDB.

    Raises 401 if the token is missing, invalid, or the user no longer exists.
    """
    from app.core.security import decode_access_token  # local import avoids circular

    cred_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise cred_error

    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise cred_error

    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    from bson import ObjectId

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise cred_error

    doc = await db["users"].find_one({"_id": oid, "is_active": True})
    if not doc:
        raise cred_error

    return _doc_to_user_out(doc)


# Re-export so other routes can depend on it
CurrentUser = Annotated[UserOut, Depends(_get_current_user)]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db=Depends(get_db)):
    """Register a new user and return a JWT."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Duplicate email check
    existing = await db["users"].find_one({"email": payload.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user_doc = {
        "email": payload.email,
        "display_name": payload.display_name,
        "hashed_password": hash_password(payload.password),
        "preferences": UserPreferences().model_dump(),
        "created_at": datetime.now(tz=timezone.utc),
        "is_active": True,
    }
    result = await db["users"].insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    user_out = _doc_to_user_out(user_doc)
    token = create_access_token(str(result.inserted_id))
    return Token(access_token=token, user=user_out)


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db=Depends(get_db)):
    """Authenticate with email + password and return a JWT."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    _cred_err = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    doc = await db["users"].find_one({"email": payload.email, "is_active": True})
    if not doc:
        raise _cred_err

    if not verify_password(payload.password, doc["hashed_password"]):
        raise _cred_err

    user_out = _doc_to_user_out(doc)
    token = create_access_token(str(doc["_id"]))
    return Token(access_token=token, user=user_out)


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser):
    """Return the currently authenticated user's profile."""
    return current_user
