#!/usr/bin/env python3
"""
track_lines.py
==============

Given a list of commit SHA‑1s, emit every line that (a) was
added/modified by one of those commits **and** (b) still exists in HEAD,
with the line number at HEAD.

Usage
-----

    ./track_lines.py <sha1> [<sha1> ...]   # read sha1s from CLI
    # or
    cat sha-list.txt | ./track_lines.py -   # read from stdin

Output
------

    <file_path>\t<line_in_HEAD>\t<origin_sha>

The script is deliberately written using only the standard library
and the external `git` command; it should run on any modern OS where
Git is installed.

Author:  ChatGPT (2026)
"""

import argparse
import subprocess
import sys
from collections import defaultdict, namedtuple
from typing import List, Dict, Tuple, Set

# ----------------------------------------------------------------------
# Helper utilities – thin wrappers around subprocess
# ----------------------------------------------------------------------
def git(*args: str, cwd: str = None) -> str:
    """Run a git command, return stdout as text, raise on error."""
    result = subprocess.run(
        ["git"] + list(args), cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr}")
    return result.stdout

def git_rev_list(start: str, end: str = "HEAD") -> List[str]:
    """All commits reachable from `end` but not from `start` (exclusive)."""
    out = git("rev-list", "--reverse", f"{start}..{end}")
    return out.strip().splitlines()

def git_diff_tree(sha: str) -> List[str]:
    """Raw patch (unified diff) for a commit, as a list of lines."""
    # -p gives the full patch; --no-prefix removes the a/ b/ prefixes
    return git("show", sha, "--pretty=format:", "--no-prefix", "-p").splitlines()

def git_blame(file_path: str, start_line: int, end_line: int) -> List[Tuple[int, str]]:
    """
    Return a list of (final_line_number, origin_sha) for the requested range.
    Uses --incremental (-p) to make parsing easy.
    """
    output = git(
        "blame",
        "-p",
        "-L", f"{start_line},{end_line}",
        file_path,
    )
    # Blame -p emits blocks like:
    #   <origin_sha> (<author> <author-time> <tz> <line-number>) <line-content>
    # We only need the first field and the line number inside the parentheses.
    result = []
    for line in output.splitlines():
        if not line:
            continue
        if line[0].isspace():
            continue            # skip the "filename" and "summary" lines
        parts = line.split()
        origin = parts[0]
        # The line number is the 4th token inside the (...)
        # format: (author 2020-01-01 0  42)  <-- we want the last number
        # easier: find the last token that is a digit
        for token in reversed(parts):
            if token.isdigit():
                final_ln = int(token)
                break
        else:
            continue
        result.append((final_ln, origin))
    return result

# ----------------------------------------------------------------------
# Data structures for tracking line ranges
# ----------------------------------------------------------------------
PatchHunk = namedtuple("PatchHunk", "file start_old cnt_old start_new cnt_new")
Change = namedtuple("Change", "origin_sha file line_at_head")

# ----------------------------------------------------------------------
# Parsing a unified diff hunk header
# ----------------------------------------------------------------------
import re

HUNK_RE = re.compile(r'^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@')

def parse_hunks(patch_lines: List[str]) -> List[PatchHunk]:
    """
    Turn a raw patch (as a list of lines) into a list of PatchHunk objects.
    We ignore context lines – only the hunk header is needed for line tracking.
    """
    hunks = []
    for line in patch_lines:
        m = HUNK_RE.match(line)
        if not m:
            continue
        start_old = int(m.group(1))
        cnt_old = int(m.group(2) or "1")   # if omitted, default = 1
        start_new = int(m.group(3))
        cnt_new = int(m.group(4) or "1")
        # The filename is not present in the hunk header; we extract it from
        # the surrounding diff metadata instead (handled later).
        hunks.append(PatchHunk("", start_old, cnt_old, start_new, cnt_new))
    return hunks

def extract_file_path_from_patch(patch: List[str]) -> str:
    """
    Look at the first diff header lines to pull out the (new) filename.
    Handles renames (e.g. 'rename from' / 'rename to') and standard
    '--- a/<path>' / '+++ b/<path>'.
    """
    old_path = new_path = None
    for line in patch:
        if line.startswith("--- "):
            old_path = line[4:].strip()
        elif line.startswith("+++ "):
            new_path = line[4:].strip()
            break
    # Strip leading a/ b/ that Git prints
    if new_path:
        new_path = re.sub(r"^[ab]/", "", new_path)
    return new_path or old_path or ""

