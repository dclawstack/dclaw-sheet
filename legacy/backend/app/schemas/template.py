from pydantic import BaseModel, Field
from uuid import UUID


class TemplateRead(BaseModel):
    id: str
    name: str
    category: str
    description: str
    sheet_names: list[str]


class TemplateApplyRequest(BaseModel):
    template_id: str = Field(min_length=1)
