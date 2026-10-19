import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Generous limit so family members are never locked out
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in a few moments.'
  }
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 3000, // high throughput for gallery browsing
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.includes('/thumbnail') || req.path.includes('/original'),
  message: {
    success: false,
    error: 'Too many requests. Please slow down.'
  }
});

export const scanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Scan operation recently requested. Please wait before triggering another scan.'
  }
});
