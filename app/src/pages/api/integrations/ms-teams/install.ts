import type { NextApiRequest, NextApiResponse } from 'next';

import { encodeIdentityState } from '@lib/integrationState';
import { resolveRequestJwt } from '@lib/sessionToken';
import { fetchData, getRequestId, handleErrorResponse, sendAuthenticationError } from 'src/utils/apiUtils';

// Same-origin entry point: sign the user's identity into the OAuth `state` here
// (cookie present) so the callback recovers it without the session cookie.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId: string = getRequestId(req);
  try {
    const jwt = await resolveRequestJwt(req);
    const tenantId = ((jwt?.tenant as { id?: string } | undefined)?.id as string) || null;
    if (!tenantId) {
      return sendAuthenticationError(res);
    }

    const state = await encodeIdentityState({
      tenant_id: tenantId,
      user_email: (jwt?.email as string) || 'system',
    });

    await doRedirect(state, requestId, res);
  } catch (error: any) {
    handleErrorResponse(res, error, requestId);
  }
}

async function doRedirect(state: string, requestId: string, res: NextApiResponse) {
  const notificationServiceEndpoint = process.env.NOTIFICATION_SERVICE_URL || 'http://notifications:80';
  const url = `${notificationServiceEndpoint}/api/integrations/install/ms-teams?state=${encodeURIComponent(state)}`;

  try {
    const response = await fetchData(url, null, requestId);
    res.status(302).setHeader('Location', response.url).end();
  } catch (error: any) {
    console.error('Error fetching data:', error);
    handleErrorResponse(res, error, requestId);
  }
}
