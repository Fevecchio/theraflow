import Stripe from 'stripe';

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';

async function verifySupabaseJWT(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://theraflow.com.br',
  'https://www.theraflow.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return false;
}

function setCors(res, origin) {
  const allowed = isAllowedOrigin(origin) ? (origin || ALLOWED_ORIGINS[0]) : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifySupabaseJWT(req);
  if (!caller) return res.status(401).json({ error: 'Autenticação necessária' });

  // F3.4: usa SEMPRE a identidade do JWT — ignora email/supaId do corpo. Antes, um email
  // arbitrário no body podia pendurar a assinatura no customer de outra pessoa, e um supaId
  // ausente fazia o webhook não ativar o plano (pagamento sem upgrade). Agora ambos vêm do token.
  const email = caller.email;
  const supaId = caller.id;
  if (!email) return res.status(400).json({ error: 'Sua conta está sem email. Refaça o login e tente de novo.' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // Reutiliza customer existente para evitar duplicatas no Stripe
    let customerId;
    try {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customerId = existing.data[0]?.id;
    } catch(_) { /* sem customer existente — cria novo */ }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      ...(customerId ? { customer: customerId } : { customer_email: email }),
      metadata: { supaId: supaId || '' },
      success_url: (process.env.APP_URL || 'https://theraflow-one.vercel.app') + '/app?checkout=success',
      cancel_url: (process.env.APP_URL || 'https://theraflow-one.vercel.app') + '/app',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
