"""Base model — re-exports Base from app.db so all models import from app.models.base."""
from app.db import Base

__all__ = ["Base"]
