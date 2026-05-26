"""auth + multi-tenancy: orgs, workspaces, users, memberships;
workspace_id on workbooks/connections/events with default-workspace backfill.

Revision ID: 0004_auth
Revises: 0003_events
Create Date: 2026-05-26
"""
from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision: str = "0004_auth"
down_revision: Union[str, None] = "0003_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_ORG_SLUG = "default"
_DEFAULT_USER_EMAIL = "dev@dclawstack.local"


def upgrade() -> None:
    op.create_table(
        "orgs",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_workspaces_org_id", "workspaces", ["org_id"])

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("external_id", sa.String(length=255), nullable=True, unique=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "default_workspace_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_external_id", "users", ["external_id"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "memberships",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="member"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "workspace_id", name="uq_membership_user_workspace"),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("ix_memberships_workspace_id", "memberships", ["workspace_id"])

    # Add workspace_id columns to existing entities (batch_alter for SQLite)
    with op.batch_alter_table("workbooks") as batch:
        batch.add_column(
            sa.Column(
                "workspace_id",
                sa.Uuid(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            )
        )
        batch.create_index("ix_workbooks_workspace_id", ["workspace_id"])
    with op.batch_alter_table("connections") as batch:
        batch.add_column(
            sa.Column(
                "workspace_id",
                sa.Uuid(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
                nullable=True,
            )
        )
        batch.create_index("ix_connections_workspace_id", ["workspace_id"])
    with op.batch_alter_table("events") as batch:
        batch.add_column(
            sa.Column(
                "workspace_id",
                sa.Uuid(as_uuid=True),
                sa.ForeignKey("workspaces.id", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch.create_index("ix_events_workspace_id", ["workspace_id"])

    # Seed: default org + workspace + dev user + membership, then backfill
    bind = op.get_bind()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    org_id = uuid4()
    ws_id = uuid4()
    user_id = uuid4()
    bind.execute(
        sa.text(
            "INSERT INTO orgs (id, name, slug, created_at, updated_at) "
            "VALUES (:id, :name, :slug, :ts, :ts)"
        ),
        {"id": org_id, "name": "Default Org", "slug": _DEFAULT_ORG_SLUG, "ts": now},
    )
    bind.execute(
        sa.text(
            "INSERT INTO workspaces (id, org_id, name, created_at, updated_at) "
            "VALUES (:id, :org_id, :name, :ts, :ts)"
        ),
        {"id": ws_id, "org_id": org_id, "name": "Default Workspace", "ts": now},
    )
    bind.execute(
        sa.text(
            "INSERT INTO users (id, email, name, default_workspace_id, created_at, updated_at) "
            "VALUES (:id, :email, :name, :ws_id, :ts, :ts)"
        ),
        {
            "id": user_id,
            "email": _DEFAULT_USER_EMAIL,
            "name": "Default Dev User",
            "ws_id": ws_id,
            "ts": now,
        },
    )
    bind.execute(
        sa.text(
            "INSERT INTO memberships (id, user_id, workspace_id, role, created_at) "
            "VALUES (:id, :uid, :wid, :role, :ts)"
        ),
        {"id": uuid4(), "uid": user_id, "wid": ws_id, "role": "owner", "ts": now},
    )

    # Backfill existing rows
    for table in ("workbooks", "connections", "events"):
        bind.execute(
            sa.text(f"UPDATE {table} SET workspace_id = :ws WHERE workspace_id IS NULL"),
            {"ws": ws_id},
        )


def downgrade() -> None:
    with op.batch_alter_table("events") as batch:
        batch.drop_index("ix_events_workspace_id")
        batch.drop_column("workspace_id")
    with op.batch_alter_table("connections") as batch:
        batch.drop_index("ix_connections_workspace_id")
        batch.drop_column("workspace_id")
    with op.batch_alter_table("workbooks") as batch:
        batch.drop_index("ix_workbooks_workspace_id")
        batch.drop_column("workspace_id")
    op.drop_index("ix_memberships_workspace_id", table_name="memberships")
    op.drop_index("ix_memberships_user_id", table_name="memberships")
    op.drop_table("memberships")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_external_id", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_workspaces_org_id", table_name="workspaces")
    op.drop_table("workspaces")
    op.drop_table("orgs")
