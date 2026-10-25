"""Driver job mock JSON stays true to the contract (docs/api/deliveries.md).

The driver app is built against ``docs/api/examples``, so these checks keep
the samples honest: every driver job sample must validate against the built
response schemas (parts 1 and 2, #75) and follow the contract's rules. No
database needed.
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from app.modules.deliveries.schemas import DriverJobDetail, DriverJobList
from app.modules.deliveries.service import JobAction, JobSection, JobStatus
from app.modules.orders.transitions import Requirement

EXAMPLES = Path(__file__).resolve().parents[2] / "docs" / "api" / "examples"


DETAIL_EXAMPLES = [
    "driver-job-offer.json",
    "driver-job-accepted.json",
    "driver-job-detail.json",
    "driver-job-unreachable.json",
    "driver-job-unloading-complete.json",
]
UNREACHABLE_WAIT = timedelta(minutes=10)  # FR-038


def load(name: str) -> Any:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@pytest.mark.parametrize("name", DETAIL_EXAMPLES)
def test_detail_examples_match_the_schema(name: str) -> None:
    job = load(name)
    DriverJobDetail.model_validate(job)
    # No field outside the built schema.
    assert set(job) == set(DriverJobDetail.model_fields)
    assert set(job["allowed_actions"]) <= {action.value for action in JobAction}
    assert job["is_simulated"] is True


@pytest.mark.parametrize("name", DETAIL_EXAMPLES)
def test_receiver_is_hidden_from_offers(name: str) -> None:
    # FR-032: no receiver name or phone before the driver accepts.
    job = load(name)
    if job["job_status"] == JobStatus.OFFERED:
        assert job["receiver"] is None
        assert job["section"] == JobSection.OFFER
    else:
        assert job["receiver"] is not None


@pytest.mark.parametrize("name", DETAIL_EXAMPLES)
def test_no_delivery_code_before_unloading_is_complete(name: str) -> None:
    # FR-035 as amended by #67: the code is issued after unloading.
    job = load(name)
    if job["unloading_completed_at"] is None:
        assert job["delivery_code"] is None
        assert "submit_proof" not in job["allowed_actions"]


@pytest.mark.parametrize("name", DETAIL_EXAMPLES)
def test_unreachable_wait_follows_arrival(name: str) -> None:
    job = load(name)
    if job["arrived_at"] is None:
        assert job["unreachable_allowed_at"] is None
    else:
        allowed_at = parse_time(job["unreachable_allowed_at"])
        assert allowed_at == parse_time(job["arrived_at"]) + UNREACHABLE_WAIT


def test_failed_attempt_offered_only_after_two_attempts() -> None:
    # A4: "Record failed attempt" stays off until two attempts and the full
    # 10 minutes (FR-038, row 19).
    ready = load("driver-job-unreachable.json")
    assert ready["order_status"] == "arrived"
    assert len(ready["contact_attempts"]) >= 2
    assert "record_failed_attempt" in ready["allowed_actions"]

    just_arrived = load("driver-job-detail.json")
    assert just_arrived["contact_attempts"] == []
    assert "record_failed_attempt" not in just_arrived["allowed_actions"]


def test_new_code_not_offered_while_the_code_is_usable() -> None:
    # Part 1: a new code while the current one is usable and was sent is 409
    # delivery_code_still_valid, so the action must not be offered.
    job = load("driver-job-unloading-complete.json")
    code = job["delivery_code"]
    assert code["sms_status"] == "accepted" and code["attempts_left"] > 0
    assert "request_new_code" not in job["allowed_actions"]
    assert "submit_proof" in job["allowed_actions"]


def test_accept_response_is_the_offer_after_acceptance() -> None:
    offer = load("driver-job-offer.json")
    accepted = load("driver-job-accepted.json")
    assert accepted["order_reference"] == offer["order_reference"]
    assert offer["allowed_actions"] == ["accept", "decline"]
    assert (accepted["job_status"], accepted["order_status"]) == ("accepted", "accepted")
    assert "start_job" in accepted["allowed_actions"]


def test_job_list_example_matches_the_schema() -> None:
    jobs = load("driver-jobs.json")
    DriverJobList.model_validate(jobs)
    sections = {"offers": "offer", "today": "today", "upcoming": "upcoming", "done": "done"}
    for group, section in sections.items():
        assert all(job["section"] == section for job in jobs[group])


@pytest.mark.parametrize(
    "name", ["driver-proof-request.json", "driver-proof-alternative-request.json"]
)
def test_proof_requests_carry_exactly_one_acknowledgement(name: str) -> None:
    proof = load(name)
    assert proof["unloading_confirmed"] is True
    assert proof["delivered_litres"] >= 1
    assert (proof["delivery_code"] is None) != (proof["alternative_proof"] is None)
    if proof["delivery_code"] is not None:
        assert len(proof["delivery_code"]) == 6 and proof["delivery_code"].isdigit()
    else:
        assert proof["alternative_proof"]["reason"] in {"customer_cannot_receive_code", "other"}


def test_step_requests_follow_the_contract() -> None:
    transition = load("driver-transition-request.json")
    assert transition["to"] in {"departed", "en_route", "unloading", "failed"}
    arrive = load("driver-arrive-request.json")
    # FR-035: location only with consent obtained first.
    assert arrive["location"] is not None and arrive["location_consent"] is True


@pytest.mark.parametrize(
    ("name", "code"),
    [
        ("error-delivery-code-invalid.json", "delivery_code_invalid"),
        ("error-delivery-code-expired.json", "delivery_code_expired"),
        ("error-unreachable-wait.json", "transition_requirements_unmet"),
    ],
)
def test_error_examples_use_the_envelope_and_documented_codes(name: str, code: str) -> None:
    body = load(name)
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == code


def test_missing_conditions_are_known_names() -> None:
    missing = load("error-unreachable-wait.json")["error"]["details"]["missing"]
    known = {requirement.value for requirement in Requirement}
    assert set(missing) <= known
