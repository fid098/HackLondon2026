"""
users.py — User preference routes.

Routes:
  GET /users/preferences  — fetch current user's preferences
  PUT /users/preferences  — replace preferences (full update)
  PATCH /users/preferences — partial update

All routes require a valid Bearer token.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.models.user import UserPreferences, UserPreferencesUpdate
from app.routes.auth import CurrentUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/preferences", response_model=UserPreferences)
async def get_preferences(current_user: CurrentUser):
    """Return the authenticated user's preferences."""
    return current_user.preferences


@router.put("/preferences", response_model=UserPreferences)
async def replace_preferences(
    payload: UserPreferences,
    current_user: CurrentUser,
    db=Depends(get_db),
):
    """Replace preferences with a full new document."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    from bson import ObjectId

    new_prefs = payload.model_dump()
    await db["users"].update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"preferences": new_prefs}},
    )
    return payload


@router.patch("/preferences", response_model=UserPreferences)
async def patch_preferences(
    payload: UserPreferencesUpdate,
    current_user: CurrentUser,
    db=Depends(get_db),
):
    """Partially update preferences — only provided fields are changed."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    from bson import ObjectId

    # Merge: start from current prefs, overlay provided non-None values
    current_dict = current_user.preferences.model_dump()
    updates = payload.model_dump(exclude_none=True)
    merged = {**current_dict, **updates}

    await db["users"].update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"preferences": merged}},
    )
    return UserPreferences(**merged)