# ----------------------------------------------------------------------
# Core algorithm: expand each commit's changed lines forward to HEAD
# ----------------------------------------------------------------------
def collect_all_hunks(target_shas: Set[str]) -> Dict[str, List[Tuple[PatchHunk, str]]]:
    """
    Returns a mapping:
        file_path -> List[ (PatchHunk, origin_sha) ]
    containing **only** the hunks that belong to the target SHAs.
    """
    file_hunks: Dict[str, List[Tuple[PatchHunk, str]]] = defaultdict(list)

    for sha in target_shas:
        raw_patch = git_diff_tree(sha)
        # Walk the patch to collect file names and hunks
        cur_file = None
        for line in raw_patch:
            if line.startswith("diff --git"):
                # The next "---" / "+++" lines will contain the file name
                cur_file = None
            elif line.startswith("--- "):
                cur_file = extract_file_path_from_patch([line] + raw_patch[raw_patch.index(line)+1:raw_patch.index(line)+3])
            elif line.startswith("@@ "):
                # parse a hunk header
                m = HUNK_RE.match(line)
                if not m:
                    continue
                start_old = int(m.group(1))
                cnt_old = int(m.group(2) or "1")
                start_new = int(m.group(3))
                cnt_new = int(m.group(4) or "1")
                h = PatchHunk(cur_file, start_old, cnt_old, start_new, cnt_new)
                file_hunks[cur_file].append((h, sha))
    return file_hunks

def forward_track(file_path: str,
                  hunks: List[Tuple[PatchHunk, str]],
                  tip: str = "HEAD") -> List[Change]:
    """
    Given a list of hunks that affect a single file (in chronological order
    *as they appear in the repo history*), follow each changed line forward
    until `tip` and return a list of `Change` objects that survive.

    This function is the heart of the line‑tracking logic.
    """

    # First we need the **complete** commit list for the file, **from the
    # earliest hunk we care about up to HEAD**, because later commits may
    # insert/delete lines before/after our region.
    # We obtain that by asking `git log -p --reverse <file>`
    commits = git_rev_list(start="0000000", end=tip)  # start with the *empty* root

    # Build a list of *all* hunks for the file (including those not in target)
    all_file_hunks: List[Tuple[PatchHunk, str]] = []
    for c in commits:
        raw = git_diff_tree(c)
        cur = None
        for line in raw:
            if line.startswith("diff --git"):
                cur = None
            elif line.startswith("--- "):
                cur = extract_file_path_from_patch([line] + raw[raw.index(line)+1:raw.index(line)+3])
            elif line.startswith("@@ "):
                m = HUNK_RE.match(line)
                if not m:
                    continue
                start_old, cnt_old = int(m.group(1)), int(m.group(2) or "1")
                start_new, cnt_new = int(m.group(3)), int(m.group(4) or "1")
                all_file_hunks.append((PatchHunk(cur, start_old, cnt_old,
                                                start_new, cnt_new), c))

    # ------------------------------------------------------------------
    # 1️⃣  Build an *interval map* that tracks, for every line that ever
    #     existed in this file, which **origin SHA** it currently belongs to.
    # ------------------------------------------------------------------
    # We represent the file as a list of (origin_sha) for each line.
    # At the beginning (empty repo) the list is empty.
    line_map: List[str] = []   # index = line number - 1, value = origin SHA

    # Helper to apply a single hunk to line_map
    def apply_hunk(hunk: PatchHunk, origin_sha: str):
        """
        Mimic the effect of a unified diff hunk on our line_map.
        Deletions remove entries; insertions add a new entry with `origin_sha`.
        """
        nonlocal line_map
        # Convert 1‑based start into 0‑based index
        start_idx = hunk.start_old - 1

        # 1️⃣ Deletions (cnt_old > 0)
        if hunk.cnt_old:
            del line_map[start_idx:start_idx + hunk.cnt_old]

        # 2️⃣ Insertions (cnt_new > 0)
        if hunk.cnt_new:
            inserts = [origin_sha] * hunk.cnt_new
            line_map[start_idx:start_idx] = inserts

    # Walk the *full* history once, building up line_map.
    # While we walk, remember the *positions* that belong to our target SHAs.
    # After the walk finishes, line_map represents the file at HEAD.
    # We then simply ask for the current line numbers of the lines whose
    # stored origin is in the target set.

    for hunk, sha in all_file_hunks:
        apply_hunk(hunk, sha)

    # ------------------------------------------------------------------
    # 2️⃣  Gather the *surviving* lines that belong to the desired SHAs
    # ------------------------------------------------------------------
    results: List[Change] = []
    for idx, origin in enumerate(line_map):
        if origin in target_shas:
            results.append(Change(origin_sha=origin,
                                 file=file_path,
                                 line_at_head=idx + 1))
    return results

