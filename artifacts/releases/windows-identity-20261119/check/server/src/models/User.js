const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, USER_STATUS } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 50 },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.STUDENT },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
    avatar: { type: String, default: null }, // stored image asset id

    // Token/session control
    // Exempts this account from "one account, one authorized device". Granted by
    // the owner only; sessions stay pinned to their own device either way.
    allowMultipleDevices: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    mustChangePassword: { type: Boolean, default: false },

    // Email verification & password reset (hashed one-time codes)
    emailVerified: { type: Boolean, default: false },
    emailVerifyCodeHash: { type: String, default: null, select: false },
    emailVerifyExpires: { type: Date, default: null, select: false },
    passwordResetCodeHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
    passwordChangedAt: { type: Date, default: null },

    // Brute-force lockout
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    // Preferences
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      emailNotifications: { type: Boolean, default: true },
      language: { type: String, default: 'en' },
    },

    lastLoginAt: { type: Date, default: null },
    // When the student answered the welcome tour — took it, skipped it, or said
    // they were not new. Asked once per account, not once per device: a phone
    // reinstall must not make a returning student sit through it again.
    tourCompletedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null }, // soft delete
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ deletedAt: 1 });
userSchema.index({ name: 'text', username: 'text', email: 'text' });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    username: this.username,
    email: this.email,
    role: this.role,
    status: this.status,
    avatar: this.avatar,
    emailVerified: this.emailVerified,
    mustChangePassword: this.mustChangePassword,
    preferences: this.preferences,
    lastLoginAt: this.lastLoginAt,
    tourCompletedAt: this.tourCompletedAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
