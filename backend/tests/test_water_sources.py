"""Source eligibility and the sources command line (FR-012, BR-10, T-04, #112). No database."""

import uuid
from datetime import date, timedelta

import pytest

from app.modules.sources.cli import build_parser
from app.modules.sources.eligibility import (
    REASON_ORDER,
    EligibilityReason,
    eligibility_reasons,
)
from app.modules.sources.models import ActivationStatus, WaterSourceCategory

R = EligibilityReason
TODAY = date(2026, 10, 22)


def activation(
    status: ActivationStatus = ActivationStatus.ACTIVATED, *, approved_until: date = TODAY
) -> WaterSourceCategory:
    return WaterSourceCategory(
        source_id=uuid.uuid4(),
        water_category_id=uuid.uuid4(),
        status=status,
        approved_until=approved_until,
        report_reference="LR-0001",
        cost_per_litre_minor_units=150,
        status_reason=None if status is ActivationStatus.ACTIVATED else "Sample reason",
    )


def test_no_activation_is_not_activated() -> None:
    assert eligibility_reasons(None, today=TODAY) == [R.NOT_ACTIVATED]


def test_an_activated_source_is_eligible_through_its_last_approved_day() -> None:
    # approved_until is inclusive in Lagos (T-04): eligible on the day itself.
    assert eligibility_reasons(activation(approved_until=TODAY), today=TODAY) == []
    assert (
        eligibility_reasons(activation(approved_until=TODAY + timedelta(days=90)), today=TODAY)
        == []
    )


def test_t04_the_day_after_approval_ends_it_is_expired() -> None:
    expired = activation(approved_until=TODAY - timedelta(days=1))
    assert eligibility_reasons(expired, today=TODAY) == [R.APPROVAL_EXPIRED]


@pytest.mark.parametrize(
    ("status", "reason"),
    [(ActivationStatus.SUSPENDED, R.SUSPENDED), (ActivationStatus.REVOKED, R.REVOKED)],
)
def test_suspended_and_revoked(status: ActivationStatus, reason: EligibilityReason) -> None:
    assert eligibility_reasons(activation(status), today=TODAY) == [reason]


@pytest.mark.parametrize("status", [ActivationStatus.SUSPENDED, ActivationStatus.REVOKED])
def test_several_reasons_in_the_contract_order(status: ActivationStatus) -> None:
    expired = activation(status, approved_until=TODAY - timedelta(days=30))
    reasons = eligibility_reasons(expired, today=TODAY)
    assert len(reasons) == 2
    assert reasons == sorted(reasons, key=REASON_ORDER.index)
    assert reasons[-1] is R.APPROVAL_EXPIRED


def test_reason_order_matches_the_contract() -> None:
    assert [reason.value for reason in REASON_ORDER] == [
        "not_activated",
        "suspended",
        "revoked",
        "approval_expired",
    ]


# --- Command line ------------------------------------------------------------------

SOURCE = str(uuid.uuid4())


def test_cli_parses_activate() -> None:
    args = build_parser().parse_args(
        [
            "activate",
            "--by",
            "0800 000 0009",
            "--source",
            SOURCE,
            "--category",
            "potable",
            "--report",
            "  LR-0001 ",
            "--approved-until",
            "2027-01-30",
            "--cost-per-litre-kobo",
            "150",
        ]
    )
    assert args.by == "+2348000000009"
    assert args.source == uuid.UUID(SOURCE)
    assert (args.category, args.report) == ("potable", "LR-0001")
    assert args.approved_until == date(2027, 1, 30)
    assert args.cost_per_litre_kobo == 150


def test_cli_parses_add_source_and_suspend() -> None:
    add = build_parser().parse_args(
        [
            "add-source",
            "--by",
            "08000000009",
            "--name",
            "Sample Borehole A",
            "--location",
            "Ugwuaji",
        ]
    )
    assert (add.name, add.location, add.simulated) == ("Sample Borehole A", "Ugwuaji", False)
    suspend = build_parser().parse_args(
        ["suspend", "--by", "08000000009", "--source", SOURCE, "--category", "utility",
         "--reason", "Safety concern"]
    )  # fmt: skip
    assert (suspend.command, suspend.reason) == ("suspend", "Safety concern")


@pytest.mark.parametrize(
    "argv",
    [
        ["add-source", "--name", "A", "--location", "B"],  # no --by
        ["add-source", "--by", "123", "--name", "A", "--location", "B"],  # bad phone
        ["add-source", "--by", "08000000009", "--name", "  ", "--location", "B"],
        ["activate", "--by", "08000000009", "--source", "not-a-uuid", "--category", "potable",
         "--report", "LR-1", "--approved-until", "2027-01-30", "--cost-per-litre-kobo", "1"],
        ["activate", "--by", "08000000009", "--source", SOURCE, "--category", "drinking",
         "--report", "LR-1", "--approved-until", "2027-01-30", "--cost-per-litre-kobo", "1"],
        ["activate", "--by", "08000000009", "--source", SOURCE, "--category", "potable",
         "--report", "LR-1", "--approved-until", "30/01/2027", "--cost-per-litre-kobo", "1"],
        ["activate", "--by", "08000000009", "--source", SOURCE, "--category", "potable",
         "--report", "LR-1", "--approved-until", "2027-01-30", "--cost-per-litre-kobo", "-1"],
        ["activate", "--by", "08000000009", "--source", SOURCE, "--category", "potable",
         "--report", "LR-1", "--approved-until", "2027-01-30", "--cost-per-litre-kobo", "1.5"],
        ["revoke", "--by", "08000000009", "--source", SOURCE, "--category", "potable"],  # no reason
    ],
)  # fmt: skip
def test_cli_rejects_bad_arguments(argv: list[str]) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(argv)
