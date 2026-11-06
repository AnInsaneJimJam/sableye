import type { ReactNode } from 'react'

export const metadata = { title: 'My store' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
