import { getToken } from 'next-auth/jwt';
import { getServerSession } from 'next-auth/next';

import type { NextApiRequest, NextApiResponse } from 'next';

import { authOptions } from '@pages/api/auth/[...nextauth]';
import { decrypt } from '@lib/internal';
import { resolveRequestJwt } from '@lib/sessionToken';
import { getRequestId, handleErrorResponse, sendAuthenticationError } from 'src/utils/apiUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestId: string = getRequestId(req);
  try {
    const splits = req.headers.authorization ? req.headers.authorization.split(' ') : [];
    let token = splits.length > 1 ? await decrypt(splits[1]) : null;

    const session = await getServerSession(req, res, authOptions);
    token = !token && session?.user ? ((await getToken({ req }))?.idToken as string) : token;

    const jwtToken = await resolveRequestJwt(req);
    const tenantId = ((jwtToken?.tenant as { id?: string } | undefined)?.id as string) || null;
    const userEmail = (jwtToken?.email as string) || null;

    if (!token || !tenantId) {
      return sendAuthenticationError(res);
    }

    const notificationServiceEndpoint = process.env.NOTIFICATION_SERVICE_URL || 'http://notifications:80';
    const url = `${notificationServiceEndpoint}/api/integrations/install/discord`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'tenant-id': tenantId,
        'x-user-email': userEmail || '',
        'x-request-id': requestId,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error: any) {
    handleErrorResponse(res, error, requestId);
  }
}
