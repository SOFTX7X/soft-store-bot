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

const BRAVOPAY_TRANSACTIONS_URL = 'https://bravopay.club/api/v1/transactions';
const CHECK_CALLBACK_PREFIX = 'check:';
const SUPPORT_PROMPT_MARKER = '📝 ATENDIMENTO SOFT STORE';
const BOT_COMMANDS = [
  { command: 'start', description: 'Abrir o menu principal' },
  { command: 'produtos', description: 'Ver produtos disponíveis' },
  { command: 'pedidos', description: 'Informações sobre pedidos' },
  { command: 'suporte', description: 'Falar com o suporte' },
];

const START_CAPTION = `🛍️ SOFT STORE

Bem-vindo à SOFT Store.

Escolha uma opção abaixo:`;

const PRODUCTS_CAPTION = `🛒 PRODUTOS

Escolha o produto que deseja conhecer:`;

const START_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🛒 Produtos', callback_data: 'produtos' }],
    [{ text: '📦 Meus pedidos', callback_data: 'pedidos' }],
    [{ text: '💬 Suporte', callback_data: 'suporte' }],
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

async function editMenuMessage(
  token,
  message,
  text,
  replyMarkup
) {
  const hasPhoto = Array.isArray(message?.photo) && message.photo.length > 0;

  await axios.post(
    tg(token, hasPhoto ? 'editMessageCaption' : 'editMessageText'),
    {
      chat_id: message.chat.id,
      message_id: message.message_id,
      [hasPhoto ? 'caption' : 'text']: text,
      reply_markup: replyMarkup,
    },
    { timeout: 10000 }
  );
}

async function sendStart(token, chatId) {
  await sendMessage(token, chatId, START_CAPTION, START_KEYBOARD);
}

async function requestSupportMessage(token, chatId) {
  const supportChatId = process.env.SUPPORT_CHAT_ID;

  if (!/^-?\d+$/.test(supportChatId || '')) {
    await sendMessage(
      token,
      chatId,
      `⚠️ O atendimento está temporariamente indisponível. Tente novamente mais tarde.`
    );
    return;
  }

  await axios.post(
    tg(token, 'sendMessage'),
    {
      chat_id: chatId,
      text: `${SUPPORT_PROMPT_MARKER}

Descreva sua situação em uma única mensagem e envie como resposta aqui. Nossa equipe receberá seu atendimento.`,
      reply_markup: {
        force_reply: true,
        selective: true,
        input_field_placeholder: 'Descreva sua situação...',
      },
    },
    { timeout: 10000 }
  );
}

async function forwardSupportMessage(token, message) {
  const supportChatId = process.env.SUPPORT_CHAT_ID;

  if (!/^-?\d+$/.test(supportChatId || '')) {
    await sendMessage(
      token,
      message.chat.id,
      `⚠️ O atendimento está temporariamente indisponível. Tente novamente mais tarde.`
    );
    return;
  }

  const sender = message.from || {};
  const fullName = [sender.first_name, sender.last_name].filter(Boolean).join(' ') || 'Cliente';
  const username = sender.username ? `@${sender.username}` : 'não informado';

  await sendMessage(
    token,
    supportChatId,
    `🆕 NOVO ATENDIMENTO

👤 Cliente: ${fullName}
🔗 Usuário: ${username}
🆔 Telegram ID: ${sender.id || message.chat.id}`
  );

  await axios.post(
    tg(token, 'forwardMessage'),
    {
      chat_id: supportChatId,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
    },
    { timeout: 10000 }
  );

  await sendMessage(
    token,
    message.chat.id,
    `✅ MENSAGEM ENVIADA

Sua situação foi encaminhada ao suporte. Aguarde o retorno da nossa equipe.`
  );
}

function formatPrice(priceCents) {
  return `R$ ${(priceCents / 100).toFixed(2).replace('.', ',')}`;
}

