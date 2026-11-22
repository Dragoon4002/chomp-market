import { Account, actions, type KeyPairString } from 'near-api-js';
import { FASTAUTH, validSignRequest } from '@/lib/fastauth';

// Relayer for NEAR Auth: submits the `sign` call to fast-auth.testnet (needs a funded account) and returns
// the MPC signature. Only used once per device, to add the device's local key to the user's account.
// ponytail: no rate limit, each call costs the relayer ~0.03 NEAR gas; add per-IP limits before mainnet.
const ID = process.env.FASTAUTH_RELAYER_ID;
const KEY = process.env.FASTAUTH_RELAYER_KEY as KeyPairString | undefined;

export const GET = () => Response.json({ ready: !!(ID && KEY) });

export async function POST(req: Request) {
  if (!ID || !KEY) return Response.json({ error: 'NEAR Auth relayer not configured (FASTAUTH_RELAYER_ID / FASTAUTH_RELAYER_KEY)' }, { status: 503 });
  const r: unknown = await req.json().catch(() => null);
  if (!validSignRequest(r)) return Response.json({ error: 'bad sign request' }, { status: 400 });
  try {
    const out = await new Account(ID, FASTAUTH.rpc, KEY).signAndSendTransaction({
      receiverId: FASTAUTH.contractId,
      actions: [actions.functionCall('sign', { guard_id: r.guardId, verify_payload: r.verifyPayload, sign_payload: r.signPayload, algorithm: 'eddsa' }, 300_000_000_000_000n, 1n)],
    });
    const v = (out.status as { SuccessValue?: string }).SuccessValue;
    return v ? Response.json({ signature: v }) : Response.json({ error: 'NEAR Auth did not sign (JWT rejected?)' }, { status: 502 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
