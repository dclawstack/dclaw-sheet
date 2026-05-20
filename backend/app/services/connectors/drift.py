"""Schema drift between a previously-synced sheet and a fresh connector result.

The compare is name-based; we don't try to detect renames. UI surfaces:
- added:    columns now present that weren't before
- removed:  columns that disappeared
- reordered: same set, different order
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DriftReport:
    added: list[str]
    removed: list[str]
    reordered: bool
    is_first_sync: bool = False

    @property
    def has_drift(self) -> bool:
        return bool(self.added) or bool(self.removed) or self.reordered

    def to_dict(self) -> dict[str, object]:
        return {
            "added": self.added,
            "removed": self.removed,
            "reordered": self.reordered,
            "is_first_sync": self.is_first_sync,
            "has_drift": self.has_drift,
        }


def compute_drift(previous: list[str] | None, current: list[str]) -> DriftReport:
    if not previous:
        return DriftReport(added=list(current), removed=[], reordered=False, is_first_sync=True)
    prev_set = set(previous)
    curr_set = set(current)
    added = [c for c in current if c not in prev_set]
    removed = [c for c in previous if c not in curr_set]
    same_set = prev_set == curr_set
    reordered = same_set and previous != current
    return DriftReport(added=added, removed=removed, reordered=reordered)
