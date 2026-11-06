// Model of the indexer (sdk/packages/server/src/indexer.ts): sync = reorg check + rollback, chunked log fetch,
// emit paid/final/reorged events. The environment mines blocks (optionally including a payment), advances the
// finalized head, and reorgs any unfinalized suffix (a payment in it is dropped or re-included elsewhere). A sync
// can hit an RPC failure in the middle of the rollback or between two fetch chunks.
//
// FIXED = false: indexer.ts before the fixes this model found: sync mutates state in place, and the rollback
// trusts today's finalized head. FIXED = true: a failed sync leaves the state untouched, and the rollback only
// trusts the finalized head seen at the last successful sync (`finalSeen`). Abstractions: one log per payment; log identity = (payment, block, fork),
// mirroring (txHash, logIndex, blockHash); the safe head and webhooks are left out (delivery is per event id).
module indexer {
  const FIXED: bool

  pure val PAYS = Set("x", "y")
  pure val MAXB = 5
  pure val BLOCKS = 0.to(MAXB)

  type Log = (str, int, int) // payment, block, fork
  type Ev = (str, str, int, int) // type, payment, block, fork

  // chain
  var tip: int
  var final: int
  var tipFork: int
  var forkOf: int -> int
  var payAt: str -> (int, int) // (block, fork); block < 0: not included (yet)
  // indexer
  var cursor: (int, int) // (block, fork); block < 0: none
  var rh: int -> int // recentHashes: block -> fork, -1 none
  var logs: List[Log]
  var emitted: Set[Ev]
  var lastSyncOk: bool
  var finalSeen: int

  pure def toSet(l: List[Log]): Set[Log] = l.foldl(Set(), (acc, x) => acc.union(Set(x)))
  pure def maxOf(s: Set[int], dflt: int): int = s.fold(dflt, (a, b) => if (b > a) b else a)

  def canonical(lg: Log): bool = lg._2 >= 0 and lg._2 <= tip and forkOf.get(lg._2) == lg._3
  def chainLogs(lo: int, hi: int): Set[Log] =
    PAYS.filter(p => payAt.get(p)._1 >= lo and payAt.get(p)._1 <= hi).map(p => (p, payAt.get(p)._1, payAt.get(p)._2))
  pure def sorted(s: Set[Log]): List[Log] = // by block (ties: arbitrary but fixed)
    BLOCKS.fold(List(), (acc, b) => PAYS.fold(acc, (a2, p) => s.filter(x => x._1 == p and x._2 == b).fold(a2, (a3, x) => a3.append(x))))

  action init = all {
    tip' = 0, final' = 0, tipFork' = 1,
    forkOf' = BLOCKS.mapBy(n => 1),
    payAt' = PAYS.mapBy(p => (-1, 0)),
    cursor' = (-1, 0), rh' = BLOCKS.mapBy(n => -1), logs' = List(), emitted' = Set(), lastSyncOk' = true, finalSeen' = 0,
  }

