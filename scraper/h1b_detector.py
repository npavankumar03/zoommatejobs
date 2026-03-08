import re

POSITIVE_PATTERNS = [
    re.compile(r"\bsponsor(?:ship|ed|ing)?\b", re.IGNORECASE),
    re.compile(r"\bvisa\b", re.IGNORECASE),
    re.compile(r"\bh[-\s]?1b\b", re.IGNORECASE),
    re.compile(r"\bwork authorization provided\b", re.IGNORECASE),
    re.compile(r"\bimmigration support\b", re.IGNORECASE),
]

NEGATIVE_PATTERNS = [
    re.compile(r"\bmust be authorized\b", re.IGNORECASE),
    re.compile(r"\bno sponsorship\b", re.IGNORECASE),
    re.compile(r"\bcitizens only\b", re.IGNORECASE),
    re.compile(r"\bwithout sponsorship\b", re.IGNORECASE),
    re.compile(r"\bnot sponsor\b", re.IGNORECASE),
]


def detect_h1b_sponsorship(text: str | None, default: bool = False) -> bool:
    if not text:
        return default

    positive_hits = sum(1 for pattern in POSITIVE_PATTERNS if pattern.search(text))
    negative_hits = sum(1 for pattern in NEGATIVE_PATTERNS if pattern.search(text))

    if positive_hits == 0 and negative_hits == 0:
        return default
    if positive_hits > 0 and negative_hits == 0:
        return True
    if negative_hits > 0 and positive_hits == 0:
        return False

    return positive_hits > negative_hits
