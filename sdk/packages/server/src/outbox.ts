// A small persisted job queue for side effects that must never block or break a payment: emails, Arkiv writes.
// Each job has a key, so enqueueing the same thing twice (a replayed event, a reorg) does nothing. Failed jobs are
// retried with backoff, and a handler that throws is recorded, never re-thrown into the caller.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Job {
  key: string
  kind: string
  payload: unknown
  attempts: number
  /** Unix ms. */
  nextAt: number
  createdAt: number
  status: 'pending' | 'done' | 'failed'
  error?: string
}

export type JobHandler = (payload: unknown, job: Job) => Promise<void>

/** Seconds between attempts: 5 s … 6 h, then give up. */
export const OUTBOX_RETRY_DELAYS = [5, 30, 120, 600, 1800, 3600, 10_800, 21_600]

export interface OutboxOptions {
  /** Persist to this JSON file. Default: in memory (lost on restart). */
  path?: string
  /** How often to look for due jobs. Default 2000 ms. 0: only when `drain()` is called. */
  pollMs?: number
  retryDelays?: number[]
  /** Keep at most this many finished jobs (for the log). Default 500. */
  keepDone?: number
}

export interface Outbox {
  /** Queue a job unless one with this key exists. Returns false if it was a duplicate. */
  enqueue(kind: string, key: string, payload: unknown): boolean
  /** Run every due job now. Never throws. */
  drain(): Promise<void>
  /** Register the function that runs jobs of `kind`. */
  handle(kind: string, handler: JobHandler): void
  /** Every job, newest first. */
  jobs(kind?: string): Job[]
  stop(): void
}

export function createOutbox(opts: OutboxOptions = {}): Outbox {
  const delays = opts.retryDelays ?? OUTBOX_RETRY_DELAYS
  const keepDone = opts.keepDone ?? 500
  const handlers = new Map<string, JobHandler>()
  let jobs: Job[] = []
  if (opts.path) {
    try {
      jobs = JSON.parse(readFileSync(opts.path, 'utf8')) as Job[]
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  const save = () => {
    const finished = jobs.filter((j) => j.status !== 'pending')
    if (finished.length > keepDone) {
      const drop = new Set(finished.sort((a, b) => a.createdAt - b.createdAt).slice(0, finished.length - keepDone))
      jobs = jobs.filter((j) => !drop.has(j))
    }
    if (!opts.path) return
    mkdirSync(dirname(opts.path), { recursive: true })
    writeFileSync(`${opts.path}.tmp`, JSON.stringify(jobs))
    renameSync(`${opts.path}.tmp`, opts.path)
  }

  let draining: Promise<void> | undefined
  const runDue = async () => {
    for (const job of jobs) {
      if (job.status !== 'pending' || job.nextAt > Date.now()) continue
      const handler = handlers.get(job.kind)
      if (!handler) continue
      job.attempts++
      try {
        await handler(job.payload, job)
        job.status = 'done'
        job.error = undefined
      } catch (e) {
        job.error = e instanceof Error ? e.message : String(e)
        if (job.attempts > delays.length) job.status = 'failed'
        else job.nextAt = Date.now() + delays[job.attempts - 1]! * 1000
      }
      save()
    }
  }
  const drain = () => (draining ??= runDue().catch(() => {}).finally(() => (draining = undefined)))

  const timer = opts.pollMs === 0 ? undefined : setInterval(() => void drain(), opts.pollMs ?? 2000)
  timer?.unref?.()

  return {
    enqueue(kind, key, payload) {
      if (jobs.some((j) => j.key === key)) return false
      jobs.push({ key, kind, payload, attempts: 0, nextAt: 0, createdAt: Date.now(), status: 'pending' })
      save()
      void drain()
      return true
    },
    drain,
    handle: (kind, handler) => void handlers.set(kind, handler),
    jobs: (kind) => jobs.filter((j) => !kind || j.kind === kind).sort((a, b) => b.createdAt - a.createdAt),
    stop: () => clearInterval(timer),
  }
}
