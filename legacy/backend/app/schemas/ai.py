from typing import Any
from pydantic import BaseModel, Field


class CopilotRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


class CopilotResponseBody(BaseModel):
    provider: str
    message: str
    tool_calls: list[dict[str, Any]]
