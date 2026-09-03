import axios from 'axios';

const PRODUCTS = {
  viralflix: {
    id: 'viralflix',
    name: 'VIRALFLIX',
    priceCents: 500,
    summary: '+ de 50.000 cortes virais',
    deliveryUrl: 'https://drive.google.com/file/d/1j8EJL_OjCmkgA8AjZzc0D6_pK4Y3qB9G/view?usp=drivesdk',
  },
  stories: {
    id: 'stories',
    name: 'STORIES CRIATIVOS',
    priceCents: 800,
    summary: 'Conteúdos criativos para seus stories',
    deliveryUrl: 'https://drive.google.com/drive/folders/1w8KVWYMOswsujwfO0WZuSeGiD5vPik7X',
  },
};

const BANNER_URL = 'https://soft-store-bot.vercel.app/assets/banner.png';
const BRAVOPAY_TRANSACTIONS_URL = 'https://bravopay.club/api/v1/transactions';
const SUPPORT_URL = 'https://t.me/softx7x';
const CHECK_CALLBACK_PREFIX = 'check:';

const START_CAPTION = `🛍️ SOFT STORE

Bem-vindo à SOFT Store.

Escolha uma opção abaixo:`;

const PRODUCTS_CAPTION = `🛒 PRODUTOS

Escolha o produto que deseja conhecer:`;

const START_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🛒 Produtos', callback_data: 'produtos' }],
    [{ text: '📦 Meus pedidos', callback_data: 'pedidos' }],
    [{ text: '💬 Suporte', url: SUPPORT_URL }],
  ],
};

const PRODUCTS_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🎬 VIRALFLIX — R$ 5,00', callback_data: 'produto:viralflix' }],
    [{ text: '🎨 STORIES CRIATIVOS — R$ 8,00', callback_data: 'produto:stories' }],
    [{ text: '⬅️ Voltar', callback_data: 'inicio' }],
  ],
};

const BACK_KEYBOARD = {
  inline_keyboard: [
    [{ text: '⬅️ Voltar', callback_data: 'inicio' }],
  ],
};

const tg = (token, method) =>
  `https://api.telegram.org/bot${token}/${method}`;

async function answerCallback(token, id, text, showAlert = false) {
  const body = {
    callback_query_id: id,
  };

  if (text) body.text = text;
  if (showAlert) body.show_alert = true;

  await axios.post(
    tg(token, 'answerCallbackQuery'),
    body,
    { timeout: 10000 }
  );
}

async function editCaption(
  token,
  chatId,
  messageId,
  caption,
  replyMarkup
) {
  await axios.post(
    tg(token, 'editMessageCaption'),
    {
      chat_id: chatId,
      message_id: messageId,
      caption,
      reply_markup: replyMarkup,
    },
    { timeout: 10000 }
  );
}

async function sendStart(token, chatId) {
  await axios.post(
    tg(token, 'sendPhoto'),
    {
      chat_id: chatId,
      photo: BANNER_URL,
      caption: START_CAPTION,
      reply_markup: START_KEYBOARD,
    },
    { timeout: 10000 }
  );
}

function formatPrice(priceCents) {
  return `R$ ${(priceCents / 100).toFixed(2).replace('.', ',')}`;
}

function getProduct(productId) {
  return Object.hasOwn(PRODUCTS, productId) ? PRODUCTS[productId] : null;
}

function makeReference(product, chatId) {
  return `softstore:${product.id}:${chatId}:${Date.now()}`;
}

function makeProductCaption(product) {
  return `🎬 ${product.name}

${product.summary}
Acesso vitalício

💰 ${formatPrice(product.priceCents)}`;
}

function makeProductKeyboard(product) {
  return {
    inline_keyboard: [
      [{
        text: `🛒 Comprar por ${formatPrice(product.priceCents)}`,
        callback_data: `comprar:${product.id}`,
      }],
      [{ text: '📖 COMO FUNCIONA', callback_data: `como:${product.id}` }],
      [{ text: '⬅️ Voltar', callback_data: 'produtos' }],
    ],
  };
}

