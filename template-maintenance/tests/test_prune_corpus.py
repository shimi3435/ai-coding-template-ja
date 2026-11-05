"""保守gateが不正corpusを成功扱いしないことを確認する。"""

from copy import deepcopy

import pytest
from prune_corpus import validate_cases
from template_prune_fixture import CASES


@pytest.mark.parametrize("value", [None, {}, [], [{"id": "incomplete"}]])
def test_corpus_rejects_empty_or_invalid_schema(value):
    with pytest.raises(ValueError):
        validate_cases(value)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("id", ""),
        ("surface", "R07"),
        ("path", "../escape"),
        ("expected", "unknown"),
        ("coverage", "unknown"),
        ("source", None),
    ],
)
def test_corpus_rejects_invalid_case_fields(field, value):
    cases = deepcopy(CASES)
    cases[0][field] = value
    with pytest.raises(ValueError):
        validate_cases(cases)


def test_corpus_requires_positive_and_negative_examples_for_every_surface():
    with pytest.raises(ValueError, match="surface"):
        validate_cases([case for case in CASES if case["surface"] != "R06"])
