import axios from 'axios';
import { randomUUID } from 'node:crypto';

const BRAVOPAY_TRANSACTIONS_URL = 'https://bravopay.club/api/v1/transactions';
const MINIMUM_PIX_AMOUNT_CENTS = 500;

function parseAmountCents(body) {
  if (Number.isInteger(body?.amount_cents)) {
    return body.amount_cents;
  }

  const rawAmount = body?.amount ?? body?.valor;

  if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
    return Math.round(rawAmount * 100);
  }

  if (typeof rawAmount === 'string' && /^\d+(?:[.,]\d{1,2})?$/.test(rawAmount.trim())) {
    return Math.round(Number(rawAmount.trim().replace(',', '.')) * 100);
  }

  return null;
}

function parseOrderId(body) {
  const value = body?.order_id ?? body?.pedido_id ?? body?.orderId;
  return typeof value === 'string' ? value.trim() : '';
}

function createExternalReference(orderId) {
  const safeOrderId = orderId
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'pedido';

  return `soft_${safeOrderId}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const apiKey = process.env.BRAVOPAY_API_KEY;

  if (!apiKey) {
    return res.status(503).json({ ok: false, error: 'Pagamentos indisponíveis.' });
  }

  const amountCents = parseAmountCents(req.body);
  const orderId = parseOrderId(req.body);

  if (!Number.isInteger(amountCents) || amountCents < MINIMUM_PIX_AMOUNT_CENTS) {
    return res.status(400).json({
      ok: false,
      error: 'Informe um valor PIX válido de no mínimo R$ 5,00.',
    });
  }

  if (!orderId || orderId.length > 120) {
    return res.status(400).json({
      ok: false,
      error: 'Informe uma identificação de pedido válida.',
    });
  }

  const externalReference = createExternalReference(orderId);

  try {
    const { data: transaction } = await axios.post(
      BRAVOPAY_TRANSACTIONS_URL,
      {
        amount_cents: amountCents,
        method: 'pix',
        description: `Pedido ${orderId}`.slice(0, 300),
        external_reference: externalReference,
        metadata: { order_id: orderId },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': externalReference,
        },
        timeout: 15_000,
      },
    );

    return res.status(201).json({
      ok: true,
      transaction_id: transaction.id,
      status: transaction.status,
      pix_copy_paste: transaction.pix?.copy_paste ?? null,
      expires_at: transaction.pix?.expires_at ?? null,
      external_reference: externalReference,
    });
  } catch (error) {
    const providerStatus = error.response?.status;
    const providerCode = error.response?.data?.error?.code;

    console.error('Falha ao criar transação PIX na BravoPay.', {
      status: providerStatus,
      code: providerCode,
    });

    const responseStatus = Number.isInteger(providerStatus) && providerStatus >= 400 && providerStatus < 500
      ? providerStatus
      : 502;

    return res.status(responseStatus).json({
      ok: false,
      error: 'Não foi possível criar a cobrança PIX.',
      code: providerCode ?? 'bravopay_error',
    });
  }
}
