const { z } = require('zod');

/** Strong password: 8+ chars, upper, lower, digit. */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a digit');

const loginSchema = z.object({
  username: z.string().min(3).max(50).trim().toLowerCase(),
  password: z.string().min(1).max(128),
  deviceId: z.string().min(8).max(128),
  fingerprint: z.string().max(128).optional(),
  rememberMe: z.boolean().optional().default(false),
});

const refreshSchema = z.object({ refreshToken: z.string().optional() });
const logoutSchema = z.object({ forgetDevice: z.boolean().optional().default(false) });
const resetRequestSchema = z.object({
  username: z.string().min(3).max(50).trim().toLowerCase(),
  note: z.string().max(300).trim().optional().default(''),
});

const sendVerificationSchema = z.object({ email: z.string().email().max(200).optional() });
const verifyEmailSchema = z.object({ code: z.string().length(6) });
const setPasswordSchema = z.object({ password });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ email: z.string().email(), code: z.string().length(6), password });

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  preferences: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      emailNotifications: z.boolean().optional(),
      language: z.string().max(10).optional(),
    })
    .optional(),
});

// How the welcome tour ended. Only the fact is stored; the outcome is
// accepted so the client can say what happened without a second endpoint.
const tourSchema = z.object({ outcome: z.enum(['completed', 'skipped', 'declined']) });

module.exports = {
  tourSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  resetRequestSchema,
  sendVerificationSchema,
  verifyEmailSchema,
  setPasswordSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  passwordRule: password,
};
