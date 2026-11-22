// NEAR Auth (FastAuth) testnet config, defaults from docs.auth.near.org/resources/testnet
export const FASTAUTH = {
  enabled: process.env.NEXT_PUBLIC_FASTAUTH !== 'off',
  clientId: process.env.NEXT_PUBLIC_FASTAUTH_CLIENT_ID ?? 'np8paqIpMWmNbzT4xAvOOapZBjsOpptl',
  domain: process.env.NEXT_PUBLIC_FASTAUTH_DOMAIN ?? 'login.testnet.fast-auth.com',
  contractId: process.env.NEXT_PUBLIC_FASTAUTH_CONTRACT_ID ?? 'fast-auth.testnet',
  mpcId: process.env.NEXT_PUBLIC_FASTAUTH_MPC_ID ?? 'v1.signer-prod.testnet',
  rpc: process.env.NEXT_PUBLIC_FASTAUTH_RPC ?? 'https://test.rpc.fastnear.com',
};
export const FAUCET_URL = 'https://docs.near.org/getting-started/faucet';
export const guardId = (domain = FASTAUTH.domain) => `jwt#https://${domain}/`;

export interface SignRequest { guardId: string; verifyPayload: string; signPayload: number[] }

// relayer input check: only our guard, bounded JWT + payload
export function validSignRequest(r: unknown): r is SignRequest {
  const x = r as SignRequest;
  return !!x && x.guardId === guardId() && typeof x.verifyPayload === 'string' && x.verifyPayload.length <= 8192
    && Array.isArray(x.signPayload) && x.signPayload.length > 0 && x.signPayload.length <= 4096
    && x.signPayload.every((n) => Number.isInteger(n) && n >= 0 && n < 256);
}

const hex32 = (h: string) => {
  const b = Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
  const t = b.length === 33 ? b.subarray(1) : b.subarray(Math.max(0, b.length - 32));
  const out = new Uint8Array(32);
  out.set(t, 32 - t.length);
  return out;
};

// MPC `sign` return value (base64 JSON) -> 64-byte ed25519 signature
export function recoverEd25519(successValue: string): Uint8Array {
  const p = JSON.parse(atob(successValue)) as { signature?: number[]; big_r?: { affine_point: string }; s?: { scalar: string } } | null;
  if (Array.isArray(p?.signature) && p.signature.length === 64) return Uint8Array.from(p.signature);
  if (!p?.big_r?.affine_point || !p.s?.scalar) throw new Error('NEAR Auth returned no signature');
  const sig = new Uint8Array(64);
  sig.set(hex32(p.big_r.affine_point));
  sig.set(hex32(p.s.scalar), 32);
  return sig;
}
