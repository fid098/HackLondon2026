"""
rate_limit.py — Global rate limiter instance (Phase 7).

Uses slowapi (a Starlette-compatible wrapper around the `limits` library).
Requests are keyed by client IP address.

Usage in routes:
    from fastapi import Request
    from app.core.rate_limit import limiter

    @limiter.limit("20/minute")
    @router.post("/some-ai-endpoint")
    async def my_endpoint(request: Request, payload: MyRequest):
        ...

Wire into app (in main.py):
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from app.core.rate_limit import limiter

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Key requests by client IP.
# In production this can be swapped to a user-ID key function for
# authenticated endpoints (e.g. key_func=lambda req: req.state.user_id).
limiter = Limiter(key_func=get_remote_address)
