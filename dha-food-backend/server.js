// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

const app = express();

/* ========== CORS ========== */
const allowed = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowed === '*' ? true : [allowed],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

/* ========== BODY PARSER + RATE LIMIT ========== */
app.use(express.json({ limit: '1mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 30 })); // 30 req/phút

/* ========== OPENAI (tuỳ chọn) ========== */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* ========== MISC ========== */
app.get('/', (_req, res) => res.json({ ok: true, service: 'DHA Food backend' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    openai: Boolean(OPENAI_API_KEY),
    timestamp: Date.now(),
  });
});

/* ========== /api/suggest ========== */
app.post('/api/suggest', async (req, res) => {
  try {
    const { message, menu } = req.body || {};
    if (!Array.isArray(menu) || menu.length === 0) {
      return res.status(400).json({ error: 'Thiếu menu items' });
    }

    // Có OpenAI -> dùng LLM
    if (openai) {
      const menuText = menu.map(it =>
        `- ${it.name} (${Number(it.price||0).toLocaleString('vi-VN')}₫) • loại: ${it.cat||'khác'} • mô tả: ${it.desc||''}`
      ).join('\n');

      const prompt = `
Bạn là trợ lý gợi ý món cho quán DHA Food (bánh mì & phở).
- Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
- Gợi ý 1–3 món phù hợp từ danh sách.
- Nếu khách không nói rõ, đề xuất combo bán chạy (bánh mì/phở + đồ uống).
- Cuối câu hỏi gợi ý: "Bạn thích vị cay/ít cay/chay không?".

Danh sách:
${menuText}

Khách hỏi: ${message || 'Chưa nói gì (hãy gợi ý combo bán chạy)'}
`.trim();

      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'Bạn là trợ lý gợi ý món ăn Việt Nam.' },
          { role: 'user', content: prompt }
        ]
      });

      const answer = resp.choices?.[0]?.message?.content?.trim() || 'Xin lỗi, chưa có gợi ý.';
      return res.json({ answer, source: 'openai' });
    }

    // Không có OpenAI -> fallback nội bộ
    const text = String(message || '').toLowerCase();
    const want = [];
    if (text.includes('bánh mì')) want.push('banhmi');
    if (text.includes('phở') || text.includes('pho')) want.push('pho');
    if (text.includes('uống') || text.includes('nước') || text.includes('drink')) want.push('nuoc');

    const m = text.match(/(\d{2,6})\s*(k|nghìn|đ|vnd)/i);
    const budget = m ? (m[2].toLowerCase() === 'k' ? parseInt(m[1],10)*1000 : parseInt(m[1],10)) : null;

    let candidates = menu.slice();
    if (want.length) candidates = candidates.filter(i => want.includes(i.cat));
    if (budget) candidates = candidates.filter(i => Number(i.price) <= budget);

    const picks = (candidates.length ? candidates : menu).slice(0, 3);
    const answer = picks.length
      ? `Gợi ý cho bạn: ${picks.map(i => `${i.name} (${Number(i.price).toLocaleString('vi-VN')}₫)`).join(', ')}. Bạn thích vị cay/ít cay/chay không?`
      : 'Chưa có món phù hợp. Bạn mô tả rõ hơn sở thích hoặc mức giá nhé!';
    return res.json({ answer, source: 'local' });

  } catch (err) {
    console.error('suggest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ========== /api/order ========== */
app.post('/api/order', async (req, res) => {
  try {
    const { orderCode, customer, items, total, createdAt } = req.body || {};

    // Validate tối thiểu
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Giỏ hàng trống' });
    }
    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ error: 'Thiếu thông tin khách hàng' });
    }

    // Tạo mã đơn nếu frontend chưa gửi
    const code = orderCode || ('DH' + Date.now().toString().slice(-6));

    // (Demo) Ghi log – bạn có thể thay bằng lưu DB/gửi Telegram/Email...
    console.log('=== NEW ORDER ===');
    console.log('Code:', code);
    console.log('Customer:', customer);
    console.log('Items:', items);
    console.log('Total:', total);
    console.log('Time:', createdAt || new Date().toISOString());
    console.log('=================');

    // Phản hồi về cho frontend
    return res.json({ ok: true, orderId: code });
  } catch (e) {
    console.error('order error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

/* ========== START ========== */
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`DHA Food backend listening on http://localhost:${port}`);
});
