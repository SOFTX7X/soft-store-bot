import crypto from 'node:crypto';
import axios from 'axios';

const PRODUCTS = {
  viralflix: {
    id: 'viralflix',
    name: 'VIRALFLIX',
    priceCents: 500,
    deliveryUrl: 'https://drive.google.com/file/d/1j8EJL_OjCmkgA8AjZzc0D6_pK4Y3qB9G/view?usp=drivesdk',
  },
  stories: {
    id: 'stories',
    name: 'STORIES CRIATIVOS',
    priceCents: 800,
    deliveryUrl: 'https://drive.google.com/drive/folders/1w8KVWYMOswsujwfO0WZuSeGiD5vPik7X',
  },
};

export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.setEncoding('utf8');

    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verify(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header.split(',').map(part => {
      const i = part.indexOf('=');
      return [part.slice(0, i), part.slice(i + 1)];
    })
  );

  const timestamp = Number(parts.t);
  const signature = parts.v1;

  if (
    !timestamp ||
    !signature ||
    Math.abs(Date.now() / 1000 - timestamp) > toleranceSec
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  if (expected.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

function parseReference(ref = '') {
  const [store, productId, chatId, timestamp, ...extra] = String(ref).split(':');

  if (
    store !== 'softstore' ||
    !Object.hasOwn(PRODUCTS, productId) ||
    !/^-?\d+$/.test(chatId || '') ||
    !/^\d+$/.test(timestamp || '') ||
    extra.length
  ) {
    return null;
  }

  return {
    productId,
    chatId,
  };
}

async function deliver(token, chatId, transactionId, product) {
  await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      chat_id: chatId,
      disable_web_page_preview: true,
      text: `✅ PAGAMENTO APROVADO

🎬 ${product.name}
Acesso vitalício

📦 Seu acesso:
${product.deliveryUrl}

Obrigado pela compra!`,
    },
    {
      timeout: 10000,
      headers: {
        'X-SoftStore-Transaction': transactionId || '',
      },
    }
  );
}

async function deletePaymentMessage(token, chatId, messageId) {
  if (!/^\d+$/.test(String(messageId || ''))) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/deleteMessage`,
      {
        chat_id: chatId,
        message_id: Number(messageId),
      },
      { timeout: 10000 }
    );
  } catch (error) {
    console.error(
      'Falha ao excluir mensagem PIX após entrega',
      error.response?.data || error.message
    );
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      webhook: 'BravoPay',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
    });
  }

  try {
    const rawBody = await readRawBody(req);

    const secret = process.env.BRAVOPAY_WEBHOOK_SECRET;

    const signature =
      req.headers['bravopay-signature'] ||
      req.headers['x-bravopay-signature'];

    if (!verify(rawBody, signature, secret)) {
      return res.status(401).json({
        ok: false,
        error: 'Assinatura inválida.',
      });
    }

    const event = JSON.parse(rawBody);

    if (event?.type !== 'transaction.paid') {
      return res.status(200).json({
        ok: true,
        ignored: true,
      });
    }

    const tx = event.data || {};

    const ref = parseReference(tx.external_reference);
    const metadataProductId = tx.metadata?.product_id;
    const metadataChatId = String(tx.metadata?.telegram_chat_id || '');
    const product = Object.hasOwn(PRODUCTS, metadataProductId)
      ? PRODUCTS[metadataProductId]
      : null;

    if (
      !ref ||
      !product ||
      ref.productId !== product.id ||
      ref.chatId !== metadataChatId ||
      Number(tx.amount_cents) !== product.priceCents ||
      String(tx.status).toUpperCase() !== 'PAID'
    ) {
      return res.status(200).json({
        ok: true,
        ignored: true,
      });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN não configurada');
    }

    await deliver(
      token,
      ref.chatId,
      tx.id,
      product
    );

    await deletePaymentMessage(
      token,
      ref.chatId,
      tx.metadata?.payment_message_id
    );

    return res.status(200).json({
      ok: true,
      delivered: true,
    });
  } catch (error) {
    console.error(
      'BravoPay webhook error',
      error.response?.data || error.message
    );

    return res.status(500).json({
      ok: false,
    });
  }
}
