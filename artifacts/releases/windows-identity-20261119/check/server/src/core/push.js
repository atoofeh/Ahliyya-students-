const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { logger } = require('../config/logger');

/**
 * Firebase Cloud Messaging, spoken directly.
 *
 * This is the one thing the app cannot do for itself: a notification that
 * arrives while the app is closed. Everything else — the bell, the badge, the
 * shade entry while the app runs — happens locally on the device.
 *
 * It talks to the FCM HTTP v1 API rather than using firebase-admin. The SDK
 * would bring the whole Google Cloud client tree along for one endpoint, and
 * with it a transitive advisory whose only remedy is a four-major downgrade.
 * What that SDK does for us here is two documented steps: sign a JWT assertion
 * with the service-account key, exchange it for an access token, then POST a
 * message. The legacy server-key API is not an option — Google shut it down in
 * 2024; v1 with a service account is the current path.
 *
 * Push is optional. With no credentials configured the platform still works:
 * every notification is stored, the bell shows it, and a running app still
 * raises it on the phone. Only the app-is-closed case is lost, so a missing
 * key is a logged fact, not a failure.
 */
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_SKEW_MS = 60_000; // renew a minute early rather than race the expiry

let credentials = null;
let configured = null; // null = not yet resolved, then true/false
let accessToken = null; // { value, expiresAt }

/** Reads and validates the service account once. */
const loadCredentials = () => {
  if (configured !== null) return configured;
  configured = false;

  const raw = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    logger.info('Push notifications disabled: FIREBASE_SERVICE_ACCOUNT_KEY is not set');
    return false;
  }
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (!json.project_id || !json.client_email || !json.private_key) {
      throw new Error('missing project_id, client_email or private_key');
    }
    credentials = json;
    configured = true;
    logger.info(`Push notifications enabled for Firebase project ${json.project_id}`);
  } catch (err) {
    // Never log the value itself — it is a private key.
    logger.error(`Push notifications disabled: FIREBASE_SERVICE_ACCOUNT_KEY could not be read (${err.message})`);
  }
  return configured;
};

const isPushConfigured = () => loadCredentials();

/**
 * A Google access token for the messaging scope, cached until just before it
 * expires. The assertion is the standard JWT-bearer grant (RFC 7523).
 */
const getAccessToken = async () => {
  if (accessToken && accessToken.expiresAt - TOKEN_SKEW_MS > Date.now()) return accessToken.value;

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: credentials.client_email,
      scope: SCOPE,
      aud: credentials.token_uri,
      iat: now,
      exp: now + 3600,
    },
    credentials.private_key,
    { algorithm: 'RS256' }
  );

  const res = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`token exchange failed (${res.status}): ${body.error_description || body.error || 'no access_token'}`);
  }

  accessToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return accessToken.value;
};

/** FCM's verdict on one token: keep it, or drop it for good. */
const isDeadToken = (status, body) => {
  if (status === 404) return true; // UNREGISTERED — the app was uninstalled
  const reason = body?.error?.details?.find((d) => d.errorCode)?.errorCode || body?.error?.status;
  return status === 400 && (reason === 'INVALID_ARGUMENT' || reason === 'UNREGISTERED');
};

/**
 * Send one notification to one device token.
 *
 * Returns 'sent', 'dead' (the caller should forget this token) or 'failed'.
 * FCM v1 takes a single token per request; the caller fans out.
 */
const sendToToken = async (token, { title, body, link }) => {
  const bearer = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        // A `notification` block is what makes Android draw the notification
        // itself while the app is closed — a data-only message would need the
        // app to be alive to render it, which is the case we cannot rely on.
        notification: { title, body: body || '' },
        data: { link: link || '' },
        android: {
          priority: 'high',
          notification: {
            channel_id: 'default',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      },
    }),
  });

  if (res.ok) return 'sent';
  const errBody = await res.json().catch(() => ({}));
  if (isDeadToken(res.status, errBody)) return 'dead';
  logger.warn(`Push send failed (${res.status}): ${errBody?.error?.message || 'unknown'}`);
  return 'failed';
};

/**
 * Push a notification to every device a user has registered.
 *
 * Tokens FCM rejects as unregistered are deleted: a phone that uninstalled the
 * app would otherwise be retried for ever. Never throws — a notification that
 * cannot be pushed is still in the database and still shows in the app.
 */
const pushToUser = async (userId, payload) => {
  if (!isPushConfigured()) return { sent: 0, removed: 0 };
  const PushToken = require('../models/PushToken');

  const tokens = await PushToken.find({ user: userId }).lean();
  if (tokens.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  const dead = [];
  for (const row of tokens) {
    try {
      const outcome = await sendToToken(row.token, payload);
      if (outcome === 'sent') sent += 1;
      if (outcome === 'dead') dead.push(row.token);
    } catch (err) {
      logger.warn(`Push to user ${userId} failed: ${err.message}`);
      break; // a token-exchange failure will fail for every token; stop early
    }
  }
  if (dead.length) await PushToken.deleteMany({ token: { $in: dead } });
  return { sent, removed: dead.length };
};

module.exports = { pushToUser, isPushConfigured, sendToToken };
