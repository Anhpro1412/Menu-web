// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

import { getOrders, addOrder, getMenu, addMenu, getCustomers } from './db.js';

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

  // Lưu vào SQL Server
  await addOrder({ orderCode: code, customer, items, total, createdAt: createdAt || new Date().toISOString() });
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


/* ========== API cho admin ========== */
// Lấy tất cả đơn hàng
app.get('/api/admin/orders', async (req, res) => {
  try {
    const data = await getOrders();
    res.json({ orders: data });
  } catch (e) {
    res.status(500).json({ error: 'DB error', detail: String(e) });
  }
});

// Lấy menu
app.get('/api/admin/menu', async (req, res) => {
  try {
    const data = await getMenu();
    res.json({ menu: data });
  } catch (e) {
    res.status(500).json({ error: 'DB error', detail: String(e) });
  }
});

// Thêm món mới
app.post('/api/admin/menu', async (req, res) => {
  try {
    const item = req.body;
    await addMenu(item);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'DB error', detail: String(e) });
  }
});

// Lấy khách hàng
app.get('/api/admin/customers', async (req, res) => {
  try {
    const data = await getCustomers();
    res.json({ customers: data });
  } catch (e) {
    res.status(500).json({ error: 'DB error', detail: String(e) });
  }
});


/* ========== /api/chat ========== */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, menu } = req.body || {};

    // Nếu có menu, gợi ý món ăn dựa trên menu (giống suggest)
    if (Array.isArray(menu) && menu.length > 0) {
      // Nếu có OpenAI thì dùng AI trả lời dựa trên menu
      if (openai) {
        const menuText = menu.map(it =>
          `- ${it.name} (${Number(it.price||0).toLocaleString('vi-VN')}₫) • loại: ${it.cat||'khác'} • mô tả: ${it.desc||''}`
        ).join('\n');
        const userMsg = messages && messages.length ? messages[messages.length-1].content : '';
        const prompt = `Bạn là trợ lý gợi ý món cho quán DHA Food (bánh mì & phở).\n- Trả lời ngắn gọn, thân thiện bằng tiếng Việt.\n- Gợi ý 1–3 món phù hợp từ danh sách.\n- Nếu khách không nói rõ, đề xuất combo bán chạy (bánh mì/phở + đồ uống).\n- Cuối câu hỏi gợi ý: \"Bạn thích vị cay/ít cay/chay không?\".\n\nDanh sách:\n${menuText}\n\nKhách hỏi: ${userMsg || 'Chưa nói gì (hãy gợi ý combo bán chạy)'}\n`;
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          messages: [
            { role: 'system', content: 'Bạn là trợ lý gợi ý món ăn Việt Nam.' },
            { role: 'user', content: prompt }
          ]
        });
        const reply = resp.choices?.[0]?.message?.content?.trim() || 'Xin lỗi, chưa có gợi ý.';
        return res.json({ reply, source: 'openai-menu' });
      }
      // Nếu không có OpenAI, fallback nội bộ
      const text = String(messages && messages.length ? messages[messages.length-1].content : '').toLowerCase();
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
      const reply = picks.length
        ? `Gợi ý cho bạn: ${picks.map(i => `${i.name} (${Number(i.price).toLocaleString('vi-VN')}₫)`).join(', ')}. Bạn thích vị cay/ít cay/chay không?`
        : 'Chưa có món phù hợp. Bạn mô tả rõ hơn sở thích hoặc mức giá nhé!';
      return res.json({ reply, source: 'local-menu' });
    }

    // Nếu không có menu, trả lời AI như ChatGPT
    if (openai) {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'Bạn là trợ lý AI thân thiện, trả lời ngắn gọn bằng tiếng Việt.' },
          ...(Array.isArray(messages) ? messages : [])
        ]
      });
      const reply = resp.choices?.[0]?.message?.content?.trim() || 'Xin lỗi, chưa có câu trả lời.';
      return res.json({ reply, source: 'openai' });
    }
    // Nếu không có OpenAI, trả lời mặc định
    return res.json({ reply: 'Server chưa cấu hình AI.', source: 'none' });
  } catch (e) {
    console.error('chat error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});
