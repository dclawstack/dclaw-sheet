from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class WorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    name: str
    created_at: datetime


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str | None
    external_id: str | None
    default_workspace_id: UUID | None


class MeResponse(BaseModel):
    user: UserRead
    workspace: WorkspaceRead
    auth_provider: str
    role: str
    can_write: bool
    can_admin: bool
