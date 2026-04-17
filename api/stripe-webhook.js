import Stripe from 'stripe';

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';

async function supaUpdatePlan(supaId, plano, stripeCustomerId) {
  const url = `${SUPA_URL}/rest/v1/users?id=eq.${supaId}`;
  const body = { plano };
  if (stripeCustomerId) body.stripe_customer_id = stripeCustomerId;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase PATCH failed ${res.status}: ${text.substring(0, 120)}`);
  }
}

async function supaFindByStripeCustomer(customerId) {
  const url = `${SUPA_URL}/rest/v1/users?stripe_customer_id=eq.${customerId}&select=id`;
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.id || null;
}

async function supaGet(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function supaReferralReward(stripe, newUserId) {
  try {
    const rows = await supaGet(`users?id=eq.${newUserId}&select=referred_by`);
    const referrerId = rows?.[0]?.referred_by;
    if (!referrerId) return;

    const referrer = await supaGet(`users?id=eq.${referrerId}&select=referral_rewarded,stripe_customer_id,referral_count`);
    const r = referrer?.[0];
    if (!r || r.referral_rewarded) return;

    // Aplica crédito de R$89 no Stripe (1 mês grátis)
    if (r.stripe_customer_id) {
      await stripe.customers.createBalanceTransaction(r.stripe_customer_id, {
        amount: -8900,
        currency: 'brl',
        description: 'Bônus de indicação — 1 mês grátis TheraFlow Pro',
      });
    }

    // Marca recompensado e incrementa contador (não cumulativo)
    await fetch(`${SUPA_URL}/rest/v1/users?id=eq.${referrerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ referral_rewarded: true, referral_count: (r.referral_count || 0) + 1 }),
    });
    console.log(`[webhook] referral reward: referrerId=${referrerId} newUser=${newUserId}`);
  } catch (err) {
    console.warn('[webhook] referral reward error:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const supaId = session.metadata?.supaId;
      if (supaId) {
        await supaUpdatePlan(supaId, 'pro', session.customer);
        console.log(`[webhook] plano=pro para supaId=${supaId}`);
        await supaReferralReward(stripe, supaId);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const supaId = await supaFindByStripeCustomer(sub.customer);
      if (supaId) {
        await supaUpdatePlan(supaId, 'trial', null);
        console.log(`[webhook] plano=trial para supaId=${supaId}`);
      }
    }
  } catch (err) {
    console.error('[webhook] Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}
