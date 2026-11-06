// Invoices live in the browser for this demo; payment is simulated.
const invoices = { 'LUM-204': { client: 'Harbor Bakery', project: 'Brand refresh', amount: '120.00', status: 'Open' }, 'LUM-203': { client: 'Kite Labs', project: 'Landing page', amount: '80.00', status: 'Paid' } }
let current
document.getElementById('find').onsubmit = (e) => {
  e.preventDefault()
  const ref = document.getElementById('ref').value.trim().toUpperCase()
  current = invoices[ref] && { ref, ...invoices[ref] }
  document.getElementById('invoice').hidden = !current
  if (!current) return alert('No such invoice')
  document.getElementById('title').textContent = `${ref} · ${current.client} · ${current.project}`
  document.getElementById('amount').textContent = `${current.amount} USDT · ${current.status}`
  document.getElementById('pay').hidden = current.status === 'Paid'
}
document.getElementById('pay').onclick = () => {
  invoices[current.ref].status = 'Paid'
  document.getElementById('status').textContent = 'Payment received (simulated). Thank you!'
  document.getElementById('pay').hidden = true
}
