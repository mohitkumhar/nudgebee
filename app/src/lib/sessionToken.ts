import { getToken, type JWT } from 'next-auth/jwt';
import type { NextApiRequest } from 'next';
import { authenticateRequest } from '@lib/rpcGateway';

// getToken() picks the session cookie name (`__Secure-` vs not) from NEXTAUTH_URL's scheme
// alone, so on-prem HTTP-behind-a-TLS-proxy can write it under the secure name but read it
// under the non-secure one. Try both so a scheme mismatch can't hide a valid session.
export async function getSessionTokenResilient(req: NextApiRequest): Promise<JWT | null> {
  return (await getToken({ req, secureCookie: true })) ?? (await getToken({ req, secureCookie: false }));
}

// Identity for integration OAuth routes: session cookie or encrypted bearer, plus the resilient cookie read.
export async function resolveRequestJwt(req: NextApiRequest): Promise<JWT | null> {
  const auth = await authenticateRequest(req);
  if (auth?.jwt) return auth.jwt;
  return getSessionTokenResilient(req);
}
