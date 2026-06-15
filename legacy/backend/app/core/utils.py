from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return a naive UTC datetime (no tzinfo).

    PostgreSQL TIMESTAMP WITHOUT TIME ZONE requires naive datetimes.
    Never use datetime.now(timezone.utc) directly in model defaults.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
