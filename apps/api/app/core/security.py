"""
security.py — Password hashing and JWT utilities.

Uses:
  - bcrypt (direct, no passlib) — avoids passlib 1.7.x / bcrypt 4+ compatibility
    issues on Python 3.13
  - python-jose for JWT creation / verification

Configuration is read from app.core.config.settings so all secrets
live in environment variables / .env files, never in code.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

# ── Password hashing ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Return bcrypt hash of *plain* password (truncates at 72 bytes per bcrypt spec)."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT.

    Args:
        subject:       Typically the user's string ID or email.
        expires_delta: Custom TTL; defaults to settings.jwt_expiry_hours.

    Returns:
        Encoded JWT string.
    """
    delta = expires_delta or timedelta(hours=settings.jwt_expiry_hours)
    expire = datetime.now(tz=timezone.utc) + delta
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> Optional[str]:
    """
    Decode and validate a JWT.

    Returns the *sub* claim (user ID) on success, or None if the token
    is missing, expired, or otherwise invalid.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload.get("sub")
    except JWTError:
        return None
