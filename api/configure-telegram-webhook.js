import axios from 'axios';

const WEBHOOK_URL = 'https://soft-store-bot.vercel.app/api/telegram';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({ ok: false, error: 'Bot não configurado.' });
  }

  try {
    const telegram = axios.create({
      baseURL: `https://api.telegram.org/bot${token}`,
      timeout: 10_000,
    });

    const { data: setWebhook } = await telegram.post('/setWebhook', {
      url: WEBHOOK_URL,
    });

    const { data: webhookInfo } = await telegram.get('/getWebhookInfo');
    const info = webhookInfo.result ?? {};

    return res.status(setWebhook.ok && webhookInfo.ok ? 200 : 502).json({
      ok: webhookInfo.ok === true,
      set_webhook_ok: setWebhook.ok === true,
      url: info.url ?? null,
      pending_update_count: info.pending_update_count ?? null,
      last_error_message: info.last_error_message ?? null,
    });
  } catch (error) {
    console.error('Falha ao configurar o webhook do Telegram.', {
      status: error.response?.status,
      description: error.response?.data?.description,
    });

    return res.status(502).json({
      ok: false,
      error: 'Não foi possível configurar o webhook.',
    });
  }
}
