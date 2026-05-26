from pydantic import BaseModel, Field


class ForecastRequest(BaseModel):
    column: str = Field(description='Column letter to forecast, e.g. "B"')
    periods: int = Field(default=12, ge=1, le=365)
    skip_header: bool = Field(default=True)


class ForecastPointModel(BaseModel):
    index: int
    mean: float
    lower_80: float
    upper_80: float
    lower_95: float
    upper_95: float


class ForecastResponse(BaseModel):
    column: str
    column_name: str | None
    history: list[float]
    forecast: list[ForecastPointModel]
    order: tuple[int, int, int]
    fit_aic: float


class AnomalyRequest(BaseModel):
    column: str
    contamination: float = Field(default=0.1, gt=0.0, lt=0.5)
    skip_header: bool = Field(default=True)


class AnomalyPointModel(BaseModel):
    row: int
    value: float
    score: float
    is_outlier: bool


class AnomalyResponse(BaseModel):
    column: str
    column_name: str | None
    points: list[AnomalyPointModel]
    outlier_count: int
