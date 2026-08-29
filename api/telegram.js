import axios from 'axios';

const START_CAPTION = `🛍️ SOFT STORE

Bem-vindo à SOFT Store.

Escolha uma opção abaixo:`;

const BANNER_URL = 'https://soft-store-bot.vercel.app/assets/banner.png';

const START_KEYBOARD = {
  inline_keyboard: [
    [{ text: '🛒 Produtos', callback_data: 'produtos' }],
    [{ text: '📦 Meus pedidos', callback_data: 'pedidos' }],
    [{ text: '💬 Suporte', callback_data: 'suporte' }],
  ],
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'SOFT Store Bot está online.',
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const chatId = req.body?.message?.chat?.id;
  const text = req.body?.message?.text;

  if (!chatId) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (typeof text !== 'string' || !/^\/start(?:\s|$)/i.test(text.trim())) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN não está configurada.');
    return res.status(200).json({ ok: false, error: 'Bot não configurado.' });
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      {
        chat_id: chatId,
        photo: BANNER_URL,
        caption: START_CAPTION,
        reply_markup: START_KEYBOARD,
      },
      { timeout: 10_000 },
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error.response?.status;
    const description = error.response?.data?.description;

    console.error('Falha ao responder ao webhook do Telegram.', {
      status,
      description,
    });

    return res.status(200).json({ ok: false, error: 'Falha ao enviar mensagem.' });
  }
}
