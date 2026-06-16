import type { NextApiRequest, NextApiResponse } from 'next';

import { decodeIdentityState, type IntegrationIdentity } from '@lib/integrationState';
import { resolveRequestJwt } from '@lib/sessionToken';
import { getRequestId, handleOAuthCallbackResponse, sendAuthenticationError } from '@utils/apiUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId: string = getRequestId(req);
  try {
    // Identity from the signed `state` (cookie-independent); fall back to the
    // session only for installs still in flight across a deploy.
    let identity = await decodeIdentityState(req.query.state);
    if (!identity) {
      const jwt = await resolveRequestJwt(req);
      const tenantId = ((jwt?.tenant as { id?: string } | undefined)?.id as string) || null;
      if (tenantId) {
        identity = { tenant_id: tenantId, user_email: (jwt?.email as string) || 'system' };
      }
    }

    if (!identity?.tenant_id) {
      return sendAuthenticationError(res);
    }

    await doRedirect(req, identity, requestId, res);
  } catch (error: any) {
    handleErrorResponse(res, error, requestId);
  }
}

async function doRedirect(req: NextApiRequest, identity: IntegrationIdentity, requestId: string, res: NextApiResponse) {
  const code = req.query.code;
  if (typeof code !== 'string' || code.length === 0) {
    res.status(400).setHeader('x-request-id', requestId).json({ error: 'invalid_request', description: 'Missing authorization code' });
    return;
  }
  const notificationServiceEndpoint = process.env.NOTIFICATION_SERVICE_URL ? process.env.NOTIFICATION_SERVICE_URL : 'http://notifications:80';
  const url = notificationServiceEndpoint + '/api/integrations/callback/ms-teams';
  await redirectOauthToNotificationService(url, identity, requestId, code, res);
}

async function redirectOauthToNotificationService(url: string, identity: IntegrationIdentity, requestId: string, code: string, res: NextApiResponse) {
  let attempt = 3;
  let proxyResponse = null;

  while (attempt > 0) {
    proxyResponse = await fetchAndGetResponse(url, identity, requestId, code);
    if (proxyResponse.status === 500) {
      // clone() so reading the body to detect ECONNRESET doesn't consume it before handleOAuthCallbackResponse.
      const body = await proxyResponse
        .clone()
        .json()
        .catch(() => ({}));
      if (body.code === 'ECONNRESET') {
        console.error('Connection Reset - retrying');
        attempt -= 1;
        continue;
      }
    }
    break;
  }
  await handleOAuthCallbackResponse(proxyResponse, res, requestId);
}

async function fetchAndGetResponse(url: string, identity: IntegrationIdentity, requestId: string, code: string) {
  return await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      'x-user-email': identity.user_email,
    },
    body: JSON.stringify({ code, tenant_id: identity.tenant_id }),
    method: 'post',
  });
}

function handleErrorResponse(res: NextApiResponse, error: any, requestId: string): void {
  console.log('api error', error);
  res
    .status(error.status || 500)
    .setHeader('x-request-id', requestId)
    .json({
      code: error.code,
      error: error.message,
    });
}
