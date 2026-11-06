'use client'
import { useState } from 'react'
import { products } from './products'

export default function Shop() {
  const [message, setMessage] = useState('')
  async function buy(id: string) {
    // TODO: real payments. For now the order is "paid" immediately.
    const res = await fetch('/api/order', { method: 'POST', body: JSON.stringify({ id }) })
    const order = await res.json()
    setMessage(`Order ${order.id} paid (simulated).`)
  }
  return (
    <main>
      <h1>Corner Coffee</h1>
      {products.map((p) => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid #ddd' }}>
          <span>{p.name}</span>
          <span>{p.price} USDT <button onClick={() => buy(p.id)}>Buy</button></span>
        </div>
      ))}
      {message && <p>{message}</p>}
    </main>
  )
}
