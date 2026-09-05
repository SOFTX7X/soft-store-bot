import crypto from 'node:crypto';
import axios from 'axios';

const CATEGORIES = {
  pagamento: 'Pagamento',
  entrega: 'Entrega do produto',
  produto: 'Dúvida sobre produto',
  outro: 'Outro assunto',
};

const TELEGRAM_PRODUCTION_PUBLIC_KEY = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';

function validateTelegramSignature(params, botToken) {
  const signature = params.get('signature');
  const botId = String(botToken || '').split(':')[0];

  if (!signature || !/^\d+$/.test(botId)) return false;

  try {
    const fields = [...params.entries()]
      .filter(([key]) => key !== 'hash' && key !== 'signature')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const dataCheckString = `${botId}:WebAppData\n${fields}`;
    const rawPublicKey = Buffer.from(TELEGRAM_PRODUCTION_PUBLIC_KEY, 'hex');
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([spkiPrefix, rawPublicKey]),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify(
      null,
      Buffer.from(dataCheckString, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    return false;
  }
}

function validateInitData(initData, botToken) {
  if (typeof initData !== 'string' || !initData || initData.length > 10000) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));

  if (!/^[a-f0-9]{64}$/i.test(receivedHash || '') || !Number.isInteger(authDate)) return null;
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > 600) return null;

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  params.delete('hash');
  const entries = [...params.entries()];
  const checkHash = (fields) => {
    const dataCheckString = fields
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return expectedHash.length === receivedHash.length
      && crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(receivedHash));
  };

  // Telegram clients introduced the optional Ed25519 `signature` field after
  // the original bot-token validation format. Clients in circulation may
  // calculate the legacy hash with or without this auxiliary field.
  const validHash = checkHash([...entries])
    || (params.has('signature') && checkHash(entries.filter(([key]) => key !== 'signature')));
  const validSignature = validateTelegramSignature(params, botToken);
  if (!validHash && !validSignature) return null;

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