async function configureMenu(token) {
  await Promise.all([
    axios.post(
      tg(token, 'setMyCommands'),
      { commands: BOT_COMMANDS },
      { timeout: 10000 }
    ),
    axios.post(
      tg(token, 'setChatMenuButton'),
      { menu_button: { type: 'commands' } },
      { timeout: 10000 }
    ),
  ]);
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

async function createPix(product, chatId, from, paymentMessageId) {
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
        payment_message_id: String(paymentMessageId),
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

  const { data } = await axios.post(
    tg(token, 'sendMessage'),
    body,
    { timeout: 10000 }
  );

  return data?.result;
}

async function deleteMessage(token, chatId, messageId) {
  await axios.post(
    tg(token, 'deleteMessage'),
    {
      chat_id: chatId,
      message_id: messageId,
    },
    { timeout: 10000 }
  );
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

    try {
      await deleteMessage(token, chatId, messageId);
    } catch (error) {
      console.error('Falha ao excluir mensagem PIX', error.response?.data || error.message);

      try {
        await removeAnalyzeButton(token, chatId, messageId, tx.pix?.copy_paste);
      } catch (editError) {
        console.error(
          'Falha ao remover botão de análise',
          editError.response?.data || editError.message
        );
      }
    }

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

    return editMenuMessage(
      token,
      q.message,
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

    return editMenuMessage(
      token,
      q.message,
      makeProductCaption(product),
      makeProductKeyboard(product)
    );
  }

  if (data === 'pedidos') {
    await answerCallback(token, id);

    return editMenuMessage(
      token,
      q.message,
      `📦 MEUS PEDIDOS

As compras aprovadas são entregues automaticamente neste chat.`,
      BACK_KEYBOARD
    );
  }

  if (data === 'suporte') {
    await answerCallback(token, id);

    return requestSupportMessage(token, chatId);
  }

  if (typeof data === 'string' && data.startsWith('como:')) {
    const product = getProduct(data.slice('como:'.length));

    if (!product) {
      return answerCallback(token, id, 'Produto não encontrado.', true);
    }

    await answerCallback(token, id);

    return editMenuMessage(
      token,
      q.message,
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

    return editMenuMessage(
      token,
      q.message,
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

    const paymentMessage = await sendMessage(
      token,
      chatId,
      `⏳ Gerando o PIX de ${product.name}...`
    );

    if (!paymentMessage?.message_id) {
      throw new Error('Telegram não retornou o ID da mensagem PIX');
    }

    try {
      const tx = await createPix(
        product,
        chatId,
        q.from,
        paymentMessage.message_id
      );
      const pix = tx.pix.copy_paste;

      if (typeof tx.id !== 'string' || !tx.id) {
        throw new Error('BravoPay não retornou o ID da transação');
      }

      await axios.post(
        tg(token, 'editMessageText'),
        {
          chat_id: chatId,
          message_id: paymentMessage.message_id,
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
    } catch (error) {
      try {
        await axios.post(
          tg(token, 'editMessageText'),
          {
            chat_id: chatId,
            message_id: paymentMessage.message_id,
            text: `⚠️ Não foi possível gerar o PIX agora. Tente novamente em alguns instantes.`,
            reply_markup: {
              inline_keyboard: [[{
                text: '🔄 TENTAR NOVAMENTE',
                callback_data: `comprar:${product.id}`,
              }]],
            },
          },
          { timeout: 10000 }
        );
      } catch (editError) {
        console.error('Falha ao atualizar erro do PIX', editError.response?.data || editError.message);
      }

      throw error;
    }

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
    const command = typeof text === 'string'
      ? text.trim().split(/\s+/)[0].toLowerCase().split('@')[0]
      : '';
    const repliedText = req.body?.message?.reply_to_message?.text;

    if (
      chatId &&
      typeof repliedText === 'string' &&
      repliedText.startsWith(SUPPORT_PROMPT_MARKER)
    ) {
      await forwardSupportMessage(token, req.body.message);

      return res.status(200).json({ ok: true });
    }

    if (chatId && (command === '/start' || command === '/menu')) {
      try {
        await configureMenu(token);
      } catch (error) {
        console.error('Falha ao configurar menu do bot', error.response?.data || error.message);
      }

      await sendStart(token, chatId);
    }

    if (chatId && command === '/produtos') {
      await sendMessage(token, chatId, PRODUCTS_CAPTION, PRODUCTS_KEYBOARD);
    }

    if (chatId && command === '/pedidos') {
      await sendMessage(
        token,
        chatId,
        `📦 MEUS PEDIDOS

As compras aprovadas são entregues automaticamente neste chat.`
      );
    }

    if (chatId && command === '/suporte') {
      await requestSupportMessage(token, chatId);
    }

    if (chatId && command === '/meuid') {
      await sendMessage(
        token,
        chatId,
        `🆔 ID deste chat: ${chatId}`
      );
    }

    if (
      chatId &&
      req.body?.message?.message_id &&
      ['/start', '/menu', '/produtos', '/pedidos', '/suporte'].includes(command)
    ) {
      try {
        await deleteMessage(token, chatId, req.body.message.message_id);
      } catch (error) {
        console.error('Falha ao remover comando do menu', error.response?.data || error.message);
      }
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
