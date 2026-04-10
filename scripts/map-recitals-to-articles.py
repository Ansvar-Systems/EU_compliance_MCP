#!/usr/bin/env python3
"""
Map recitals to the articles they reference, based on the recital text.

For each seed file in data/seed/*.json, walks the `recitals[]` array and
extracts internal article references from each recital's `text` field. The
resulting list is written back to `recital.related_articles`.

Behaviour:
  * Only overwrites `related_articles` when it is missing, null, empty string,
    or an empty list. Existing non-empty lists are left alone.
  * Is idempotent — re-running yields the same output.
  * Skips external article references (Treaty, Charter, another Regulation,
    another Directive, etc.).
  * Filters extracted numbers to those that actually exist as `articles[].number`
    in the same seed, which drops false positives such as "Article 290 TFEU".

Usage:
    python3 scripts/map-recitals-to-articles.py --all
    python3 scripts/map-recitals-to-articles.py data/seed/eidas2.json
    python3 scripts/map-recitals-to-articles.py --all --dry-run
    python3 scripts/map-recitals-to-articles.py --all --verbose
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Iterable

SEED_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "seed",
)

# --------------------------------------------------------------------------- #
# Regex building blocks
# --------------------------------------------------------------------------- #

# An article number is an integer optionally followed by a lowercase letter
# (e.g. "10", "151a", "50b"). We DO NOT include "(1)(a)" etc. in the captured
# article id — those are paragraph/point subdivisions.
ARTICLE_NUM = r"\d+[a-z]?"

# After "Article N" EU legal text often contains "(1)", "(1)(a)", "(1)(a)(iii)".
# We allow/consume these without capturing them.
PARA_SUFFIX = r"(?:\(\w+\))*"

# Three patterns, tried in order:
#
# 1. "Articles 10 to 15"              — numeric range (same letter suffix not
#                                        supported, only plain integers)
# 2. "Articles 10, 11 and 12"         — list with commas and/or " and "
# 3. "Article 24(1)(a)"               — single reference
#
# Each pattern also matches "Article" (singular) for resilience; legal English
# is inconsistent (e.g. "Article 10 and 11" is seen).
RANGE_RE = re.compile(
    rf"\b[Aa]rticles?\s+(\d+)\s+to\s+(\d+)\b"
)

LIST_RE = re.compile(
    rf"\b[Aa]rticles?\s+({ARTICLE_NUM}){PARA_SUFFIX}"
    rf"(?:\s*,\s*({ARTICLE_NUM}){PARA_SUFFIX})*"
    rf"(?:\s*,?\s+and\s+({ARTICLE_NUM}){PARA_SUFFIX})"
)

SINGLE_RE = re.compile(
    rf"\b[Aa]rticles?\s+({ARTICLE_NUM}){PARA_SUFFIX}"
)

# Subdivision/qualifier tails that can legitimately appear between an
# "Article N" token and the word that identifies the parent instrument. We
# swallow these before checking whether the reference is external.
#
# Examples handled:
#   Article 17(1), point (c), of Regulation ...
#   Article 4, point (4), of Regulation ...
#   Article 6(2), paragraph 2, of Directive ...
#   Article 9(1) of that Regulation ...
SUBDIV_TAIL = re.compile(
    r"""^(?:
            \s*\(\w+\)                                     # "(1)", "(a)", "(iii)"
          | \s*(?:,|and|or|to)\s*\(\w+\)(?:\s*\(\w+\))*    # " and (2)", " to (7)", ", (3)(a)"
          | \s*(?:,|\s+and|\s+or|\s+to)\s*points?\s+\([^)]+\)(?:\s*(?:,|\s+and|\s+or|\s+to)\s*\([^)]+\))*
          | \s*(?:,|\s+and|\s+or|\s+to)\s*points?\s+\d+(?:\s*(?:,|\s+and|\s+or|\s+to)\s*\d+)*
          | \s*\bpoint\s+\d+                               # "Article 2 point 15"
          | \s*(?:,|\s+and|\s+or|\s+to)\s*paragraphs?\s+\d+(?:\s*(?:,|\s+and|\s+or|\s+to)\s*\d+)*
          | \s*(?:,|\s+and|\s+or|\s+to)\s*subparagraphs?\s+\d+(?:\s*(?:,|\s+and|\s+or|\s+to)\s*\d+)*
          | \s*,?\s*(?:first|second|third|fourth|fifth|sixth)\s+(?:subparagraph|indent|sentence|paragraph)\b
          | \s*(?:,|\s+and|\s+or|\s+to)\s*indents?\s+\d+(?:\s*(?:,|\s+and|\s+or|\s+to)\s*\d+)*
          | \s*,\s*(?:as\s+applicable|where\s+applicable|
                     as\s+the\s+case\s+may\s+be|
                     as\s+appropriate|where\s+appropriate|
                     in\s+particular|if\s+any)\b
        )+""",
    re.VERBOSE,
)

# Words/phrases that, when they follow "Article N", indicate an EXTERNAL
# reference and should cause the match to be skipped.
#
# Rule: starting at the char right after the article token (with any
# subdivision tail already swallowed), match a small amount of whitespace and
# then "of (the|that) ? SKIP_WORD" OR "SKIP_WORD" directly (for "Article 290
# TFEU" and friends).
EXTERNAL_AFTER = re.compile(
    r"""^(?:[\s,]|(?:\s+(?:and|or))|(?:,\s+(?:and|or)))*
        (?:
            of\s+
            (?:the\s+|that\s+|said\s+)?
            (?:\w+\s+){0,3}?          # allow a short "of the Data Act ..." type prefix
            (?:Regulation|Regulations|Directive|Directives|Decision|Decisions|
               Treaty|TFEU|TEU|Charter|Convention|Protocol|Annex|
               Commission|Council|Delegated|Implementing|European|
               Recommendation|International|Universal|Paris|Joint|
               proposal|Proposal|Act)
            \b
          |
            (?:TFEU|TEU)\b
          |
            thereof\b                  # "Article 5(1) thereof" -> refers to prior instrument
        )
    """,
    re.VERBOSE,
)


# "this Regulation" / "this Directive" is INTERNAL and must override the
# external check. We pre-match this so it survives the skip list.
INTERNAL_AFTER = re.compile(
    r"^[\s,]*of\s+this\s+(Regulation|Directive|Decision)\b"
)

# Patterns that appear BEFORE the "Article N" token and indicate an external
# reference. Checked against the last ~80 chars before the match.
#
# Examples:
#   "Directive 2000/31/EC, in particular its Article 3"   -> external (its)
#   "Regulation (EU) 2016/679 ... Articles 12 to 15"      -> external (prior instrument)
#   "point (b) of Article 6 of that Regulation"           -> handled by AFTER check
EXTERNAL_BEFORE = re.compile(
    r"""(?:
            \bits\s+$                              # "its Article N"
          | \btheir\s+$                            # "their Articles X and Y"
          | \b(?:that|the\s+said)\s+$              # "that Article" (very rare alone)
          | \b(?:Directive|Regulation|Decision)\s+
            (?:\(EU\)\s+)?(?:No\s+)?\d+/\d+(?:/[A-Z]+)?
            [^.]{0,60}$                            # prior instrument within 60 chars
        )""",
    re.VERBOSE,
)


# --------------------------------------------------------------------------- #
# Core extraction
# --------------------------------------------------------------------------- #


# Matches " and Article N(p)(a)" or ", Article N(p)" — a continuation of an
# article-cluster that shares the same parent instrument. After swallowing
# one of these we should rerun SUBDIV_TAIL and the external check, because
# the qualifier ("of Regulation X") only appears after the LAST article.
CLUSTER_CONT = re.compile(
    rf"""^(?:
            \s*,[\s,]*(?:and\s+|or\s+)?    # ", " / ", and " / ", or ", tolerates extra whitespace
          | \s+and\s+
          | \s+or\s+
          | \s+to\s+                        # " to 24" (range continuation)
        )
        (?:[Aa]rticles?\s+)?                # "Article" word is optional in the continuation
        {ARTICLE_NUM}{PARA_SUFFIX}""",
    re.VERBOSE,
)


def _is_external(text: str, start_pos: int, end_pos: int) -> bool:
    """Return True if the match at [start_pos:end_pos] looks like an external ref.

    Three checks:
      1. Look ahead — skip subdivision tails ("(1)", ", point (c),") and
         cluster continuations (" and Article 9(2)", ", Article 10"), then
         see if the next word identifies another legal instrument. "this
         Regulation" is an explicit internal override.
      2. Look behind — the ~80 chars before the match. If they end with
         "its", "their", or a recent Directive/Regulation NNNN/NN citation,
         the Article belongs to that instrument.
    """
    # Look-ahead: walk past subdivision tails AND "and Article N" clusters
    # until we reach a stable stopping point, then classify.
    cursor = end_pos
    horizon = min(len(text), end_pos + 400)
    while cursor < horizon:
        tail = text[cursor:horizon]
        sub = SUBDIV_TAIL.match(tail)
        if sub:
            cursor += sub.end()
            continue
        cont = CLUSTER_CONT.match(tail)
        if cont:
            cursor += cont.end()
            continue
        break

    tail = text[cursor : cursor + 120]
    if INTERNAL_AFTER.match(tail):
        return False
    if EXTERNAL_AFTER.match(tail):
        return True

    # Short-range scan for telltale words that always indicate an external
    # reference: "... of the Data Act proposal", "... of Annex II to ...",
    # etc. Only look within the first ~60 chars of tail so we don't reach
    # into a sibling sentence.
    near = tail[:80]
    if re.match(r"^\s*of\s+.{0,40}\bproposal\b", near):
        return True
    # If the immediate continuation says "of ... that Regulation/Directive",
    # the whole cluster is bound to that prior instrument.
    if re.match(
        r"^[\s,]*(?:and|or)?[\s,]*of\s.{0,60}\bthat\s+(?:Regulation|Directive|Decision)\b",
        near,
    ):
        return True
    # Shorthand citation: "of (EU) 2022/2555" — the word "Regulation" is
    # omitted but this is always an external reference.
    if re.match(r"^[\s,]*of\s+\(EU\)\s*(?:No\s+)?\d+/\d+", near):
        return True

    # Look-behind check
    head = text[max(0, start_pos - 80) : start_pos]
    if EXTERNAL_BEFORE.search(head):
        return True

    # Parenthesised enumeration of Charter articles:
    #   "the right to data protection (Article 8), ..."
    # If the Article is wrapped in "(" and ")" and the full recital text
    # mentions "Charter", it's a Charter cross-reference, not internal.
    if start_pos > 0 and text[start_pos - 1] == "(":
        if "Charter" in text:
            return True

    return False


def _expand_range(a: str, b: str) -> list[str]:
    """Expand "Articles 10 to 15" into ["10", "11", ..., "15"]."""
    try:
        lo = int(a)
        hi = int(b)
    except ValueError:
        return []
    if hi < lo or hi - lo > 100:
        # Sanity cap; ranges >100 are almost certainly false positives.
        return []
    return [str(n) for n in range(lo, hi + 1)]


def _extract_from_text(text: str) -> list[str]:
    """Extract a unique, sorted list of internal article numbers from text."""
    if not text:
        return []

    found: set[str] = set()

    # 1. Ranges. Consume them first and blank them out so the LIST/SINGLE
    #    passes don't double-count the endpoints.
    def _range_sub(m: re.Match[str]) -> str:
        if _is_external(text, m.start(), m.end()):
            return " " * (m.end() - m.start())
        for num in _expand_range(m.group(1), m.group(2)):
            found.add(num)
        return " " * (m.end() - m.start())

    scratch = RANGE_RE.sub(_range_sub, text)

    # 2. Lists like "Articles 10, 11 and 12". The regex only matches when
    #    there is at least one " and N" tail, which prevents a bare
    #    "Article 10" from being matched as a list. We walk each match and
    #    then manually extract every comma-separated or and-joined number in
    #    its span.
    LIST_SPAN_RE = re.compile(rf"\b[Aa]rticles?\s+({ARTICLE_NUM})((?:{PARA_SUFFIX}\s*,\s*{ARTICLE_NUM}{PARA_SUFFIX})*"
                              rf"\s*,?\s+and\s+{ARTICLE_NUM}{PARA_SUFFIX})\b")

    def _list_sub(m: re.Match[str]) -> str:
        if _is_external(scratch, m.start(), m.end()):
            return " " * (m.end() - m.start())
        span_text = m.group(0)
        for num_match in re.finditer(rf"\b({ARTICLE_NUM}){PARA_SUFFIX}", span_text):
            # Skip the word "Articles"/"Article" itself, which isn't a digit.
            found.add(num_match.group(1))
        return " " * (m.end() - m.start())

    scratch = LIST_SPAN_RE.sub(_list_sub, scratch)

    # 3. Remaining singles.
    for m in SINGLE_RE.finditer(scratch):
        if _is_external(scratch, m.start(), m.end()):
            continue
        found.add(m.group(1))

    return sorted(found, key=_article_sort_key)


def _article_sort_key(num: str) -> tuple[int, int, str]:
    """Sort key: numeric part first, then letter suffix.

    "6" < "6a" < "7"; non-numeric "Annex I" sorts to the end.
    """
    m = re.match(r"^(\d+)([a-z]?)$", num)
    if not m:
        return (10**9, 0, num)
    return (int(m.group(1)), ord(m.group(2)) if m.group(2) else 0, num)


# --------------------------------------------------------------------------- #
# File I/O
# --------------------------------------------------------------------------- #


def _existing_article_numbers(data: dict) -> set[str]:
    return {str(a.get("number")) for a in data.get("articles", []) if a.get("number") is not None}


def _needs_mapping(recital: dict) -> bool:
    """True iff recital.related_articles is missing/empty and should be filled."""
    if "related_articles" not in recital:
        return True
    v = recital["related_articles"]
    if v is None:
        return True
    if isinstance(v, str) and v.strip() == "":
        return True
    if isinstance(v, list) and len(v) == 0:
        return True
    return False


def process_seed(
    path: str, dry_run: bool = False, verbose: bool = False
) -> tuple[int, int, int]:
    """Return (total_recitals, mapped_before, mapped_after) for one seed file."""
    with open(path, "r", encoding="utf-8") as fp:
        data = json.load(fp)

    recitals = data.get("recitals", [])
    total = len(recitals)
    if total == 0:
        return (0, 0, 0)

    valid_numbers = _existing_article_numbers(data)

    mapped_before = sum(
        1
        for r in recitals
        if isinstance(r.get("related_articles"), list) and len(r["related_articles"]) > 0
    )

    changed = False
    for r in recitals:
        if not _needs_mapping(r):
            continue
        text = r.get("text", "") or ""
        extracted = _extract_from_text(text)
        # Filter to numbers that actually exist as articles in this seed.
        # This drops false positives like "Article 290 TFEU" in seeds that
        # don't have an Article 290.
        filtered = [n for n in extracted if n in valid_numbers]
        if not filtered:
            # Don't add an empty related_articles key to recitals that
            # didn't have one — preserve the existing shape.
            continue
        r["related_articles"] = filtered
        changed = True
        if verbose:
            print(
                f"    R{r.get('recital_number')}: {filtered}",
                file=sys.stderr,
            )

    mapped_after = sum(
        1
        for r in recitals
        if isinstance(r.get("related_articles"), list) and len(r["related_articles"]) > 0
    )

    if changed and not dry_run:
        with open(path, "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)
            fp.write("\n")

    return (total, mapped_before, mapped_after)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def _iter_seeds(paths: Iterable[str]) -> list[str]:
    out: list[str] = []
    for p in paths:
        if os.path.isdir(p):
            for name in sorted(os.listdir(p)):
                if name.endswith(".json"):
                    out.append(os.path.join(p, name))
        else:
            out.append(p)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seeds", nargs="*", help="Seed file(s) to process")
    ap.add_argument("--all", action="store_true", help=f"Process every *.json in {SEED_DIR}")
    ap.add_argument("--dry-run", action="store_true", help="Do not write files")
    ap.add_argument("--verbose", action="store_true", help="Print every mapping decision")
    args = ap.parse_args()

    if args.all:
        seeds = _iter_seeds([SEED_DIR])
    elif args.seeds:
        seeds = _iter_seeds(args.seeds)
    else:
        ap.error("provide seed files or --all")

    print(f"{'regulation':<45} {'recitals':>9} {'before':>7} {'after':>6}")
    print("-" * 72)
    for path in seeds:
        name = os.path.basename(path).replace(".json", "")
        total, before, after = process_seed(path, dry_run=args.dry_run, verbose=args.verbose)
        if total == 0:
            continue
        print(f"{name:<45} {total:>9d} {before:>7d} {after:>6d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
