#!/usr/bin/env python3
"""
Post-processor that splits annexes trapped inside the last article of a seed file
into their own article entries. Idempotent: re-running on a clean seed is a no-op.

Usage:
    python3 scripts/extract-trapped-annexes.py <seed.json> [--dry-run]
    python3 scripts/extract-trapped-annexes.py --all [--dry-run]

Matches the shape used by existing CRA/AI_ACT/MDR seeds: new entries appended to
articles[] with shape { number: "Annex <roman>", title, text, chapter: "Annexes" }.
"""
import json
import re
import sys
from pathlib import Path

SEED_DIR = Path(__file__).resolve().parent.parent / "data" / "seed"

# Match an ANNEX marker on its own line. Allows Roman numerals I-XL with optional
# letter suffix (e.g. "ANNEX IIIa"). Excludes "ANNEX" inside prose.
ANNEX_MARKER = re.compile(r"^ANNEX\s+([IVXL]+[A-Z]?)\s*$", re.MULTILINE)


def split_trapped_annexes(text: str):
    """
    Given an article body that may have annex text appended after the real
    article content, return (clean_article_text, [annex_dicts]).

    Returns the original text and an empty list if no trapped annexes are found.
    """
    matches = list(ANNEX_MARKER.finditer(text))
    if len(matches) < 2:
        # A single ANNEX marker could be an in-text reference ("see ANNEX I").
        # Require at least two markers to treat this as trapped annexes.
        return text, []

    # First marker = start of the annex block.
    annex_start = matches[0].start()
    clean_article = text[:annex_start].rstrip()

    annexes = []
    for i, m in enumerate(matches):
        roman = m.group(1)
        body_start = m.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()

        # First content line after the marker = title, but skip over EUR-Lex
        # consolidation markers (▼B, ▼M2, ►M7, ◄) and numeric-only lines that
        # are part of the numbered-list body rather than a real heading.
        title_line = ""
        body_lines = body.split("\n")
        rest_start = 0
        for idx, line in enumerate(body_lines):
            stripped = line.strip()
            if not stripped:
                continue
            # EUR-Lex amendment markers: ▼B, ▼M2, ►M7, ►, ◄, ►M7\nUNION ◄ etc.
            if re.fullmatch(r"[▼►◄]\s*[A-Z]?\d*", stripped):
                continue
            # Numeric-only list marker like "1." "1.1." "(1)" "(a)"
            if re.fullmatch(r"\(?\s*[0-9]+[.)]?\s*\)?|\(?\s*[a-z]\s*\)", stripped):
                continue
            title_line = stripped
            rest_start = idx + 1
            break
        rest = "\n".join(body_lines[rest_start:]).strip()

        # The full text preserved as-is so downstream consumers see the complete
        # "ANNEX <roman>\n\n<title>\n\n<body>" structure.
        full_text = f"ANNEX {roman}\n\n{title_line}\n\n{rest}".strip() if rest else f"ANNEX {roman}\n\n{title_line}".strip()

        annexes.append(
            {
                "number": f"Annex {roman}",
                "title": title_line,
                "text": full_text,
                "chapter": "Annexes",
            }
        )

    return clean_article, annexes


def already_has_annex_entries(articles):
    """Return True if any article entry already uses 'Annex ...' as its number."""
    return any(
        str(a.get("number", "")).startswith(("Annex ", "ANNEX "))
        for a in articles
    )


def process_seed(seed_path: Path, dry_run: bool = False):
    try:
        with open(seed_path) as f:
            seed = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        return {"file": seed_path.name, "status": "error", "error": str(e)}

    reg_id = seed.get("id", seed_path.stem)
    articles = seed.get("articles", [])
    if not articles:
        return {"file": seed_path.name, "id": reg_id, "status": "skipped (no articles)"}

    if already_has_annex_entries(articles):
        return {
            "file": seed_path.name,
            "id": reg_id,
            "status": "skipped (already has Annex entries)",
        }

    # Walk articles to find the one carrying trapped annex text. Usually the
    # last article, but not always — some seeds have a deliberately empty tail
    # article. Take the last one whose body contains ≥2 ANNEX markers.
    trapped_idx = None
    for i in range(len(articles) - 1, -1, -1):
        body = articles[i].get("text", "")
        if len(ANNEX_MARKER.findall(body)) >= 2:
            trapped_idx = i
            break

    if trapped_idx is None:
        return {
            "file": seed_path.name,
            "id": reg_id,
            "status": "skipped (no trapped annexes)",
        }

    original_text = articles[trapped_idx]["text"]
    clean_text, annexes = split_trapped_annexes(original_text)

    if not annexes:
        return {
            "file": seed_path.name,
            "id": reg_id,
            "status": "skipped (no annexes after split)",
        }

    # Mutate a copy so we can report before writing.
    new_articles = list(articles)
    new_articles[trapped_idx] = {**articles[trapped_idx], "text": clean_text}
    new_articles.extend(annexes)

    if not dry_run:
        seed["articles"] = new_articles
        with open(seed_path, "w") as f:
            json.dump(seed, f, indent=2, ensure_ascii=False)

    return {
        "file": seed_path.name,
        "id": reg_id,
        "status": "extracted" if not dry_run else "would-extract",
        "host_article_number": articles[trapped_idx].get("number"),
        "host_article_before": len(original_text),
        "host_article_after": len(clean_text),
        "annexes": [
            {"number": a["number"], "title": a["title"][:80], "bytes": len(a["text"])}
            for a in annexes
        ],
    }


def main(argv):
    args = argv[1:]
    dry_run = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]

    if not args:
        print("Usage: extract-trapped-annexes.py <seed.json|--all> [--dry-run]", file=sys.stderr)
        return 1

    if args[0] == "--all":
        targets = sorted(SEED_DIR.glob("*.json"))
    else:
        targets = [Path(p) for p in args]

    results = []
    for target in targets:
        result = process_seed(target, dry_run=dry_run)
        results.append(result)
        if result["status"].startswith(("extracted", "would-extract")):
            print(
                f"[{result['status']:15s}] {result['id']:30s} "
                f"host={result['host_article_number']:5s} "
                f"{result['host_article_before'] // 1024:3d}KB→{result['host_article_after'] // 1024:3d}KB "
                f"+{len(result['annexes'])} annexes"
            )
            for a in result["annexes"]:
                print(f"                   {a['number']:12s} {a['bytes'] // 1024:3d}KB  {a['title']}")
        elif result["status"] == "error":
            print(f"[error]          {result['file']}: {result['error']}")

    # Summary
    extracted = [r for r in results if r["status"].startswith(("extracted", "would-extract"))]
    skipped = [r for r in results if r["status"].startswith("skipped")]
    errors = [r for r in results if r["status"] == "error"]
    print()
    print(f"Summary: {len(extracted)} modified, {len(skipped)} skipped, {len(errors)} errors")
    return 0 if not errors else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
