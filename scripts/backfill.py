#!/usr/bin/env python3
"""Fill in asset sidecars for files that arrived without one.

The plugin only ever writes a sidecar entry for a file it received itself.
Files also arrive by Nextcloud sync, by page fork, from the dropzone plugin and
by plain cp — so the sidecar drifts behind the directory, by design. This script
is the reconciler, and it is deliberately out of process: the farm holds tens of
thousands of asset files and tens of gigabytes, and nothing that size belongs in
a request handler on a shared server.

Read-only unless --write is given.

  ./backfill.py --site anarchive.localhost            # report drift
  ./backfill.py --site anarchive.localhost --write    # add missing entries
  ./backfill.py --write --prune                       # also drop dead entries
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.expanduser("~/.claude/skills/fedwiki-lib"))
from fedwiki import iter_sites, sha256_file  # noqa: E402

# Keep in step with src/constants.js, which is the definition the plugin uses.
SIDECAR = "_anarchive.json"

# Hashing is the expensive part. Above this, report the file but leave sha256
# null rather than reading a gigabyte to fill in a nicety.
DEFAULT_MAX_HASH_BYTES = 512 * 1024 * 1024


def listable(name):
    return not name.startswith(".") and name != SIDECAR


def leaf_folders(site):
    """Yield every directory under assets/ that directly contains files."""
    assets = Path(site) / "assets"
    if not assets.is_dir():
        return
    for dirpath, dirnames, filenames in os.walk(assets):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        if any(listable(f) for f in filenames):
            yield Path(dirpath)


def read_sidecar(folder):
    try:
        data = json.loads((folder / SIDECAR).read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_sidecar(folder, data):
    target = folder / SIDECAR
    tmp = folder / (SIDECAR + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True))
    tmp.replace(target)


def reconcile(folder, max_hash_bytes):
    """Return (data, stats). Never removes an entry — that is --prune's job."""
    data = read_sidecar(folder)
    stats = {"added": 0, "hashed": 0, "stale": 0, "dead": 0, "skipped": 0}

    present = {f for f in os.listdir(folder) if listable(f) and (folder / f).is_file()}

    for name in sorted(present):
        path = folder / name
        size = path.stat().st_size
        entry = data.get(name)

        if entry is None:
            entry = {
                "sha256": None,
                "size": size,
                # No upload event to date this from, so use the file's own mtime
                # rather than inventing "now" and claiming it arrived today.
                "added": int(path.stat().st_mtime * 1000),
                "by": None,
                "from": None,
                "caption": "",
                "licence": "",
                "pin": None,
                "backfilled": True,
            }
            data[name] = entry
            stats["added"] += 1

        # A size that no longer matches means the bytes changed under us; flag it
        # rather than silently rehashing, so a surprise is visible.
        if entry.get("size") not in (None, size):
            entry["stale"] = True
            entry["size"] = size
            entry["sha256"] = None
            stats["stale"] += 1

        if entry.get("sha256") is None:
            if size > max_hash_bytes:
                stats["skipped"] += 1
            else:
                entry["sha256"] = sha256_file(path)
                entry["size"] = size
                entry.pop("stale", None)
                stats["hashed"] += 1

    stats["dead"] = len([n for n in data if n not in present])
    return data, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", action="append", help="domain to process; repeatable, default every site")
    ap.add_argument("--farm", help="one farm root instead of all of them")
    ap.add_argument("--write", action="store_true", help="actually write sidecars (default is a report)")
    ap.add_argument("--prune", action="store_true", help="also drop entries naming files that are gone")
    ap.add_argument("--max-hash-bytes", type=int, default=DEFAULT_MAX_HASH_BYTES)
    args = ap.parse_args()

    wanted = set(args.site or [])
    totals = {"added": 0, "hashed": 0, "stale": 0, "dead": 0, "pruned": 0, "skipped": 0, "folders": 0}
    started = time.time()

    for domain, site in iter_sites(args.farm):
        if wanted and domain not in wanted:
            continue
        for folder in leaf_folders(site):
            data, stats = reconcile(folder, args.max_hash_bytes)
            pruned = 0
            if args.prune:
                present = {f for f in os.listdir(folder) if listable(f) and (folder / f).is_file()}
                for name in [n for n in data if n not in present]:
                    del data[name]
                    pruned += 1

            changed = any(stats[k] for k in ("added", "hashed", "stale")) or pruned
            if changed:
                totals["folders"] += 1
                rel = folder.relative_to(Path(site).parent)
                note = ", ".join(f"{k} {v}" for k, v in stats.items() if v) or "no change"
                print(f"{'write' if args.write else 'would'}  {rel}  ({note}{f', pruned {pruned}' if pruned else ''})")
                if args.write:
                    write_sidecar(folder, data)

            for k in stats:
                totals[k] += stats[k]
            totals["pruned"] += pruned

    verb = "wrote" if args.write else "would write"
    print(
        f"\n{verb} {totals['folders']} folders in {time.time() - started:.1f}s — "
        f"added {totals['added']}, hashed {totals['hashed']}, stale {totals['stale']}, "
        f"skipped-too-big {totals['skipped']}, dead entries {totals['dead']}, pruned {totals['pruned']}"
    )
    if not args.write:
        print("nothing was written; re-run with --write")


if __name__ == "__main__":
    main()
