const asyncHandler = require('../../core/asyncHandler');
const AuthService = require('./auth.service');
const DeviceService = require('./device.service');
const env = require('../../config/env');

/**
 * Refresh tokens are delivered via httpOnly cookie (primary) and response
 * body (fallback for clients where third-party cookies are blocked).
 */
const REFRESH_COOKIE = 'lms_refresh';

const cookieOptions = (rememberMe) => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000,
});

const clientIp = (req) => req.ip || req.socket?.remoteAddress || '';

const login = asyncHandler(async (req, res) => {
  const { username, password, deviceId, fingerprint, rememberMe } = req.body;
  const result = await AuthService.login({
    username,
    password,
    deviceId: deviceId || req.headers['x-device-id'],
    fingerprint: fingerprint || req.headers['x-fingerprint'],
    rememberMe,
    userAgent: req.headers['user-agent'] || '',
    ip: clientIp(req),
    platform: DeviceService.normalizePlatform(req.headers['x-client-platform']),
    appVersion: String(req.headers['x-app-version'] || '').slice(0, 40),
  });
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(rememberMe));
  res.json({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  const result = await AuthService.refresh(token, { ip: clientIp(req) });
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(false));
  res.json(result);
});

const logout = asyncHandler(async (req, res) => {
  await AuthService.logout(req.session._id, req.user.id, clientIp(req));
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.json({ message: 'Logged out' });
});

const me = asyncHandler(async (req, res) => {
  res.json(await AuthService.getProfile(req.user.id));
});

const updateProfile = asyncHandler(async (req, res) => {
  res.json(await AuthService.updateProfile(req.user.id, req.body));
});

const sendVerification = asyncHandler(async (req, res) => {
  const result = await AuthService.sendVerificationCode(req.user.id, req.body.email);
  res.json({ message: `Verification code sent to ${result.email}` });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const user = await AuthService.verifyEmail(req.user.id, req.body.code, clientIp(req));
  res.json(user);
});

const setPassword = asyncHandler(async (req, res) => {
  const user = await AuthService.setPassword(req.user.id, req.body.password, clientIp(req));
  res.json(user);
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await AuthService.changePassword(
    req.user.id, req.body.currentPassword, req.body.newPassword, req.session._id, clientIp(req)
  );
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(false));
  res.json(result);
});

const forgotPassword = asyncHandler(async (req, res) => {
  await AuthService.requestPasswordReset(req.body.email, clientIp(req));
  res.json({ message: 'If that email exists, a reset code has been sent.' });
});

const resetPassword = asyncHandler(async (req, res) => {
  await AuthService.resetPassword(req.body.email, req.body.code, req.body.password, clientIp(req));
  res.json({ message: 'Password reset. You can now log in.' });
});

const mySessions = asyncHandler(async (req, res) => {
  res.json(await AuthService.getSessions(req.user.id, req.session._id));
});

const myLoginHistory = asyncHandler(async (req, res) => {
  res.json(await AuthService.getLoginHistory(req.user.id));
});

module.exports = {
  login, refresh, logout, me, updateProfile,
  sendVerification, verifyEmail, setPassword, changePassword,
  forgotPassword, resetPassword, mySessions, myLoginHistory,
};
