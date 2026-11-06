// Model of the subscription keeper (sdk/packages/server/src/keeper.ts) and the SubscriptionManager it drives.
//
// Abstractions: time is whole seconds and one block is mined per second (chain time = wall time); `finalized`
// lags the head by FDEPTH blocks; a keeper pass is one atomic step (keeper.ts runs at most one pass at a time).
// The environment can subscribe, cancel, change a payer's funding, reorg an unfinalized `Subscribed` log into a
// different block, and make a subscription "poisoned" (its charge() call throws instead of returning a result,
// e.g. an unrecognised revert in the simulation or an RPC error).
//
// FIXED = false models keeper.ts before the two fixes this model found (a throwing charge aborted the pass with
// no backoff; a reorg could hide a new subscription below the discovery cursor); FIXED = true models it after.
// Check: see specs/README.md.
module keeper {
  const FIXED: bool
  const REORGS: bool
  const POISON: bool

  pure val SUBS = Set("a", "b")
  pure val ORDER = ["a", "b"] // JS Map iteration order
  pure val INTERVAL = 3
  pure val RETRY = 5
  pure val DISCOVER = 2
  pure val MAXSLEEP = 6
  pure val FDEPTH = 2
  pure val MAXFAIL = 3
  // A due, funded subscription must be charged within this long (discovery period + scheduling margin).
  pure val SLACK = DISCOVER + 2

  type OnChain = { st: str, next: int, funded: bool, poison: bool, at: int, fails: int }
  type Entry = { on: bool, next: int, retryAt: int } // retryAt < 0: none
  type P = { chain: str -> OnChain, ks: str -> Entry, lastFail: str -> int, storm: bool, aborted: bool }

  var now: int
  var chain: str -> OnChain
  var ks: str -> Entry
  var cursor: int
  var lastDiscover: int
  var wake: int
  var lastFail: str -> int // ghost: last failed or thrown attempt (after a success: that time - RETRY)
  var storm: bool // ghost: some failed subscription was retried before its backoff

  pure def min(a: int, b: int): int = if (a < b) a else b
  pure def max(a: int, b: int): int = if (a > b) a else b
  pure val NOFAIL = -100

  // keeper.ts upsert(get(subId)): keep a live subscription (preserving retryAt), drop anything else.
  pure def upsert(k: str -> Entry, c: str -> OnChain, s: str): str -> Entry =
    if (c.get(s).st == "live") k.set(s, { on: true, next: c.get(s).next, retryAt: if (k.get(s).on) k.get(s).retryAt else -1 })
    else k.set(s, { ...k.get(s), on: false })

  // Subscriptions whose Subscribed log is in blocks (lo, hi]. lo < 0: everything (the initial list()).
  pure def logsIn(c: str -> OnChain, lo: int, hi: int): Set[str] =
    SUBS.filter(s => c.get(s).st != "none" and (lo < 0 or (c.get(s).at > lo and c.get(s).at <= hi)))

  pure def chargeOne(t: int, p: P, s: str): P = {
    val e = p.ks.get(s)
    val c = p.chain.get(s)
    val early = t - p.lastFail.get(s) < RETRY
    if (p.aborted or not(e.on) or t < e.next or (e.retryAt >= 0 and t < e.retryAt)) p
    else if (c.st != "live")
      // inactive / cap_reached: stop watching
      { ...p, ks: p.ks.set(s, { ...e, on: false }) }
    else if (c.poison)
      if (FIXED) { ...p, ks: p.ks.set(s, { ...e, retryAt: t + RETRY }), lastFail: p.lastFail.set(s, t), storm: p.storm or early }
      else { ...p, aborted: true, lastFail: p.lastFail.set(s, t), storm: p.storm or early } // the throw ends the pass
    else if (t < c.next)
      // not_due (our copy was stale): refresh it
      { ...p, ks: upsert(p.ks, p.chain, s).set(s, { ...upsert(p.ks, p.chain, s).get(s), retryAt: -1 }) }
    else if (not(c.funded)) {
      val fails = c.fails + 1
      val c2 = p.chain.set(s, { ...c, fails: fails, st: if (fails >= MAXFAIL) "cancelled" else "live" })
      val k2 = upsert(p.ks, c2, s)
      { ...p, chain: c2, ks: k2.set(s, { ...k2.get(s), retryAt: t + RETRY }), lastFail: p.lastFail.set(s, t), storm: p.storm or early }
    } else {
      val c2 = p.chain.set(s, { ...c, next: c.next + INTERVAL, fails: 0 })
      val k2 = upsert(p.ks, c2, s)
      // ghost: after a success the overdue clock restarts now (a late charge can leave the next cycle already due)
      { ...p, chain: c2, ks: k2.set(s, { ...k2.get(s), retryAt: -1 }), lastFail: p.lastFail.set(s, t - RETRY) }
    }
  }

  pure def nextWake(t: int, k: str -> Entry): int = {
    val w = SUBS.fold(t + min(MAXSLEEP, DISCOVER), (acc, s) =>
      if (not(k.get(s).on)) acc else min(acc, if (k.get(s).retryAt >= 0) k.get(s).retryAt else k.get(s).next + 1))
    t + max(1, w - t)
  }