# ----------------------------------------------------------------------
# Driver code
# ----------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description=(
            "Given a list of commit SHA‑1s, output every line that "
            "still exists in HEAD and whose *last modifier* is one of those "
            "SHA‑1s."
        )
    )
    parser.add_argument(
        "shas",
        nargs="*",
        help="SHA‑1s to track. Use '-' to read them from stdin (one per line).",
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # 1️⃣  Load the list of target SHA‑1s
    # ------------------------------------------------------------------
    if args.shas == ["-"]:
        target_shas = {line.strip() for line in sys.stdin if line.strip()}
    else:
        target_shas = set(args.shas)

    if not target_shas:
        sys.exit("No SHA‑1s supplied – nothing to do.")

    # ------------------------------------------------------------------
    # 2️⃣  Collect *only* the hunks that belong to the target set.
    # ------------------------------------------------------------------
    # We also need the chronological order of those hunks, because
    # later patches can shift the line numbers of earlier ones.
    # The simplest way is to walk the repo history **once**, storing
    # every hunk together with its SHA, then filter.
    # In practice, for a medium‑size repo this is cheap (a few MB of text).

    # Gather all commits that *touch* any of the target SHAs (including later commits that may affect the same file)
    # For simplicity we walk from the *oldest* target SHA all the way to HEAD.
    # First, find the oldest target SHA in topological order:
    revs = git("rev-list", "--reverse", "--topo-order", "--no-walk", *target_shas).splitlines()
    oldest_sha = revs[0] if revs else None
    if not oldest_sha:
        sys.exit("Could not determine the oldest SHA among the targets.")

    # All commits from that point to HEAD (inclusive)
    history = git_rev_list(oldest_sha, "HEAD")
    # Append the oldest itself (rev-list excludes the lower bound)
    history.insert(0, oldest_sha)

    # Build a per‑file list of (PatchHunk, origin_sha) in **chronological** order
    per_file_hunks: Dict[str, List[Tuple[PatchHunk, str]]] = defaultdict(list)

    for sha in history:
        raw = git_diff_tree(sha)
        cur_file = None
        for i, line in enumerate(raw):
            if line.startswith("diff --git"):
                cur_file = None
            elif line.startswith("--- "):
                # The next line should be "+++"
                cur_file = extract_file_path_from_patch(raw[i:i+3])
            elif line.startswith("@@ "):
                m = HUNK_RE.match(line)
                if not m:
                    continue
                start_old = int(m.group(1))
                cnt_old = int(m.group(2) or "1")
                start_new = int(m.group(3))
                cnt_new = int(m.group(4) or "1")
                h = PatchHunk(cur_file, start_old, cnt_old, start_new, cnt_new)
                per_file_hunks[cur_file].append((h, sha))

    # ------------------------------------------------------------------
    # 3️⃣  For each file, forward‑track lines and emit survivors.
    # ------------------------------------------------------------------
    all_changes: List[Change] = []

    for fpath, hunks in per_file_hunks.items():
        # The list is already chronological because we filled it while
        # walking the repository forwards.
        # We only need to consider those hunks whose origin SHA is in target_shas.
        target_hunks = [(h, sha) for (h, sha) in hunks if sha in target_shas]
        if not target_hunks:
            continue  # nothing of interest in this file

        # We still have to process *all* hunks (including non‑target) because
        # they influence line positions.
        # The forward_track() helper re‑applies the full history and then
        # extracts lines whose final origin matches a target SHA.
        changes = forward_track(fpath, hunks)
        all_changes.extend(changes)

    # ------------------------------------------------------------------
    # 4️⃣  Output
    # ------------------------------------------------------------------
    for c in sorted(all_changes, key=lambda x: (x.file, x.line_at_head)):
        print(f"{c.file}\t{c.line_at_head}\t{c.origin_sha}")

if __name__ == "__main__":
    main()