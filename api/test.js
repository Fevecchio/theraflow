export default function handler(req, res) {
  const key = process.env.GEMINI_API_KEY || process.env.gemini_key || '';
  res.status(200).json({
    ok: true,
    hasKey: key.length > 0,
    keyLen: key.length,
    keyPrefix: key.substring(0, 8),
    runtime: 'nodejs',
  });
}
