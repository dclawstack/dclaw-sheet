"""Lightweight RAG over a sheet's data dictionary.

For each column we build a "document" out of the header name + a sample of
its values, vectorise the documents with TF-IDF, and rank them against a
free-text query. The Copilot uses this to ground its responses in the
columns most relevant to what the user asked.

This is the dependency-light replacement for the pgvector path in the
plan; it works on SQLite and Postgres alike and needs no embedding API.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.repositories.cell_repo import CellRepository
from app.services.formula.engine import index_to_col_letters


@dataclass
class DictionaryEntry:
    column_index: int
    column_letter: str
    header: str
    samples: list[str]
    document: str


@dataclass
class Match:
    entry: DictionaryEntry
    score: float


def _normalise(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return text.strip()


def build_documents(headers: dict[int, str], samples_by_col: dict[int, list[str]]) -> list[DictionaryEntry]:
    entries: list[DictionaryEntry] = []
    for col_idx, header in headers.items():
        samples = samples_by_col.get(col_idx, [])[:6]
        norm_header = _normalise(header or "")
        norm_samples = " ".join(_normalise(s or "") for s in samples)
        document = f"{norm_header} {norm_samples}".strip()
        entries.append(
            DictionaryEntry(
                column_index=col_idx,
                column_letter=index_to_col_letters(col_idx),
                header=header,
                samples=samples,
                document=document or norm_header or norm_samples or "x",
            )
        )
    return entries


def rank_by_query(entries: list[DictionaryEntry], query: str, top_k: int = 5) -> list[Match]:
    if not entries or not query.strip():
        return []
    docs = [e.document for e in entries]
    vectorizer = TfidfVectorizer(min_df=1, ngram_range=(1, 2))
    try:
        X = vectorizer.fit_transform(docs + [_normalise(query)])
    except ValueError:
        # All documents were stop-words only; fall back to substring scoring
        q = _normalise(query)
        return [
            Match(entry=e, score=1.0 if q and q in e.document else 0.0)
            for e in entries
            if not q or q in e.document
        ][:top_k]
    sims = cosine_similarity(X[-1], X[:-1]).ravel()
    scored = sorted(
        (Match(entry=e, score=float(s)) for e, s in zip(entries, sims)),
        key=lambda m: m.score,
        reverse=True,
    )
    return [m for m in scored if m.score > 0][:top_k]


async def build_sheet_dictionary(db, sheet_id: UUID) -> list[DictionaryEntry]:
    cells = await CellRepository(db).list_by_sheet(sheet_id)
    if not cells:
        return []
    header_row = min(c.row for c in cells)
    headers: dict[int, str] = {}
    samples_by_col: dict[int, list[str]] = {}
    for c in cells:
        if c.row == header_row:
            if c.value:
                headers[c.column] = c.value
        else:
            if c.value:
                samples_by_col.setdefault(c.column, []).append(c.value)
    return build_documents(headers, samples_by_col)
