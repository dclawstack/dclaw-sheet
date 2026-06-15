"""Built-in template gallery.

Each template is a Python dict so we don't need a separate templates DB
table for v1. v1.1 will move these into a `templates` table that users
can publish to.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TemplateCell:
    row: int
    column: int
    value: str | None = None
    formula: str | None = None
    data_type: str = "string"


@dataclass
class TemplateSheet:
    name: str
    cells: list[TemplateCell]
    row_count: int = 100
    column_count: int = 26


@dataclass
class Template:
    id: str
    name: str
    category: str
    description: str
    sheets: list[TemplateSheet]


def _row(values: list, row_idx: int, types: list[str] | None = None) -> list[TemplateCell]:
    out: list[TemplateCell] = []
    for c_idx, v in enumerate(values):
        if v is None:
            continue
        sv = str(v)
        dt = "string"
        formula = None
        if types and c_idx < len(types):
            dt = types[c_idx]
        if sv.startswith("="):
            formula = sv
            dt = "formula"
            sv = None  # type: ignore[assignment]
        out.append(
            TemplateCell(
                row=row_idx,
                column=c_idx,
                value=sv,
                formula=formula,
                data_type=dt,
            )
        )
    return out


def _saas_metrics() -> Template:
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    rev = [120000, 132000, 148000, 161000, 178000, 195000]
    new_mrr = [12000, 13500, 16000, 14500, 17800, 18200]
    churn = [3000, 3500, 4000, 4200, 5000, 5500]
    cells = []
    cells += _row(["month", "revenue", "new_mrr", "churn", "net_new", "growth_pct"], 0)
    for i, m in enumerate(months):
        cells += _row(
            [
                m,
                rev[i],
                new_mrr[i],
                churn[i],
                f"=C{i+2}-D{i+2}",
                f"=IF(B{i+1}=\"revenue\", \"\", (B{i+2}-B{i+1})/B{i+1})"
                if i > 0
                else "",
            ],
            i + 1,
            types=["string", "number", "number", "number", "formula", "formula"],
        )
    return Template(
        id="saas_metrics",
        name="SaaS Metrics",
        category="Finance",
        description="MRR, new MRR, churn, and growth rate by month.",
        sheets=[TemplateSheet(name="Metrics", cells=cells)],
    )


def _runway() -> Template:
    cells = []
    cells += _row(["Inputs", "", ""], 0)
    cells += _row(["Cash on hand", 1500000, ""], 1, types=["string", "number", "string"])
    cells += _row(["Monthly burn", 120000, ""], 2, types=["string", "number", "string"])
    cells += _row(["Monthly revenue", 35000, ""], 3, types=["string", "number", "string"])
    cells += _row(["Net burn", "=B3-B4", ""], 4)
    cells += _row(["Runway (months)", "=B2/B5", ""], 5)
    cells += _row(["", "", ""], 6)
    cells += _row(["Month", "Cash", "Net burn"], 7)
    for i in range(12):
        if i == 0:
            cells += _row([f"M{i+1}", "=B2", "=$B$5"], 8 + i)
        else:
            cells += _row(
                [f"M{i+1}", f"=B{8+i}-C{8+i}", "=$B$5"],
                8 + i,
            )
    return Template(
        id="runway",
        name="Cash Runway Model",
        category="Finance",
        description="Project months of runway given cash, burn, and revenue.",
        sheets=[TemplateSheet(name="Runway", cells=cells)],
    )


def _cohort_retention() -> Template:
    cells = []
    cells += _row(["cohort", "M0", "M1", "M2", "M3", "M4", "M5"], 0)
    cohorts = [
        ("2026-01", [100, 88, 80, 74, 70, 67]),
        ("2026-02", [120, 105, 96, 90, 85, None]),
        ("2026-03", [140, 124, 113, 105, None, None]),
        ("2026-04", [155, 138, 126, None, None, None]),
        ("2026-05", [170, 152, None, None, None, None]),
        ("2026-06", [185, None, None, None, None, None]),
    ]
    for i, (label, values) in enumerate(cohorts):
        cells += _row(
            [label] + [v if v is not None else "" for v in values],
            i + 1,
            types=["string"] + ["number"] * 6,
        )
    return Template(
        id="cohort_retention",
        name="Cohort Retention",
        category="Growth",
        description="Monthly cohort retention curve with seeded counts.",
        sheets=[TemplateSheet(name="Cohorts", cells=cells)],
    )


def _sales_pipeline() -> Template:
    cells = []
    cells += _row(
        ["account", "stage", "amount", "close_date", "owner"],
        0,
    )
    rows = [
        ["Acme Corp", "proposal", 25000, "2026-07-15", "alice"],
        ["Globex", "negotiation", 48000, "2026-08-01", "bob"],
        ["Initech", "discovery", 12000, "2026-08-20", "alice"],
        ["Hooli", "closed-won", 75000, "2026-06-30", "carol"],
        ["Stark Industries", "qualified", 110000, "2026-09-10", "bob"],
    ]
    for i, r in enumerate(rows):
        cells += _row(r, i + 1, types=["string", "string", "number", "date", "string"])
    cells += _row(["Pipeline total", "=SUM(C2:C6)", "", "", ""], len(rows) + 2)
    return Template(
        id="sales_pipeline",
        name="Sales Pipeline",
        category="Sales",
        description="Open deals by stage with a pipeline total.",
        sheets=[TemplateSheet(name="Pipeline", cells=cells)],
    )


def _financial_model() -> Template:
    cells = []
    cells += _row(["", "Y1", "Y2", "Y3"], 0)
    cells += _row(["Revenue", 1_000_000, 2_500_000, 6_200_000], 1, types=["string", "number", "number", "number"])
    cells += _row(["COGS", "=-B2*0.3", "=-C2*0.3", "=-D2*0.3"], 2)
    cells += _row(["Gross Profit", "=B2+B3", "=C2+C3", "=D2+D3"], 3)
    cells += _row(["Sales & Marketing", -400000, -900000, -2_000_000], 4, types=["string", "number", "number", "number"])
    cells += _row(["R&D", -300000, -600000, -1_200_000], 5, types=["string", "number", "number", "number"])
    cells += _row(["G&A", -150000, -300000, -500000], 6, types=["string", "number", "number", "number"])
    cells += _row(["Operating Income", "=B4+B5+B6+B7", "=C4+C5+C6+C7", "=D4+D5+D6+D7"], 7)
    cells += _row(["", "", "", ""], 8)
    cells += _row(["Gross Margin", "=B4/B2", "=C4/C2", "=D4/D2"], 9)
    cells += _row(["Operating Margin", "=B8/B2", "=C8/C2", "=D8/D2"], 10)
    return Template(
        id="financial_model",
        name="3-Year Financial Model",
        category="Finance",
        description="Revenue, COGS, opex, and margin projections.",
        sheets=[TemplateSheet(name="P&L", cells=cells)],
    )


TEMPLATES: dict[str, Template] = {
    t.id: t
    for t in [
        _saas_metrics(),
        _runway(),
        _cohort_retention(),
        _sales_pipeline(),
        _financial_model(),
    ]
}


def list_templates() -> list[Template]:
    return list(TEMPLATES.values())


def get_template(template_id: str) -> Template | None:
    return TEMPLATES.get(template_id)
