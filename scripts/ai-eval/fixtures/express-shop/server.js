import express from 'express'

const app = express()
app.use(express.json())
app.use(express.static('public'))

const menu = { matcha: { name: 'Ceremonial matcha, 30 g', price: '18.00' }, sencha: { name: 'Sencha, 100 g', price: '7.50' } }
const orders = new Map()
let n = 1

app.get('/api/menu', (_req, res) => res.json(menu))
app.post('/api/orders', (req, res) => {
  const item = menu[req.body.item]
  if (!item) return res.status(404).json({ error: 'unknown item' })
  const order = { id: `T${n++}`, item: req.body.item, amount: item.price, status: 'unpaid' }
  orders.set(order.id, order)
  res.json(order)
})
// Placeholder until real payments: marks the order paid without charging anything.
app.post('/api/orders/:id/pay', (req, res) => {
  const order = orders.get(req.params.id)
  if (!order) return res.status(404).json({ error: 'unknown order' })
  order.status = 'paid'
  res.json(order)
})

app.listen(process.env.PORT || 3000, () => console.log('Tea house on http://localhost:3000'))
