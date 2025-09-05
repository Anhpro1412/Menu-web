// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

const app = express();

// --- CORS: cho phép frontend gọi API ---
const allowed = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowed === '*' ? true : [allowed],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '1mb' }));

// --- Chống spam đơn giản ---
app.use('/api/', rateLimit({ windowMs: 60_000, max: 30 }));

// --- Kết nối OpenAI (tuỳ chọn) ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// --- Healthcheck ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', openai: Boolean(OPENAI_API_KEY), timestamp: Date.now() });
});

// ========== API gợi ý món ==========
app.post('/api/suggest', async (req, res) => {
  try {
    const { message, menu } = req.body || {};
    if (!Array.isArray(menu) || menu.length === 0) {
      return res.status(400).json({ error: 'Thiếu menu items' });
    }

    // Nếu có OpenAI API key thì dùng LLM, ngược lại dùng heuristic cục bộ
    if (openai) {
      const menuText = menu.map(it =>
        `- ${it.name} (${Number(it.price||0).toLocaleString('vi-VN')}₫) • loại: ${it.cat||'khác'} • mô tả: ${it.desc||''}`
      ).join('\n');

      const prompt = `Bạn là trợ lý gợi ý món cho quán DHA Food (bánh mì & phở).\nHãy gợi ý 1–3 món phù hợp, thân thiện, ngắn gọn.\nMenu:\n${menuText}\n\nKhách hỏi: ${message || 'Chưa nói gì (hãy gợi ý combo bán chạy)'}\n`;

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

    // Heuristic fallback: lọc theo từ khoá loại và ngân sách
    const text = String(message || '').toLowerCase();
    const want = [];
    if (text.includes('bánh mì')) want.push('banhmi');
    if (text.includes('phở') || text.includes('pho')) want.push('pho');
    if (text.includes('uống') || text.includes('nước') || text.includes('drink')) want.push('nuoc');
    const m = text.match(/(\d{2,6})\s*(k|nghìn|đ|vnd)/i);
    const budget = m ? (m[2].toLowerCase() === 'k' ? parseInt(m[1],10)*1000 : parseInt(m[1],10)) : null;

    let candidates = menu;
    if (want.length) candidates = candidates.filter(i => want.includes(i.cat));
    if (budget) candidates = candidates.filter(i => Number(i.price) <= budget);
    const picks = (candidates.length ? candidates : menu).slice(0, 3);
    const answer = picks.length
      ? `Gợi ý cho bạn: ${picks.map(i => `${i.name} (${Number(i.price).toLocaleString('vi-VN')}₫)`).join(', ')}.`
      : 'Chưa có món phù hợp. Bạn mô tả rõ hơn sở thích hoặc mức giá nhé!';
    return res.json({ answer, source: 'local' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ Backend chạy tại http://localhost:${port}`);
});
