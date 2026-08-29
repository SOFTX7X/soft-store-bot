import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_TOLERANCE_SECONDS = 300;

function json(body, status = 200) {
  return Response.json(body, { status });
}

function parseSignature(value) {
  if (typeof value !== 'string') return null;

  const parts = Object.fromEntries(
    value.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    }),
  );

  if (!/^\d+$/.test(parts.t ?? '') || !/^[a-f0-9]{64}$/i.test(parts.v1 ?? '')) {
    return null;
  }

  return { timestamp: Number(parts.t), signature: parts.v1.toLowerCase() };
}

function signaturesMatch(expected, received) {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(received, 'hex');

  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Método não permitido.' }, 405);
    }

    const webhookSecret = process.env.BRAVOPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return json({ ok: false, error: 'Webhook não configurado.' }, 503);
    }

    const signatureHeader = request.headers.get('BravoPay-Signature')
      ?? request.headers.get('X-Bravopay-Signature');
    const parsedSignature = parseSignature(signatureHeader);

    if (!parsedSignature) {
      return json({ ok: false, error: 'Assinatura inválida.' }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsedSignature.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
      return json({ ok: false, error: 'Assinatura expirada.' }, 401);
    }

    const rawBody = await request.text();
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(`${parsedSignature.timestamp}.${rawBody}`)
      .digest('hex');

    if (!signaturesMatch(expectedSignature, parsedSignature.signature)) {
      return json({ ok: false, error: 'Assinatura inválida.' }, 401);
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, error: 'Payload inválido.' }, 400);
    }

    if (typeof event?.id !== 'string' || typeof event?.type !== 'string') {
      return json({ ok: false, error: 'Evento inválido.' }, 400);
    }

    if (event.type === 'transaction.paid') {
      const transaction = event.data;

      if (typeof transaction?.id !== 'string' || typeof transaction?.external_reference !== 'string') {
        return json({ ok: false, error: 'Transação inválida.' }, 400);
      }

      // O pagamento foi autenticado. A entrega do produto será implementada depois.
      return json({
        ok: true,
        received: true,
        event_type: event.type,
        product_delivery: 'pending_implementation',
      });
    }

    return json({ ok: true, received: true, ignored: true });
  },
};
