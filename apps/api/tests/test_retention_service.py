from datetime import datetime, timezone

from sqlalchemy.dialects import postgresql

from app.services.retention_service import _expired_object_condition


def test_retention_never_selects_active_message_attachments() -> None:
    now = datetime.now(timezone.utc)
    condition = str(_expired_object_condition(now).compile(
        dialect=postgresql.dialect(),
        compile_kwargs={'literal_binds': True},
    ))

    assert "stored_objects.status = 'pending'" in condition
    assert "stored_objects.status IN ('orphaned', 'deletion_pending')" in condition
    assert 'attached_message' not in condition
