"""
user.py — Pydantic schemas for user-related request / response bodies.

Separation of concerns:
  UserCreate   — what the client sends to register
  UserOut      — what the API returns (never includes hashed_password)
  UserInDB     — internal representation stored in MongoDB
  Token        — JWT response from /auth/login and /auth/register
  UserPreferences / UserPreferencesUpdate — preferences sub-document
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ── Preferences ───────────────────────────────────────────────────────────────

class UserPreferences(BaseModel):
    """Per-user settings stored as a sub-document in MongoDB."""
    email_alerts: bool = False
    default_language: str = "en"
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    show_debug_info: bool = False


class UserPreferencesUpdate(BaseModel):
    """Partial update — all fields optional (PATCH semantics)."""
    email_alerts: Optional[bool] = None
    default_language: Optional[str] = None
    confidence_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    show_debug_info: Optional[bool] = None


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    """Payload for POST /auth/register."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=64)


class UserOut(BaseModel):
    """Safe user representation — no secrets."""
    id: str
    email: EmailStr
    display_name: Optional[str] = None
    preferences: UserPreferences = Field(default_factory=UserPreferences)
    created_at: datetime


class UserInDB(BaseModel):
    """Full document as stored in MongoDB (includes hashed_password)."""
    id: Optional[str] = None
    email: EmailStr
    display_name: Optional[str] = None
    hashed_password: str
    preferences: UserPreferences = Field(default_factory=UserPreferences)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    is_active: bool = True


# ── Auth tokens ───────────────────────────────────────────────────────────────

class Token(BaseModel):
    """Response body for successful login / register."""
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginRequest(BaseModel):
    """Payload for POST /auth/login."""
    email: EmailStr
    password: str
