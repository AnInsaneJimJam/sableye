'use server'
import { redirect } from 'next/navigation'
import { passwordMatches, startAdminSession } from '@/lib/admin-auth'

export async function login(form: FormData) {
  if (!passwordMatches(String(form.get('password') ?? ''))) {
    await new Promise((r) => setTimeout(r, 500)) // slows down guessing
    redirect('/admin/login?error=1')
  }
  await startAdminSession()
  redirect('/admin')
}
