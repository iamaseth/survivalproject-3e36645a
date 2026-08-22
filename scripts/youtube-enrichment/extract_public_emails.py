#!/usr/bin/env python3
"""Small, dependency-free helper for YouTube creator contact enrichment.

Reads text from stdin or --file and emits deduplicated public email addresses.
This helper does not log in, bypass CAPTCHA, send outreach, or modify the CRM.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

EMAIL_RE = re.compile(r"(?i)(?<![\w.+-])([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})(?![\w.-])")
OBFUSCATED_RE = re.compile(
    r"(?ix)\b([a-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\bat\b)\s*"
    r"([a-z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*([a-z]{2,})\b"
)
BAD_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico")


def extract(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        email = value.strip().lower().rstrip(".,;:!?)]}")
        if email.endswith(BAD_SUFFIXES):
            return
        if email not in seen:
            seen.add(email)
            found.append(email)

    for match in EMAIL_RE.finditer(text):
        add(match.group(1))

    for match in OBFUSCATED_RE.finditer(text):
        add(f"{match.group(1)}@{match.group(2)}.{match.group(3)}")

    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path)
    parser.add_argument("--text")
    args = parser.parse_args()

    if args.file:
        text = args.file.read_text(encoding="utf-8", errors="replace")
    elif args.text is not None:
        text = args.text
    else:
        import sys
        text = sys.stdin.read()

    print(json.dumps({"emails": extract(text)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
