"""
reports.py — Report archive routes.

Routes:
  GET  /api/v1/reports           — list reports (paginated, filterable)
  GET  /api/v1/reports/{id}      — get a single report
  POST /api/v1/reports           — save a client-side result as a report
  GET  /api/v1/reports/{id}/download — export as JSON (PDF in Phase 4)

Authentication is optional for reads; POST requires a valid Bearer token
to associate the report with the current user.
"""

import logging
from datetime import datetime, timezone
from math import ceil
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.database import get_db
from app.models.report import ReportListResponse, ReportOut, SaveReportRequest, SourceCitation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

_bearer = HTTPBearer(auto_error=False)
CredDep = Optional[HTTPAuthorizationCredentials]


def _optional_user_id(credentials: CredDep = Depends(_bearer)) -> Optional[str]:
    if not credentials:
        return None
    from app.core.security import decode_access_token
    return decode_access_token(credentials.credentials)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _doc_to_report(doc: dict) -> ReportOut:
    debate_raw = doc.get("debate")
    debate = None
    if debate_raw:
        from app.models.report import DebateArtifact
        try:
            debate = DebateArtifact(**debate_raw)
        except Exception:
            pass

    return ReportOut(
        id=str(doc["_id"]),
        source_type=doc.get("source_type", "text"),
        source_ref=doc.get("source_ref", ""),
        verdict=doc.get("verdict", "UNVERIFIED"),
        confidence=doc.get("confidence", 0),
        summary=doc.get("summary", ""),
        pro_points=doc.get("pro_points", []),
        con_points=doc.get("con_points", []),
        sources=[SourceCitation(**s) for s in doc.get("sources", [])],
        category=doc.get("category", "General"),
        debate=debate,
        created_at=doc.get("created_at", datetime.now(tz=timezone.utc)),
        user_id=doc.get("user_id"),
    )


def _validate_oid(report_id: str) -> ObjectId:
    try:
        return ObjectId(report_id)
    except InvalidId:
        raise HTTPException(status_code=422, detail="Invalid report ID format")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=ReportListResponse)
async def list_reports(
    page:    int   = Query(default=1, ge=1),
    limit:   int   = Query(default=10, ge=1, le=100),
    verdict: Optional[str] = Query(default=None),
    q:       Optional[str] = Query(default=None),
    db=Depends(get_db),
    user_id: Optional[str] = Depends(_optional_user_id),
):
    """Return a paginated list of reports, optionally filtered by verdict or search query."""
    if db is None:
        return ReportListResponse(items=[], total=0, page=page, limit=limit, pages=0)

    query: dict = {}
    if verdict and verdict.upper() != "ALL":
        query["verdict"] = verdict.upper()
    if q:
        query["$or"] = [
            {"source_ref": {"$regex": q, "$options": "i"}},
            {"summary":    {"$regex": q, "$options": "i"}},
        ]
    if user_id:
        query["user_id"] = user_id

    skip = (page - 1) * limit
    total = await db["reports"].count_documents(query)
    cursor = db["reports"].find(query).sort("created_at", -1).skip(skip).limit(limit)

    items = []
    async for doc in cursor:
        try:
            items.append(_doc_to_report(doc))
        except Exception as exc:
            logger.warning("Skipping malformed report doc: %s", exc)

    pages = ceil(total / limit) if total else 0
    return ReportListResponse(items=items, total=total, page=page, limit=limit, pages=pages)


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: str, db=Depends(get_db)):
    """Retrieve a single report by ID."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    oid = _validate_oid(report_id)
    doc = await db["reports"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    return _doc_to_report(doc)


@router.post("", response_model=ReportOut, status_code=201)
async def save_report(
    payload: SaveReportRequest,
    db=Depends(get_db),
    user_id: Optional[str] = Depends(_optional_user_id),
):
    """Save a client-side fact-check result to the archive."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    now = datetime.now(tz=timezone.utc)
    doc = {
        **payload.model_dump(),
        "sources": [s.model_dump() for s in payload.sources],
        "created_at": now,
        "user_id": user_id,
    }
    result = await db["reports"].insert_one(doc)
    doc["_id"] = result.inserted_id

    return _doc_to_report(doc)


@router.get("/{report_id}/download")
async def download_report(
    report_id: str,
    fmt: str = Query(default="json", alias="format"),
    db=Depends(get_db),
):
    """
    Export a report as JSON (or PDF in a future phase).

    Supported formats: json
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    oid = _validate_oid(report_id)
    doc = await db["reports"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    if fmt.lower() == "json":
        report = _doc_to_report(doc)
        return JSONResponse(
            content=report.model_dump(mode="json"),
            headers={"Content-Disposition": f'attachment; filename="report-{report_id}.json"'},
        )

    raise HTTPException(status_code=400, detail=f"Unsupported format '{fmt}'. Use 'json'.")
