import axios from 'axios';

const PRODUCT = {
  id: 'viralflix',
  name: 'VIRALFLIX',
  priceCents: 100,
  deliveryUrl: 'https://drive.google.com/file/d/1j8EJL_OjCmkgA8AjZzc0D6_pK4Y3qB9G/view?usp=drivesdk',
};

const BANNER_URL = 'https://soft-store-bot.vercel.app/assets/banner.png';

const START_CAPTION = `🛍️ SOFT STORE

Bem-vindo à SOFT Store.

Escolha uma opção abaixo:`;

const PRODUCT_CAPTION = `🎬 VIRALFLIX

+ de 50.000 cortes virais
Acesso vitalício

💰 R$ 1,00`;

const SUPPORT_CAPTION = `💬 SUPORTE

Envie sua mensagem aqui no chat para continuar o atendimento.`;

const START_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🛒 Produtos', callback_data: 'produtos' }],
    [{ text: '📦 Meus pedidos', callback_data: 'pedidos' }],
    [{ text: '💬 Suporte', callback_data: 'suporte' }],
  ],
};

const PRODUCT_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🛒 Comprar por R$ 1,00', callback_data: 'comprar_viralflix' }],
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

function makeReference(chatId) {
  return `softstore:${PRODUCT.id}:${chatId}:${Date.now()}`;
}

async function createPix(chatId, from) {
  const apiKey = process.env.BRAVOPAY_API_KEY;

  if (!apiKey) {
    throw new Error('BRAVOPAY_API_KEY não configurada');
  }

  const name =
    [from?.first_name, from?.last_name]
      .filter(Boolean)
      .join(' ') || `Telegram ${chatId}`;

  const email = `telegram${chatId}@softstore.local`;

  const externalReference = makeReference(chatId);

  const { data } = await axios.post(
    'https://bravopay.club/api/v1/transactions',
    {
      amount_cents: PRODUCT.priceCents,
      method: 'pix',

      customer: {
        name,
        email,
      },

      description: `${PRODUCT.name} - acesso vitalício`,

      external_reference: externalReference,

      metadata: {
        telegram_chat_id: String(chatId),
        product_id: PRODUCT.id,
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
      PRODUCT_CAPTION,
      PRODUCT_KEYBOARD
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

    return editCaption(
      token,
      chatId,
      messageId,
      SUPPORT_CAPTION,
      BACK_KEYBOARD
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

  if (data === 'comprar_viralflix') {
    await answerCallback(
      token,
      id,
      'Gerando seu PIX...'
    );

    const tx = await createPix(chatId, q.from);

    const pix = tx.pix.copy_paste;

    await axios.post(
      tg(token, 'sendMessage'),
      {
        chat_id: chatId,
        parse_mode: 'HTML',

        text: `💳 <b>${PRODUCT.name} — R$ 1,00</b>

PIX copia e cola:

<code>${escapeHtml(pix)}</code>

⏳ Após o pagamento ser aprovado, o acesso será enviado automaticamente aqui.`,
      },
      { timeout: 10000 }
    );

    return;
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

    const chatId =
      req.body?.message?.chat?.id;

    const text =
      req.body?.message?.text;

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
