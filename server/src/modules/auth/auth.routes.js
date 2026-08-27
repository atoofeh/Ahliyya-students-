const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const { validate } = require('../../middleware/validate');
const {
  loginIpLimiter, loginAccountLimiter, refreshLimiter, passwordLimiter, verificationLimiter,
  resetRequestIpLimiter, resetRequestAccountLimiter,
} = require('../../middleware/rateLimiters');
const { requireAllowedOrigin } = require('../../middleware/security');
const v = require('./auth.validators');
const c = require('./auth.controller');

// Public
router.post('/login', loginIpLimiter, loginAccountLimiter, validate(v.loginSchema), c.login);
router.post('/refresh', refreshLimiter, requireAllowedOrigin, validate(v.refreshSchema), c.refresh);
router.post('/forgot-password', passwordLimiter, validate(v.forgotPasswordSchema), c.forgotPassword);
router.post('/reset-password', passwordLimiter, validate(v.resetPasswordSchema), c.resetPassword);
router.post('/device/reset-request', resetRequestIpLimiter, resetRequestAccountLimiter, validate(v.resetRequestSchema), c.requestDeviceReset);

// Authenticated
router.use(authenticate);
router.post('/logout', requireAllowedOrigin, validate(v.logoutSchema), c.logout);
router.get('/device', c.myDevice);
router.get('/me', c.me);
router.patch('/me', validate(v.updateProfileSchema), c.updateProfile);
router.post('/resend-verification', verificationLimiter, validate(v.sendVerificationSchema), c.sendVerification);
router.post('/verify-email', verificationLimiter, validate(v.verifyEmailSchema), c.verifyEmail);
router.post('/set-password', validate(v.setPasswordSchema), c.setPassword);
router.post('/change-password', passwordLimiter, validate(v.changePasswordSchema), c.changePassword);
router.get('/sessions', c.mySessions);
router.get('/login-history', c.myLoginHistory);

module.exports = router;
