import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Account, actions, JsonRpcProvider, keyToImplicitAddress, type KeyPairString } from 'near-api-js';
import { FASTAUTH, guardId } from '@/lib/fastauth.ts';

// Gives a brand-new NEAR Auth account its first testnet NEAR. The address is derived here from the verified
// Auth0 token, so the relayer can only fund the caller's own implicit account, once (skipped if it exists).
const ID = process.env.FASTAUTH_RELAYER_ID;
const KEY = process.env.FASTAUTH_RELAYER_KEY as KeyPairString | undefined;
const GRANT = 3n * 10n ** 23n; // 0.3 NEAR
const ISSUER = `https://${FASTAUTH.domain}/`;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}.well-known/jwks.json`));
const rpc = new JsonRpcProvider({ url: FASTAUTH.rpc });

export async function POST(req: Request) {
  if (!ID || !KEY) return Response.json({ error: 'relayer not configured' }, { status: 503 });
  const { idToken } = await req.json().catch(() => ({}));
  if (typeof idToken !== 'string' || idToken.length > 8192) return Response.json({ error: 'bad request' }, { status: 400 });
  try {
    const { payload } = await jwtVerify(idToken, jwks, { issuer: ISSUER, audience: FASTAUTH.clientId });
    const pk = String(await rpc.callFunction({ contractId: FASTAUTH.mpcId, method: 'derived_public_key', args: { path: `${guardId()}#${payload.sub}`, predecessor: FASTAUTH.contractId, domain_id: 1 } }));
    const accountId = keyToImplicitAddress(pk);
    if (await rpc.viewAccount({ accountId, blockQuery: { finality: 'optimistic' } }).then(() => true, () => false)) return Response.json({ accountId, funded: false });
    await new Account(ID, rpc, KEY).signAndSendTransaction({ receiverId: accountId, actions: [actions.transfer(GRANT)] });
    return Response.json({ accountId, funded: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
