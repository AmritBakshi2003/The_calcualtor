"""math_vision — OCR + vision-validated math extraction backend.

Public API:
    run_pipeline(source, mime_type=None, evaluate=True)
    MathVisionPipeline
    PipelineResult / StepCheck
    All StepCheckError exceptions for granular HTTP error mapping.
"""

from .exceptions import (
    AssetError,
    EvaluationError,
    ExpressionValidationError,
    ExtractionQualityError,
    GeminiSyncError,
    MathVisionError,
    MissingApiKeyError,
    PreprocessingError,
    StepCheckError,
)
from .pipeline import PipelineResult, StepCheck, MathVisionPipeline, run_pipeline

__all__ = [
    "AssetError",
    "EvaluationError",
    "ExpressionValidationError",
    "ExtractionQualityError",
    "GeminiSyncError",
    "MathVisionError",
    "MathVisionPipeline",
    "MissingApiKeyError",
    "PipelineResult",
    "PreprocessingError",
    "StepCheck",
    "StepCheckError",
    "run_pipeline",
]
