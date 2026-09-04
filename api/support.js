import crypto from 'node:crypto';
import axios from 'axios';

const CATEGORIES = {
  pagamento: 'Pagamento',
  entrega: 'Entrega do produto',
  produto: 'Dúvida sobre produto',
  outro: 'Outro assunto',
};

function validateInitData(initData, botToken) {
  if (typeof initData !== 'string' || !initData || initData.length > 10000) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));

  if (!/^[a-f0-9]{64}$/i.test(receivedHash || '') || !Number.isInteger(authDate)) return null;
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > 600) return null;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (expectedHash.length !== receivedHash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(receivedHash))) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  const allowedOrigin = 'https://s0ft.site';

  if (req.headers.origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const supportChatId = process.env.SUPPORT_CHAT_ID;

  if (!token || !/^-?\d+$/.test(supportChatId || '')) {
    return res.status(503).json({ ok: false, error: 'Atendimento indisponível.' });
  }

  const user = validateInitData(req.body?.initData, token);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Sessão do Telegram inválida ou expirada.' });
  }

  const category = CATEGORIES[req.body?.category];
  const orderId = cleanText(req.body?.orderId, 80);
  const message = cleanText(req.body?.message, 1500);

  if (!category || message.length < 10) {
    return res.status(400).json({ ok: false, error: 'Preencha corretamente a solicitação.' });
  }

  const fullName = cleanText([user.first_name, user.last_name].filter(Boolean).join(' '), 120) || 'Cliente';
  const username = user.username ? `@${cleanText(user.username, 64)}` : 'não informado';
  const ticketId = `${Date.now().toString(36).slice(-6)}${String(user.id).slice(-3)}`.toUpperCase();
  const api = `https://api.telegram.org/bot${token}`;

  try {
    await axios.post(
      `${api}/sendMessage`,
      {
        chat_id: supportChatId,
        text: `🆕 NOVO ATENDIMENTO #${ticketId}

👤 Cliente: ${fullName}
🔗 Usuário: ${username}
🆔 Telegram ID: ${user.id}
📌 Assunto: ${category}${orderId ? `\n🧾 Transação: ${orderId}` : ''}

📝 Situação:
${message}

↩️ Para responder como SOFT STORE, responda diretamente a esta ficha.`,
      },
      { timeout: 10000 }
    );

    await axios.post(
      `${api}/sendMessage`,
      {
        chat_id: user.id,
        text: `✅ ATENDIMENTO #${ticketId} ABERTO

Sua solicitação foi enviada à nossa equipe. A resposta aparecerá aqui pelo bot.`,
      },
      { timeout: 10000 }
    );

    return res.status(200).json({ ok: true, ticketId });
  } catch (error) {
    console.error('Mini App support error', error.response?.data || error.message);
    return res.status(502).json({ ok: false, error: 'Não foi possível enviar agora. Tente novamente.' });
  }
}
