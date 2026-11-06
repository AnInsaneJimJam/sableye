#!/usr/bin/env python3
"""Gambit mutation testing for PaymentProcessor and SubscriptionManager.

Generates mutants with Gambit, runs the Foundry suite (unit, fuzz, invariant, Chimera) against each in parallel
workers, then runs Halmos on the survivors. Writes project-docs/mutation-report.md.
Run from sdk/contracts:  python3 test/mutation/run.py   (needs gambit, forge, halmos; ~30-60 min)
"""
import json, os, queue, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sdk/contracts
REPORT = ROOT.parents[1] / "project-docs" / "mutation-report.md"
SOLC = Path.home() / ".local/share/svm/0.8.30/solc-0.8.30"
CONTRACTS = ["PaymentProcessor", "SubscriptionManager"]
WORKERS = int(os.environ.get("WORKERS", "4"))
WORK = Path(tempfile.mkdtemp(prefix="sableye-mutation-"))
ENV = {**os.environ, "FOUNDRY_FUZZ_RUNS": "256", "FOUNDRY_INVARIANT_RUNS": "64", "FOUNDRY_INVARIANT_DEPTH": "32"}

def gen(contract):
    wrapper = WORK / "solc"
    wrapper.write_text(f'#!/bin/sh\nexec {SOLC} --via-ir "$@"\n'); wrapper.chmod(0o755)
    out = WORK / f"mutants-{contract}"
    subprocess.run(["gambit", "mutate", "--filename", f"src/{contract}.sol", "--solc", str(wrapper), "--solc_evm_version", "prague",
                    "--solc_remappings", "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
                    "--solc_allow_paths", str(ROOT), "--outdir", str(out)], cwd=ROOT, check=True, capture_output=True)
    return [{**m, "contract": contract, "path": out / m["name"]} for m in json.loads((out / "gambit_results.json").read_text())]

def workdir(i):
    w = WORK / f"w{i}"
    if not w.exists():
        w.mkdir()
        # Only lib is symlinked: forge resolves symlinks, so a symlinked test/ would import the ORIGINAL src/.
        (w / "lib").symlink_to(ROOT / "lib")
        for name in ["src", "test", "script"]:
            shutil.copytree(ROOT / name, w / name)
        shutil.copy(ROOT / "foundry.toml", w / "foundry.toml")
    return w

def technique(test):
    if test.startswith("check_"): return "halmos"
    if test.startswith("testFuzz"): return "fuzz"
    if test.startswith("invariant"): return "invariant"
    if test.startswith("property") or "recon" in test.lower(): return "chimera"
    return "unit"

# Each running mutant needs a worker directory of its own: two mutants sharing one would overwrite each other's src/.
FREE = queue.Queue()

def with_worker(fn):
    def run(m):
        i = FREE.get()
        try:
            return fn(i, m)
        finally:
            FREE.put(i)
    return run

def run_forge(i, m):
    w = workdir(i)
    target = w / "src" / f"{m['contract']}.sol"
    shutil.copy(m["path"], target)
    try:
        p = subprocess.run(["forge", "test", "--no-match-path", "test/halmos/*"], cwd=w, env=ENV, capture_output=True, text=True, timeout=900)
        out = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout + p.stderr)
        if "Compiler run failed" in out or "Error: Compil" in out: return {**m, "status": "invalid"}
        # FAIL reasons can contain brackets (fuzz args=[...]), so match lazily up to "] name("
        failed = sorted(set(re.findall(r"\[FAIL.*?\]\s+(\w+)\(", out)))
        return {**m, "status": "killed" if failed or p.returncode else "survived", "failed": failed,
                "by": sorted({technique(t) for t in failed})}
    finally:
        shutil.copy(ROOT / "src" / f"{m['contract']}.sol", target)

