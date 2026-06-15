from fastapi import APIRouter, Depends

from app.core.auth import WorkspaceScope, get_current_workspace
from app.core.config import settings
from app.schemas.identity import MeResponse, UserRead, WorkspaceRead

router = APIRouter()


@router.get("", response_model=MeResponse)
async def me(scope: WorkspaceScope = Depends(get_current_workspace)):
    return MeResponse(
        user=UserRead.model_validate(scope.user),
        workspace=WorkspaceRead.model_validate(scope.workspace),
        auth_provider=settings.auth_provider,
        role=scope.role,
        can_write=scope.can_write,
        can_admin=scope.can_admin,
    )