function makeHowItWorksCaption(product) {
  return `📖 COMO FUNCIONA

${product.name} oferece ${product.summary.toLowerCase()} com acesso vitalício.

1. Toque em “Comprar por ${formatPrice(product.priceCents)}”.
2. Pague com o PIX Copia e Cola gerado.
3. Após a aprovação, o acesso será enviado automaticamente neste chat.

Se preferir, use “🔎 ANALISAR PEDIDO” para consultar a confirmação do pagamento.`;
}

async function createPix(product, chatId, from) {
  const apiKey = process.env.BRAVOPAY_API_KEY;

  if (!apiKey) {
    throw new Error('BRAVOPAY_API_KEY não configurada');
  }

  const name =
    [from?.first_name, from?.last_name]
      .filter(Boolean)
      .join(' ') || `Telegram ${chatId}`;

  const email = `telegram${chatId}@softstore.local`;

  const externalReference = makeReference(product, chatId);

  const { data } = await axios.post(
    BRAVOPAY_TRANSACTIONS_URL,
    {
      amount_cents: product.priceCents,
      method: 'pix',

      customer: {
        name,
        email,
      },

      description: `${product.name} - acesso vitalício`,

      external_reference: externalReference,

      metadata: {
        telegram_chat_id: String(chatId),
        product_id: product.id,
      },

      expires_in: 3600,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': externalReference,
      },

      timeout: 15000,
    }
  );

  if (!data?.pix?.copy_paste) {
    throw new Error(
      'BravoPay não retornou o PIX copia e cola'
    );
  }

  return data;
}

function parseReference(value = '') {
  const [store, productId, chatId, timestamp, ...extra] = String(value).split(':');

  if (
    store !== 'softstore' ||
    !getProduct(productId) ||
    !/^-?\d+$/.test(chatId || '') ||
    !/^\d+$/.test(timestamp || '') ||
    extra.length
  ) {
    return null;
  }

  return { productId, chatId };
}

function getOwnedProduct(tx, transactionId, chatId) {
  const reference = parseReference(tx?.external_reference);
  const product = getProduct(tx?.metadata?.product_id);

  const valid = (
    product &&
    String(tx?.id || '') === transactionId &&
    Number(tx?.amount_cents) === product.priceCents &&
    String(tx?.method || '').toUpperCase() === 'PIX' &&
    String(tx?.metadata?.telegram_chat_id || '') === String(chatId) &&
    reference?.productId === product.id &&
    reference?.chatId === String(chatId)
  );

  return valid ? product : null;
}

function makePaymentKeyboard(pix, transactionId) {
  const callbackData = `${CHECK_CALLBACK_PREFIX}${transactionId}`;

  if (Buffer.byteLength(callbackData, 'utf8') > 64) {
    throw new Error('ID da transação excede o limite do callback do Telegram');
  }

  const rows = [];

  if (typeof pix === 'string' && pix.length >= 1 && pix.length <= 256) {
    rows.push([{
      text: '📋 COPIAR CHAVE PIX',
      copy_text: { text: pix },
    }]);
  }

  rows.push([{
    text: '🔎 ANALISAR PEDIDO',
    callback_data: callbackData,
  }]);

  return { inline_keyboard: rows };
}

