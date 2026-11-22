#!/usr/bin/env python3
"""Check Nori documentation links, example packages and authoring inputs offline."""

from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

from source_protocol.authoring import SourceInputs
from source_protocol.nori_validation import validate_package


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "docs/nori-source/examples"


def markdown_body(path):
    return re.sub(r"(?ms)^```.*?^```[^\n]*(?:\n|$)", "", path.read_text(encoding="utf-8"))


def heading_ids(path):
    counts = {}
    result = set()
    for heading in re.findall(r"(?m)^#{1,6}\s+(.+)$", markdown_body(path)):
        slug = re.sub(r"[^\w -]", "", heading.lower()).replace(" ", "-")
        count = counts.get(slug, 0)
        result.add(slug if count == 0 else f"{slug}-{count}")
        counts[slug] = count + 1
    return result


def main():
    failures = []
    links = 0
    documents = [ROOT / "README.md", ROOT / "AGENTS.md", *sorted((ROOT / "docs").rglob("*.md"))]
    for document in documents:
        for href in re.findall(r"\[[^\]\n]+\]\(([^\s)]+)\)", markdown_body(document)):
            url = urlsplit(href)
            if url.scheme or url.netloc:
                continue
            links += 1
            target = (document.parent / unquote(url.path)).resolve() if url.path else document
            if not target.exists():
                failures.append(f"{document.relative_to(ROOT)}: missing link {href}")
            elif url.fragment and target.suffix == ".md" and unquote(url.fragment) not in heading_ids(target):
                failures.append(f"{document.relative_to(ROOT)}: missing heading {href}")

    packages = sorted(EXAMPLES.rglob("*.nori.json"))
    for package in packages:
        validation = validate_package(SourceInputs(package, authoring=False).load())
        if not validation.valid:
            failures.append(f"{package.relative_to(ROOT)}: {validation.diagnostics}")

    projects = [
        ("offline.source.yaml", "offline.nori.json"),
        ("aggregate.source.yaml", "script-aggregate.nori.json"),
        ("web-novel/source.yaml", "web-novel/source.nori.json"),
    ]
    for author, published in projects:
        if SourceInputs(EXAMPLES / author, authoring=True).load() != SourceInputs(EXAMPLES / published, authoring=False).load():
            failures.append(f"{published}: author inputs and published JSON differ; repack the example")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print(f"Checked {links} local documentation links, {len(packages)} Nori JSON examples and {len(projects)} author projects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
