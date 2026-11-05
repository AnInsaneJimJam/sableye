import './globals.css'
import Link from 'next/link'

export const metadata = { title: 'Chai & Co. (Sableye demo)' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link href="/" className="brand">🍵 Chai &amp; Co.</Link>
          <nav>
            <Link href="/">Shop</Link>
            <Link href="/subscribe">Chai Club</Link>
            <Link href="/admin">Merchant dashboard</Link>
          </nav>
        </header>
        {children}
        <footer className="foot">Demo on Whitechain Sepolia · payments in test USDT · built with <b>Sableye</b></footer>
      </body>
    </html>
  )
}
