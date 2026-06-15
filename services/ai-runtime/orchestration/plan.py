from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, List, Optional


@dataclass
class Plan:
    intent: str
    route: str
    confidence: float
    capabilities: List[str]
    workflow: Optional[str] = None
