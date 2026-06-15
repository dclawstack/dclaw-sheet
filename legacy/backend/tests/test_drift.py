from app.services.connectors.drift import compute_drift


def test_first_sync_marks_all_added():
    drift = compute_drift(None, ["a", "b", "c"])
    assert drift.is_first_sync is True
    assert drift.added == ["a", "b", "c"]
    assert drift.removed == []
    assert drift.reordered is False


def test_added_columns_detected():
    drift = compute_drift(["a", "b"], ["a", "b", "c"])
    assert drift.added == ["c"]
    assert drift.removed == []
    assert drift.reordered is False
    assert drift.has_drift is True


def test_removed_columns_detected():
    drift = compute_drift(["a", "b", "c"], ["a", "b"])
    assert drift.added == []
    assert drift.removed == ["c"]
    assert drift.has_drift is True


def test_reorder_detected():
    drift = compute_drift(["a", "b"], ["b", "a"])
    assert drift.added == []
    assert drift.removed == []
    assert drift.reordered is True
    assert drift.has_drift is True


def test_identical_columns_no_drift():
    drift = compute_drift(["a", "b"], ["a", "b"])
    assert drift.has_drift is False