  action chainUnchanged = all { tip' = tip, final' = final, tipFork' = tipFork, forkOf' = forkOf, payAt' = payAt }
  action indexerUnchanged = all { cursor' = cursor, rh' = rh, logs' = logs, emitted' = emitted, lastSyncOk' = lastSyncOk, finalSeen' = finalSeen }

  action mine = {
    nondet p = PAYS.oneOf()
    nondet include = Bool.oneOf()
    all {
      tip < MAXB,
      tip' = tip + 1,
      forkOf' = forkOf.set(tip + 1, tipFork),
      payAt' = if (include and payAt.get(p)._1 < 0) payAt.set(p, (tip + 1, tipFork)) else payAt,
      final' = final, tipFork' = tipFork,
      indexerUnchanged,
    }
  }

  action finalize = all { final < tip, final' = final + 1, tip' = tip, tipFork' = tipFork, forkOf' = forkOf, payAt' = payAt, indexerUnchanged }

  // Replace blocks r..tip with a new fork. A payment in them is dropped, or re-included in one of them.
  action reorg = {
    nondet r = (final + 1).to(MAXB).oneOf()
    nondet moves = PAYS.setOfMaps(r.to(MAXB).union(Set(-1))).oneOf()
    val nf = tipFork + 1
    all {
      r <= tip,
      tipFork' = nf,
      forkOf' = BLOCKS.mapBy(n => if (n >= r and n <= tip) nf else forkOf.get(n)),
      payAt' = PAYS.mapBy(p =>
        if (payAt.get(p)._1 < r) payAt.get(p)
        else if (moves.get(p) >= r and moves.get(p) <= tip) (moves.get(p), nf)
        else (-1, 0)),
      tip' = tip, final' = final,
      // the indexer hasn't seen this reorg yet: "consistent" is only claimed again after the next successful sync
      cursor' = cursor, rh' = rh, logs' = logs, emitted' = emitted, lastSyncOk' = false, finalSeen' = finalSeen,
    }
  }

  // One sync. fault: "none" | "rollback" (RPC error after the rollback dropped logs) | "fetch" (error after chunk 1).
  action sync = {
    nondet fault = Set("none", "rollback", "fetch").oneOf()
    // 1. reorg check + rollback
    val needRollback = cursor._1 >= 0 and cursor._1 <= tip and forkOf.get(cursor._1) != cursor._2
    val floor = if (FIXED) finalSeen else final
    val ancestor = maxOf(BLOCKS.filter(n => n > floor and rh.get(n) >= 0 and rh.get(n) == forkOf.get(n)), floor)
    val dropped = logs.select(l => l._2 > ancestor)
    val logs1 = if (needRollback) logs.select(l => l._2 <= ancestor) else logs
    val rh1 = if (needRollback) BLOCKS.mapBy(n => if (n > ancestor) -1 else rh.get(n)) else rh
    val cur1 = if (needRollback) (ancestor, forkOf.get(ancestor)) else cursor
    val reorgedEvs = toSet(dropped).filter(l => emitted.contains(("paid", l._1, l._2, l._3))).map(l => ("reorged", l._1, l._2, l._3))
    val em1 = if (needRollback) emitted.union(reorgedEvs) else emitted
    // 2. fetch (cur1, tip] in two chunks
    val from = if (cur1._1 < 0) 0 else cur1._1 + 1
    val mid = (from + tip) / 2
    val chunk1 = sorted(chainLogs(from, mid))
    val chunk2 = sorted(chainLogs(mid + 1, tip))
    val logs2 = logs1.concat(chunk1).concat(chunk2)
    val rh2 = BLOCKS.mapBy(n =>
      if (n == tip and from <= tip) forkOf.get(n)
      else if (toSet(chunk1.concat(chunk2)).exists(l => l._2 == n)) forkOf.get(n)
      else rh1.get(n))
    val cur2 = if (from <= tip) (tip, forkOf.get(tip)) else cur1
    val rh3 = BLOCKS.mapBy(n => if (n < final and n != cur2._1) -1 else rh2.get(n))
    // 3. emit
    val em2 = toSet(logs2).fold(em1, (acc, l) =>
      acc.union(Set(("paid", l._1, l._2, l._3))).union(if (l._2 <= final) Set(("final", l._1, l._2, l._3)) else Set()))
    all {
      chainUnchanged,
      if (fault == "rollback" and needRollback) all {
        // failed after dropping logs, before resetting the cursor and emitting `reorged`
        logs' = if (FIXED) logs else logs1, rh' = if (FIXED) rh else rh1,
        cursor' = cursor, emitted' = emitted, lastSyncOk' = false, finalSeen' = finalSeen,
      } else if (fault == "fetch" and from <= mid) all {
        // chunk 1 appended, chunk 2 failed; cursor not advanced
        logs' = if (FIXED) logs else logs1.concat(chunk1), rh' = if (FIXED) rh else rh1,
        cursor' = if (FIXED) cursor else cur1, emitted' = if (FIXED) emitted else em1, lastSyncOk' = false, finalSeen' = finalSeen,
      } else all {
        logs' = logs2, rh' = rh3, cursor' = cur2, emitted' = em2, lastSyncOk' = true, finalSeen' = final,
      },
    }
  }

  action step = any { mine, finalize, reorg, sync }

  // ---------- properties ----------

  // Each log is stored once.
  val noDuplicateLogs = logs.length() == toSet(logs).size()

  // After a successful sync, the stored logs are exactly the canonical logs up to the cursor.
  val consistent = lastSyncOk implies toSet(logs) == chainLogs(0, cursor._1)

  // After a successful sync, every reported payment that's no longer canonical has been reported as reorged.
  val reorgReported = lastSyncOk implies emitted.forall(e =>
    (e._1 == "paid" and e._3 <= cursor._1 and not(canonical((e._2, e._3, e._4)))) implies emitted.contains(("reorged", e._2, e._3, e._4)))

  // A payment reported final is never reported reorged.
  val finalNeverRetracted = emitted.forall(e => e._1 == "reorged" implies not(emitted.contains(("final", e._2, e._3, e._4))))

  val safety = noDuplicateLogs and consistent and reorgReported and finalNeverRetracted
}

module indexerBuggy { import indexer(FIXED = false).* }
module indexerFixed { import indexer(FIXED = true).* }