  action init = all {
    now' = 0,
    chain' = SUBS.mapBy(s => { st: "none", next: 0, funded: false, poison: false, at: 0, fails: 0 }),
    ks' = SUBS.mapBy(s => { on: false, next: 0, retryAt: -1 }),
    cursor' = -1,
    lastDiscover' = 0,
    wake' = 0,
    lastFail' = SUBS.mapBy(s => NOFAIL),
    storm' = false,
  }

  // The keeper's timer fires: one pass (discover, then charge what's due), then schedule the next wake-up.
  action fire = {
    val doDisc = cursor < 0 or now - lastDiscover >= DISCOVER
    // Before the fix the discovery cursor follows the head, so a reorg can move a Subscribed log to a block at or
    // below it, where it's never scanned. After the fix it follows the finalized block: every discovery re-scans
    // the unfinalized range.
    val k1 = if (doDisc) logsIn(chain, cursor, now).fold(ks, (acc, s) => upsert(acc, chain, s)) else ks
    val c1 = if (doDisc) (if (FIXED) max(0, now - FDEPTH) else now) else cursor
    val p = ORDER.foldl({ chain: chain, ks: k1, lastFail: lastFail, storm: storm, aborted: false }, (acc, s) => chargeOne(now, acc, s))
    all {
      now == wake,
      chain' = p.chain,
      ks' = p.ks,
      cursor' = c1,
      lastDiscover' = if (doDisc) now else lastDiscover,
      wake' = nextWake(now, p.ks),
      lastFail' = p.lastFail,
      storm' = p.storm,
      // then time passes, up to the new wake-up (merging fire + tick keeps traces short for the model checker)
      nondet dt = 0.to(nextWake(now, p.ks) - now).oneOf()
      now' = now + dt,
    }
  }

  // Time passes, but never beyond the keeper's next wake-up (so timers can't be skipped).
  action tick = all {
    now < wake,
    nondet dt = 1.to(wake - now).oneOf()
    now' = now + dt,
    chain' = chain, ks' = ks, cursor' = cursor, lastDiscover' = lastDiscover, wake' = wake, lastFail' = lastFail, storm' = storm,
  }

  action envKeeperUnchanged = all {
    ks' = ks, cursor' = cursor, lastDiscover' = lastDiscover, wake' = wake, lastFail' = lastFail, storm' = storm, now' = now,
  }

  action subscribe = {
    nondet s = SUBS.oneOf()
    nondet funded = Bool.oneOf()
    nondet poison = Bool.oneOf()
    all {
      chain.get(s).st == "none",
      // The head block's logs are already fixed, so a new subscription lands in the next block.
      chain' = chain.set(s, { st: "live", next: now + 1 + INTERVAL, funded: funded, poison: POISON and poison, at: now + 1, fails: 0 }),
      envKeeperUnchanged,
    }
  }

  action cancelExternally = {
    nondet s = SUBS.oneOf()
    all { chain.get(s).st == "live", chain' = chain.set(s, { ...chain.get(s), st: "cancelled" }), envKeeperUnchanged }
  }

  action toggleFunding = {
    nondet s = SUBS.oneOf()
    all { chain.get(s).st == "live", chain' = chain.set(s, { ...chain.get(s), funded: not(chain.get(s).funded) }), envKeeperUnchanged }
  }

  // A reorg re-includes an unfinalized Subscribed log in a different (unfinalized) block.
  action reorg = {
    nondet s = SUBS.oneOf()
    nondet b = max(0, now - FDEPTH + 1).to(now).oneOf()
    all {
      REORGS,
      chain.get(s).st != "none",
      chain.get(s).at > now - FDEPTH,
      chain.get(s).at <= now,
      chain' = chain.set(s, { ...chain.get(s), at: b }),
      envKeeperUnchanged,
    }
  }

  action step = any { fire, tick, subscribe, cancelExternally, toggleFunding, reorg }

  // ---------- properties ----------

  // Bounded liveness: a live, funded, non-poisoned subscription is never left unpaid past its due time (or its
  // retry time after a failure) by more than SLACK.
  val noOverdue = SUBS.forall(s => {
    val c = chain.get(s)
    not(c.st == "live" and c.funded and not(c.poison) and now >= max(c.next, lastFail.get(s) + RETRY) + SLACK)
  })

  // No retry storm: a subscription whose charge just failed (or threw) isn't tried again before the backoff.
  val noStorm = not(storm)

  // The keeper's copy of a schedule is never ahead of the chain, so it can't skip a due charge.
  val copyNotAhead = SUBS.forall(s => ks.get(s).on implies ks.get(s).next <= chain.get(s).next)

  // There is always a pending wake-up.
  val wakeAhead = wake >= now

  val safety = noOverdue and noStorm and copyNotAhead and wakeAhead
}

// keeper.ts before the fix, with each fault on its own, and the fixed keeper with every fault at once.
module keeperBuggyPoison { import keeper(FIXED = false, REORGS = false, POISON = true).* }
module keeperBuggyReorg { import keeper(FIXED = false, REORGS = true, POISON = false).* }
module keeperFixed { import keeper(FIXED = true, REORGS = true, POISON = true).* }
