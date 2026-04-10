#!/usr/bin/env python3
"""Extract definitions from EU regulation seed files.

Reads `data/seed/<seed>.json`, finds the article that contains numbered
definitions (e.g. Article 2, 3 or 4), parses each `(N) 'term' means body;`
entry, and appends to `seed["definitions"]`.

Idempotent: if `definitions[]` is already non-empty for a seed, the seed is
skipped entirely to avoid double-adding.

Usage:
    python3 scripts/extract-definitions.py --all
    python3 scripts/extract-definitions.py data/seed/crr.json
    python3 scripts/extract-definitions.py --all --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Repo root resolved from this file's location so the script can be run
# from any working directory.
REPO_ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = REPO_ROOT / "data" / "seed"

# (seed basename, preferred-article-order) for the 11 targets. The parser
# also scans all articles and picks the one with the highest `means` count
# when the preferred guesses all come up empty.
TARGETS: list[tuple[str, list[str]]] = [
    ("aifmd.json", ["4", "3", "2"]),
    ("centralised-procedure-regulation.json", ["2", "3", "4"]),
    ("crd.json", ["3", "4", "2"]),
    ("crr.json", ["4", "3", "2"]),
    ("csddd.json", ["3", "2", "4"]),
    ("dsa.json", ["3", "2", "4"]),
    ("ehds.json", ["2", "3", "4"]),
    ("medicinal-products-directive.json", ["1", "2", "3"]),
    ("ucits.json", ["2", "3", "4"]),
    ("eprivacy.json", ["2", "3", "4"]),
    ("dora-rts-ict-risk.json", ["2", "3", "4"]),
]

# Quote characters used around a defined term. Covers ASCII single/double,
# curly quotes, and the U+2027 hyphenation point used in CRR/CRD.
QUOTE_CHARS = "'\"\u2018\u2019\u201c\u201d\u2027"

# Markers at the start of a definition. EU regulations use either
# "(N)" (CRR, CRD, EHDS) or "(a)" (AIFMD, CSDDD, DSA, UCITS, ePrivacy)
# for the **top-level** definitions list. Sub-points within a definition
# body use the OTHER style, so we must split on only the dominant one.
NUMERIC_MARKER_RE = re.compile(r"^\s*\((\d+)\)\s*$", re.MULTILINE)
ALPHA_MARKER_RE = re.compile(r"^\s*\(([a-z])\)\s*$", re.MULTILINE)


def normalise_text(text: str) -> str:
    """Replace NBSPs and collapse Windows line endings."""
    return text.replace("\xa0", " ").replace("\r\n", "\n").replace("\r", "\n")


def find_best_definitions_article(
    articles: list[dict],
    preferred: list[str],
) -> tuple[dict | None, int]:
    """Pick the article most likely to contain definitions.

    Strategy: score every article by `means` count, pick the highest. If the
    highest is zero, fall back to the first preferred article (so the caller
    still gets a chance to try a non-`means` format like medicinal products).
    """
    scored: list[tuple[int, dict]] = []
    for a in articles:
        text = normalise_text(a.get("text", "") or "")
        means_count = text.count(" means ")
        scored.append((means_count, a))

    scored.sort(key=lambda x: x[0], reverse=True)
    if scored and scored[0][0] > 0:
        return scored[0][1], scored[0][0]

    # Fallback: first preferred article that exists
    by_number: dict[str, dict] = {str(a.get("number")): a for a in articles}
    for num in preferred:
        if num in by_number:
            return by_number[num], 0
    return None, 0


def extract_definitions_standard(text: str) -> list[tuple[str, str]]:
    """Parse `(N) 'term' means body;` style definitions.

    Returns a list of (term, definition) pairs. Handles both `(1)` and
    `(a)` top-level markers, and the quote chars listed in QUOTE_CHARS.

    Sub-points within a definition body (e.g. `(a)`, `(b)` inside a
    CRR parent-undertaking definition) are preserved — we only split on
    the dominant top-level marker style.
    """
    text = normalise_text(text)

    # Decide which marker style is the top-level definitions list.
    numeric_markers = NUMERIC_MARKER_RE.findall(text)
    alpha_markers = ALPHA_MARKER_RE.findall(text)

    if not numeric_markers and not alpha_markers:
        return []

    # Pick the dominant style. In CRR/CRD there are ~128 numeric and 40+
    # alphabetic sub-markers; we want the numeric ones. In AIFMD/CSDDD the
    # top level is alphabetic.
    if len(numeric_markers) >= len(alpha_markers):
        split_re = NUMERIC_MARKER_RE
    else:
        split_re = ALPHA_MARKER_RE

    # Split on marker lines. re.split with a capturing group gives us
    # [prelude, marker1, body1, marker2, body2, ...].
    parts = split_re.split(text)
    if len(parts) < 3:
        return []

    pairs: list[tuple[str, str]] = []
    # parts[0] is the prelude; then alternating marker, body.
    #
    # Match a quoted term whose closing quote is *followed by* "means" or
    # "shall mean". This handles possessives like `'management company's
    # home Member State' means ...` where an inner `'` (U+2019) would
    # otherwise terminate a naive lazy match early.
    term_re = re.compile(
        rf"[{QUOTE_CHARS}]([^\n]{{1,200}}?)[{QUOTE_CHARS}]"
        r"\s*(?P<verb>means|shall\s+mean)\s*[:\s]",
    )

    for i in range(1, len(parts) - 1, 2):
        body = parts[i + 1].strip()
        if not body:
            continue

        term_match = term_re.search(body)
        if not term_match:
            continue
        term = term_match.group(1).strip()
        if not term or len(term) > 150:
            continue

        definition_body = body[term_match.end():].strip()
        # Collapse runs of whitespace (including newlines) into single space.
        definition_body = re.sub(r"\s+", " ", definition_body)
        if not definition_body:
            continue

        pairs.append((term.lower(), definition_body))

    return pairs


def extract_definitions_medicinal(text: str) -> list[tuple[str, str]]:
    """Parse the medicinal products directive's article 1 format.

    The directive uses `N.` (optionally `3a.`, `3b.`) markers followed by a
    term and colon. Layouts in the wild:

      2.                         3a. Active substance : Any substance ...
                                 8. ►M4
      Medicinal product :           Kit ◄  : Any preparation ...
      (a) Any substance ...

    Strategy: split on lines that are just `N.` markers, then for each chunk,
    strip EUR-Lex control markers (►M4, ◄, ▼B, etc.), find the `Term :`
    header (everything before the first lone colon on its own segment), and
    treat the rest as the body.
    """
    text = normalise_text(text)

    # Marker lines: "N." or "Na." on a line by themselves.
    marker_re = re.compile(r"^(\d+[a-z]?)\.\s*$", re.MULTILINE)
    positions = [(m.start(), m.end(), m.group(1)) for m in marker_re.finditer(text)]
    if not positions:
        return []

    pairs: list[tuple[str, str]] = []
    for i, (start, end, _num) in enumerate(positions):
        chunk_end = positions[i + 1][0] if i + 1 < len(positions) else len(text)
        chunk = text[end:chunk_end]

        # Strip EUR-Lex revision-tracking control markers: ►M4, ►M11, ◄, ▼B,
        # ▼M2, ▼M4 —————, etc. These are noise.
        chunk = re.sub(r"[▼►][A-Z0-9]+(?:\s*—+)?", " ", chunk)
        chunk = chunk.replace("◄", " ")

        # The term is the first `... :` segment. Allow the colon to appear
        # inline or on its own line. Match up to 120 chars before the colon
        # so we don't accidentally grab a huge preamble.
        term_match = re.search(
            r"^\s*([A-Za-z][A-Za-z0-9 ,/()\-']{1,120}?)\s*:",
            chunk,
        )
        if not term_match:
            continue
        term = term_match.group(1).strip()
        # Reject terms that are just connective words or punctuation noise.
        if len(term) < 3 or term.lower() in {"means", "note", "nb"}:
            continue

        body = chunk[term_match.end():].strip()
        body = re.sub(r"\s+", " ", body)
        if not body or len(body) < 5:
            continue

        pairs.append((term.lower(), body))
    return pairs


def process_seed(
    seed_path: Path,
    preferred_articles: list[str],
    dry_run: bool,
) -> dict:
    """Process a single seed file. Returns a report dict."""
    report = {
        "seed": seed_path.name,
        "status": "",
        "article": None,
        "extracted": 0,
        "first_terms": [],
        "warning": None,
    }

    try:
        with seed_path.open("r", encoding="utf-8") as f:
            seed = json.load(f)
    except FileNotFoundError:
        report["status"] = "NOT_FOUND"
        return report

    existing = seed.get("definitions") or []
    if existing:
        report["status"] = "SKIP_EXISTING"
        report["extracted"] = len(existing)
        return report

    articles = seed.get("articles") or []
    if not articles:
        report["status"] = "NO_ARTICLES"
        return report

    # Medicinal products directive uses a different format (`N. Term :`
    # blocks) and its article 1 has zero `means` occurrences, which confuses
    # the standard heuristic. Force the preferred article and parser here.
    if seed_path.name == "medicinal-products-directive.json":
        by_number = {str(a.get("number")): a for a in articles}
        article = by_number.get(preferred_articles[0])
        if article is None:
            report["status"] = "NO_CANDIDATE"
            return report
        report["article"] = str(article.get("number"))
        text = article.get("text", "") or ""
        pairs = extract_definitions_medicinal(text)
    else:
        article, _ = find_best_definitions_article(articles, preferred_articles)
        if article is None:
            report["status"] = "NO_CANDIDATE"
            return report
        report["article"] = str(article.get("number"))
        text = article.get("text", "") or ""
        pairs = extract_definitions_standard(text)

    if not pairs:
        report["status"] = "NO_DEFINITIONS_FOUND"
        report["warning"] = (
            f'article {report["article"]} had no parseable definitions'
        )
        return report

    # Build the definitions[] entries.
    new_defs = [
        {
            "term": term,
            "definition": definition,
            "article": str(article.get("number")),
        }
        for term, definition in pairs
    ]

    report["extracted"] = len(new_defs)
    report["first_terms"] = [
        (d["term"], d["definition"][:100]) for d in new_defs[:3]
    ]

    if len(new_defs) < 5:
        report["warning"] = (
            f'only {len(new_defs)} definitions extracted — expected more'
        )

    if dry_run:
        report["status"] = "DRY_RUN"
        return report

    seed["definitions"] = new_defs
    # Preserve key order by re-writing with 2-space indent to match existing files.
    with seed_path.open("w", encoding="utf-8") as f:
        json.dump(seed, f, indent=2, ensure_ascii=False)
        f.write("\n")

    report["status"] = "WRITTEN"
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "seed",
        nargs="?",
        help="Path to a single seed file (default: use --all)",
    )
    ap.add_argument(
        "--all",
        action="store_true",
        help="Process the 11 hardcoded target seeds",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.all and not args.seed:
        ap.error("either a seed path or --all is required")

    if args.all:
        jobs = [(SEED_DIR / name, prefs) for name, prefs in TARGETS]
    else:
        seed_path = Path(args.seed)
        if not seed_path.is_absolute():
            seed_path = REPO_ROOT / seed_path
        # Look up preferred articles if the file is one of our targets.
        prefs = ["2", "3", "4", "1"]
        for name, p in TARGETS:
            if seed_path.name == name:
                prefs = p
                break
        jobs = [(seed_path, prefs)]

    reports = []
    for seed_path, prefs in jobs:
        reports.append(process_seed(seed_path, prefs, args.dry_run))

    # Print table
    print()
    print(
        f'{"seed":<42} {"status":<22} {"art":<5} {"count":<6} first_term'
    )
    print("-" * 100)
    for r in reports:
        first_term = r["first_terms"][0][0] if r["first_terms"] else "-"
        print(
            f'{r["seed"]:<42} {r["status"]:<22} {str(r["article"] or "-"):<5} '
            f'{r["extracted"]:<6} {first_term}'
        )

    # Print first 3 extracted definitions per seed
    print()
    print("=" * 100)
    print("First 3 extracted definitions per seed")
    print("=" * 100)
    for r in reports:
        if not r["first_terms"]:
            continue
        print(f'\n--- {r["seed"]} (article {r["article"]}) ---')
        for term, body in r["first_terms"]:
            print(f'  {term!r}: {body}')

    # Print warnings
    warnings = [r for r in reports if r["warning"]]
    if warnings:
        print()
        print("=" * 100)
        print("WARNINGS")
        print("=" * 100)
        for r in warnings:
            print(f'  {r["seed"]}: {r["warning"]}')

    return 0


if __name__ == "__main__":
    sys.exit(main())
