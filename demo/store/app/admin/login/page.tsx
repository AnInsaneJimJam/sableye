import { adminConfigured } from '@/lib/admin-auth'
import { login } from './actions'

export const dynamic = 'force-dynamic'

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="narrow">
      <h1>Merchant sign-in</h1>
      {adminConfigured() ? (
        <form action={login} className="row">
          <input name="password" type="password" placeholder="Password" autoComplete="current-password" required autoFocus />
          <button className="primary">Sign in</button>
        </form>
      ) : (
        <p>The dashboard is locked. Set <code>ADMIN_PASSWORD</code> in <code>.env</code> and restart the server.</p>
      )}
      {error && <p className="bad">Wrong password.</p>}
    </main>
  )
}
