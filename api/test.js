export default function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY || '';
  res.status(200).json({
    ok: true,
    hasKey: key.length > 0,
    keyLen: key.length,
    keyPrefix: key.substring(0, 8),
    runtime: 'nodejs',
  });
}
