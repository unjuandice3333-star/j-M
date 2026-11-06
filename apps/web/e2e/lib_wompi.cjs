// Firma eventos de Wompi como lo hace Wompi (SHA-256 de propiedades + timestamp + secreto de eventos LOCAL ficticio).
const crypto = require('crypto');
function signedEvent({ reference, amountInCents, status, txId, secret, timestamp = Math.floor(Date.now() / 1000) }) {
  const transaction = { id: txId, reference, amount_in_cents: amountInCents, currency: 'COP', status, payment_method_type: 'CARD', status_message: null };
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const concat = props.map((p) => String(transaction[p.split('.')[1]])).join('') + String(timestamp) + secret;
  return { event: 'transaction.updated', data: { transaction }, environment: 'test', timestamp,
    signature: { properties: props, checksum: crypto.createHash('sha256').update(concat).digest('hex') }, sent_at: new Date().toISOString() };
}
module.exports = { signedEvent };