async function getTransaction(transactionId) {
  const apiKey = process.env.BRAVOPAY_API_KEY;

  if (!apiKey) {
    throw new Error('BRAVOPAY_API_KEY não configurada');
  }

  const { data } = await axios.get(
    `${BRAVOPAY_TRANSACTIONS_URL}/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 15000,
    }
  );

  return data?.data ?? data;
}

async function sendMessage(token, chatId, text, replyMarkup) {
  const body = {
    chat_id: chatId,
    disable_web_page_preview: true,
    text,
  };

  if (replyMarkup) body.reply_markup = replyMarkup;

  await axios.post(tg(token, 'sendMessage'), body, { timeout: 10000 });
}

async function removeAnalyzeButton(token, chatId, messageId, pix) {
  const inlineKeyboard = [];

  if (typeof pix === 'string' && pix.length >= 1 && pix.length <= 256) {
    inlineKeyboard.push([{
      text: '📋 COPIAR CHAVE PIX',
      copy_text: { text: pix },
    }]);
  }

  await axios.post(
    tg(token, 'editMessageReplyMarkup'),
    {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: inlineKeyboard },
    },
    { timeout: 10000 }
  );
}

async function analyzeOrder(token, q, transactionId) {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  await answerCallback(token, q.id, 'Analisando pagamento...');

  let tx;

  try {
    tx = await getTransaction(transactionId);
  } catch (error) {
    console.error(
      'Falha ao consultar transação na BravoPay',
      error.response?.data || error.message
    );

    await sendMessage(
      token,
      chatId,
      `⚠️ NÃO FOI POSSÍVEL ANALISAR

Não conseguimos consultar o pagamento agora. Aguarde alguns segundos e toque novamente em “🔎 ANALISAR PEDIDO”.`
    );
    return;
  }

  const product = getOwnedProduct(tx, transactionId, chatId);

  if (!product) {
    await sendMessage(
      token,
      chatId,
      `🔒 PEDIDO NÃO VALIDADO

Não foi possível confirmar que esta cobrança pertence a este chat e ao produto comprado. Nenhum acesso foi liberado.`
    );
    return;
  }

  const status = String(tx.status || '').toUpperCase();

  if (status === 'PAID' || status === 'APPROVED') {
    try {
      await removeAnalyzeButton(token, chatId, messageId, tx.pix?.copy_paste);
    } catch (error) {
      console.error('Falha ao remover botão de análise', error.response?.data || error.message);
    }

    await sendMessage(
      token,
      chatId,
      `✅ PAGAMENTO APROVADO

🎬 ${product.name}
Acesso vitalício

📦 Seu acesso:
${product.deliveryUrl}

Obrigado pela compra!`
    );
    return;
  }

  if (status === 'PENDING' || status === 'PROCESSING' || status === 'WAITING_PAYMENT') {
    await sendMessage(
      token,
      chatId,
      `⏳ PAGAMENTO PENDENTE

Ainda não identificamos a confirmação deste PIX.

Se você acabou de pagar, aguarde alguns segundos e toque novamente em:

🔎 ANALISAR PEDIDO`
    );
    return;
  }

  if (status === 'EXPIRED') {
    await sendMessage(
      token,
      chatId,
      `⌛ PIX EXPIRADO

Esta cobrança não está mais disponível.`,
      {
        inline_keyboard: [[{
          text: '🔄 GERAR NOVO PIX',
          callback_data: `comprar:${product.id}`,
        }]],
      }
    );
    return;
  }

  const statusMessages = {
    CANCELED: 'Esta cobrança foi cancelada.',
    CANCELLED: 'Esta cobrança foi cancelada.',
    FAILED: 'Não foi possível concluir este pagamento.',
    REFUNDED: 'Este pagamento foi reembolsado.',
    CHARGEBACK: 'Este pagamento foi contestado e estornado.',
  };

  await sendMessage(
    token,
    chatId,
    `❌ PAGAMENTO NÃO APROVADO

${statusMessages[status] || 'O pagamento não está aprovado.'}

Status informado: ${status || 'DESCONHECIDO'}

Nenhum acesso foi liberado.`
  );
}

async function handleCallback(token, q) {
  const id = q.id;
  const data = q.data;

  const chatId = q.message?.chat?.id;
  const messageId = q.message?.message_id;

  if (!id || !chatId || !messageId) return;

  if (data === 'produtos') {
    await answerCallback(token, id);

    return editCaption(
      token,
      chatId,
      messageId,
      PRODUCTS_CAPTION,
      PRODUCTS_KEYBOARD
    );
  }

  if (typeof data === 'string' && data.startsWith('produto:')) {
    const product = getProduct(data.slice('produto:'.length));

    if (!product) {
      return answerCallback(token, id, 'Produto não encontrado.', true);
    }

    await answerCallback(token, id);

    return editCaption(
      token,
      chatId,
      messageId,
      makeProductCaption(product),
      makeProductKeyboard(product)
    );
  }

  if (data === 'pedidos') {
    await answerCallback(token, id);

    return editCaption(
      token,
      chatId,
      messageId,
      `📦 MEUS PEDIDOS

As compras aprovadas são entregues automaticamente neste chat.`,
      BACK_KEYBOARD
    );
  }

  if (data === 'suporte') {
    await answerCallback(token, id);

    return sendMessage(
      token,
      chatId,
      `💬 SUPORTE

Fale diretamente com nosso atendimento:
${SUPPORT_URL}`
    );
  }

  if (typeof data === 'string' && data.startsWith('como:')) {
    const product = getProduct(data.slice('como:'.length));

    if (!product) {
      return answerCallback(token, id, 'Produto não encontrado.', true);
    }

    await answerCallback(token, id);

    return editCaption(
      token,
      chatId,
      messageId,
      makeHowItWorksCaption(product),
      {
        inline_keyboard: [[{
          text: '⬅️ Voltar',
          callback_data: `produto:${product.id}`,
        }]],
      }
    );
  }

  if (data === 'inicio') {
    await answerCallback(token, id);

    return editCaption(
      token,
      chatId,
      messageId,
      START_CAPTION,
      START_KEYBOARD
    );
  }

  if (data === 'comprar_viralflix' || (typeof data === 'string' && data.startsWith('comprar:'))) {
    const productId = data === 'comprar_viralflix'
      ? 'viralflix'
      : data.slice('comprar:'.length);
    const product = getProduct(productId);

    if (!product) {
      return answerCallback(token, id, 'Produto não encontrado.', true);
    }

    await answerCallback(
      token,
      id,
      'Gerando seu PIX...'
    );

    const tx = await createPix(product, chatId, q.from);
    const pix = tx.pix.copy_paste;

    if (typeof tx.id !== 'string' || !tx.id) {
      throw new Error('BravoPay não retornou o ID da transação');
    }

    await axios.post(
      tg(token, 'sendMessage'),
      {
        chat_id: chatId,
        parse_mode: 'HTML',

        text: `💳 <b>PAGAMENTO PIX</b>

🎬 Produto: <b>${product.name}</b>
💰 Valor: <b>${formatPrice(product.priceCents)}</b>

Realize o pagamento utilizando o PIX Copia e Cola.

<code>${escapeHtml(pix)}</code>

⏳ Após o pagamento ser aprovado, o acesso será enviado automaticamente aqui.`,
        reply_markup: makePaymentKeyboard(pix, tx.id),
      },
      { timeout: 10000 }
    );

    return;
  }

  if (typeof data === 'string' && data.startsWith(CHECK_CALLBACK_PREFIX)) {
    const transactionId = data.slice(CHECK_CALLBACK_PREFIX.length);

    if (!/^[a-zA-Z0-9_-]{1,58}$/.test(transactionId)) {
      return answerCallback(token, id, 'Pedido inválido.', true);
    }

    return analyzeOrder(token, q, transactionId);
  }

  await answerCallback(
    token,
    id,
    'Opção não reconhecida.'
  );
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'SOFT Store Bot está online.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
    });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(200).json({
      ok: false,
      error: 'Bot não configurado.',
    });
  }

  try {
    if (req.body?.callback_query) {
      await handleCallback(
        token,
        req.body.callback_query
      );

      return res.status(200).json({
        ok: true,
      });
    }

    const chatId = req.body?.message?.chat?.id;
    const text = req.body?.message?.text;

    if (
      chatId &&
      typeof text === 'string' &&
      /^\/start(?:\s|$)/i.test(text.trim())
    ) {
      await sendStart(token, chatId);
    }

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error(
      'SOFT Store Telegram error',
      error.response?.data || error.message
    );

    return res.status(200).json({
      ok: false,
      error: 'Falha ao processar.',
    });
  }
        }