def run_halmos(i, m):
    w = workdir(i)
    target = w / "src" / f"{m['contract']}.sol"
    shutil.copy(m["path"], target)
    try:
        # forge test leaves artifacts without the AST Halmos needs (it would silently skip the proofs), so clean first.
        subprocess.run(["forge", "clean"], cwd=w, capture_output=True)
        p = subprocess.run(["halmos", "--match-contract", "Halmos"], cwd=w, capture_output=True, text=True, timeout=1800)
        if "No tests with" in p.stdout + p.stderr or "parsing failure" in p.stdout + p.stderr:
            raise RuntimeError(f"halmos did not run the proofs for mutant {m['id']} of {m['contract']}")
        out = re.sub(r"\x1b\[[0-9;]*m", "", p.stdout + p.stderr)
        failed = sorted(set(re.findall(r"\[(?:FAIL|ERROR)\]\s+(check_\w+)\(", out)))
        return {**m, "halmos": failed}
    finally:
        shutil.copy(ROOT / "src" / f"{m['contract']}.sol", target)

def main():
    mutants = [m for c in CONTRACTS for m in gen(c)][: int(os.environ.get("LIMIT", "100000"))]
    print(f"{len(mutants)} mutants", flush=True)
    for i in range(WORKERS):
        FREE.put(i)
    with ThreadPoolExecutor(WORKERS) as ex:
        results = list(ex.map(with_worker(run_forge), mutants))
    survivors = [r for r in results if r["status"] == "survived"]
    print(f"forge: {sum(r['status'] == 'killed' for r in results)} killed, {len(survivors)} survived; running Halmos on survivors", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex:
        h = {r["id"] + r["contract"]: r for r in ex.map(with_worker(run_halmos), survivors)}
    for r in results:
        hr = h.get(r["id"] + r["contract"])
        if hr and hr["halmos"]: r.update(status="killed", by=["halmos"], failed=hr["halmos"])
    write_report(results)
    (WORK / "results.json").write_text(json.dumps(results, default=str, indent=1))
    print(f"report: {REPORT}\nraw: {WORK / 'results.json'}")

def describe(r):
    """(operator, source line, original, replacement) from Gambit's diff annotation."""
    m = re.search(r"/// (\w+)\(`(.*?)` \|==> `(.*?)`\)", r["diff"])
    h = re.search(r"@@ -(\d+)", r["diff"])
    body = r["diff"].split("\n")[3:]
    line = int(h.group(1)) + next((i for i, l in enumerate(body) if l.startswith("-")), 0) if h else "?"
    return (m.group(1), line, m.group(2).replace("|", "\\|"), m.group(3).replace("|", "\\|")) if m else (r["description"], line, "?", "?")

def write_report(results):
    lines = ["# Mutation testing (Gambit)", "", "Generated by `sdk/contracts/test/mutation/run.py`. Gambit 1.0.6 mutants of each contract are run",
             "against the Foundry suite (fuzz 256 runs, invariant 64x32); survivors are then run against the Halmos proofs.", ""]
    for c in CONTRACTS:
        rs = [r for r in results if r["contract"] == c and r["status"] != "invalid"]
        k = [r for r in rs if r["status"] == "killed"]
        lines += [f"## {c}", "", f"- Valid mutants: {len(rs)} (invalid / non-compiling: {sum(r['contract'] == c and r['status'] == 'invalid' for r in results)})",
                  f"- Killed: {len(k)} ({100 * len(k) // max(1, len(rs))}%)"]
        for t in ["unit", "fuzz", "invariant", "chimera", "halmos"]:
            lines.append(f"  - caught by {t}{' (only run on Foundry survivors)' if t == 'halmos' else ''}: {sum(t in r.get('by', []) for r in k)}")
        surv = [r for r in rs if r["status"] == "survived"]
        lines += [f"- Survived: {len(surv)}", ""]
        if surv:
            lines += ["| id | operator | line | mutation | verdict |", "|---|---|---|---|---|"]
            for r in surv:
                op, line, a, b = describe(r)
                lines.append(f"| {r['id']} | {op} | {line} | `{a}` → `{b}` | TODO |")
            lines.append("")
    REPORT.write_text("\n".join(lines) + "\n")

if __name__ == "__main__":
    main()
