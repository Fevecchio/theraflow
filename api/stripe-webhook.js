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

async function _patchUser(userId, body) {
  await fetch(`${SUPA_URL}/rest/v1/users?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

// Aplica o crédito de R$89 ao indicador SE elegível. Recompensa ÚNICA (decisão do
// usuário — não acumulativa): só credita quando o indicador JÁ tem stripe_customer_id
// (senão o balance não teria onde ser aplicado) e ainda não foi recompensado. A flag
// referral_rewarded só vira true APÓS o crédito — antes ela era marcada primeiro e,
// se o indicador ainda estivesse em trial (sem customer), a recompensa era QUEIMADA
// sem crédito nenhum. Idempotente por referral_rewarded.
async function applyReferralCreditIfEligible(stripe, referrerId) {
  try {
    const referrer = await supaGet(`users?id=eq.${referrerId}&select=referral_rewarded,stripe_customer_id,referral_count`);
    const r = referrer?.[0];
    if (!r || r.referral_rewarded) return;
    if (!(r.referral_count > 0)) return;      // nenhum indicado assinou ainda
    if (!r.stripe_customer_id) return;        // sem customer → deixa PENDENTE (aplica quando ele assinar)
    await stripe.customers.createBalanceTransaction(r.stripe_customer_id, {
      amount: -8900,
      currency: 'brl',
      description: 'Bônus de indicação — 1 mês grátis Teravia Pro',
    });
    await _patchUser(referrerId, { referral_rewarded: true });
    console.log(`[webhook] referral reward APLICADO: referrerId=${referrerId}`);
  } catch (err) {
    console.warn('[webhook] applyReferralCredit error:', err.message);
  }
}

// Chamado quando um usuário INDICADO assina: conta a indicação e tenta creditar.
async function supaReferralReward(stripe, newUserId) {
  try {
    const rows = await supaGet(`users?id=eq.${newUserId}&select=referred_by`);
    const referrerId = rows?.[0]?.referred_by;
    if (!referrerId) return;
    const referrer = await supaGet(`users?id=eq.${referrerId}&select=referral_count`);
    const cnt = referrer?.[0]?.referral_count || 0;
    await _patchUser(referrerId, { referral_count: cnt + 1 });
    await applyReferralCreditIfEligible(stripe, referrerId);
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

  // C3: idempotência ATÔMICA — reivindica o event.id ANTES de processar (INSERT
  // na PK). Duas entregas simultâneas do mesmo evento: uma insere, a outra leva
  // 409 e sai. O check-then-insert antigo deixava as duas passarem (race raro →
  // bônus de indicação creditado 2×, achado #seguranca 12/07).
  const claim = await fetch(`${SUPA_URL}/rest/v1/processed_webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ stripe_event_id: event.id }),
  });
  if (!claim.ok) {
    if (claim.status === 409) {
      return res.status(200).json({ received: true, skipped: true });
    }
    // claim falhou por outro motivo (banco fora etc.) → 500 para o Stripe reenviar
    console.error('[webhook] claim de idempotencia falhou:', claim.status);
    return res.status(500).json({ error: 'idempotency claim failed' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const supaId = session.metadata?.supaId;
      if (supaId) {
        await supaUpdatePlan(supaId, 'pro', session.customer);
        console.log(`[webhook] plano=pro para supaId=${supaId}`);
        // Plano Fundador (migration 026): os 10 primeiros assinantes ganham
        // founder_number — registro auditável do "preço travado para sempre"
        // prometido na landing. Idempotente; falha aqui NÃO derruba o webhook.
        try {
          const fRes = await fetch(`${SUPA_URL}/rest/v1/rpc/assign_founder`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ p_user: supaId }),
          });
          const fNum = fRes.ok ? await fRes.json() : null;
          if (fNum) console.log(`[webhook] fundador #${fNum} atribuído a ${supaId}`);
        } catch (fErr) {
          console.warn('[webhook] assign_founder falhou (não-fatal):', fErr.message);
        }
        // Este usuário assinou: (a) se ele foi INDICADO, conta+credita o indicador;
        // (b) se ELE indicou alguém e a recompensa estava PENDENTE (não tinha customer
        // até agora), aplica agora que ganhou stripe_customer_id. Decisão #6.
        await supaReferralReward(stripe, supaId);
        await applyReferralCreditIfEligible(stripe, supaId);
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

    // F3.4: cartão recusado / assinatura suspensa. Sem isto, um pagamento que falha mantinha
    // o plano 'pro' até o Stripe cancelar de vez (dias/semanas). subscription.updated traz o
    // status autoritativo: só 'active'/'trialing' = pro; past_due/unpaid/canceled = trial.
    // ⚠️ Requer ADICIONAR o evento 'customer.subscription.updated' ao webhook no painel Stripe
    // (hoje só assina completed+deleted). Sem isso, o evento não chega e este bloco é inócuo.
    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const supaId = await supaFindByStripeCustomer(sub.customer);
      if (supaId) {
        const active = sub.status === 'active' || sub.status === 'trialing';
        await supaUpdatePlan(supaId, active ? 'pro' : 'trial', active ? sub.customer : null);
        console.log(`[webhook] subscription.updated status=${sub.status} → ${active ? 'pro' : 'trial'} supaId=${supaId}`);
      }
    }

  } catch (err) {
    console.error('[webhook] Handler error:', err.message);
    // Solta a reivindicação: o reenvio do Stripe precisa poder reprocessar
    // (senão o evento ficaria marcado como processado sem ter sido).
    try {
      await fetch(`${SUPA_URL}/rest/v1/processed_webhooks?stripe_event_id=eq.${encodeURIComponent(event.id)}`, {
        method: 'DELETE',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
    } catch (_) {}
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}
