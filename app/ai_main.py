from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import deepfake, face_match, health
from app.core.config import settings


def create_ai_app() -> FastAPI:
    app = FastAPI(
        title="Lattice AI Worker",
        debug=settings.app_debug,
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def require_ai_key(request: Request, call_next):
        if settings.ai_worker_api_key and request.url.path != f"{settings.api_v1_prefix}/health":
            provided = request.headers.get("X-Lattice-AI-Key")
            if provided != settings.ai_worker_api_key:
                return JSONResponse(
                    {"detail": "valid X-Lattice-AI-Key header is required"},
                    status_code=status.HTTP_401_UNAUTHORIZED,
                )
        return await call_next(request)

    app.include_router(health.router, prefix=settings.api_v1_prefix, tags=["health"])
    app.include_router(deepfake.router, prefix=settings.api_v1_prefix)
    app.include_router(face_match.router, prefix=settings.api_v1_prefix)
    return app


app = create_ai_app()
