// Password gate for the merchant dashboard. Fails closed: with no ADMIN_PASSWORD set, nobody gets in.
// Server actions can be called directly, so every action checks requireAdmin() itself; a page check isn't enough.
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BASE_URL } from './sableye'

const COOKIE = 'sableye_admin'

/** The session cookie value. Derived from the password, so changing the password signs everyone out. */
const hmac = (password: string, message: string) => createHmac('sha256', password).update(message).digest()
const sessionToken = (password: string) => hmac(password, 'sableye-admin-session').toString('hex')

const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD)

export function passwordMatches(attempt: string): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false
  // Compare fixed-length digests so the check doesn't reveal the password's length.
  return safeEqual(hmac(password, attempt), hmac(password, password))
}

export async function startAdminSession(): Promise<void> {
  ;(await cookies()).set(COOKIE, sessionToken(process.env.ADMIN_PASSWORD!), {
    httpOnly: true, sameSite: 'lax', secure: BASE_URL.startsWith('https://'), path: '/', maxAge: 60 * 60 * 24,
  })
}

export async function isAdmin(): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD
  const cookie = (await cookies()).get(COOKIE)?.value
  if (!password || !cookie) return false
  return safeEqual(Buffer.from(cookie), Buffer.from(sessionToken(password)))
}

/** Sends anyone who isn't signed in to the login page. Call first in every admin page and server action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login')
}
