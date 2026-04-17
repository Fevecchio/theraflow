import Stripe from 'stripe';

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://theraflow.com.br',
  'https://www.theraflow.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  return false;
}

function setCors(res, origin) {
  const allowed = isAllowedOrigin(origin) ? (origin || ALLOWED_ORIGINS[0]) : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, supaId } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: email,
      metadata: { supaId: supaId || '' },
      success_url: 'https://theraflow-one.vercel.app/app?checkout=success',
      cancel_url: 'https://theraflow-one.vercel.app/app',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
