const { Router } = require('express');
const { body } = require('express-validator');
const { rateLimit } = require('express-rate-limit');
const controller = require('./auth.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

const registerRules = [
  body('username').trim().notEmpty().withMessage('Username wajib diisi')
    .isLength({ min: 3, max: 50 }).withMessage('Username 3-50 karakter')
    .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Username hanya boleh huruf, angka, titik, underscore, dan strip'),
  body('email').trim().notEmpty().withMessage('Email wajib diisi')
    .isEmail().withMessage('Format email tidak valid')
    .isLength({ max: 150 }).withMessage('Email maksimal 150 karakter')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password wajib diisi')
    .isLength({ min: 8 }).withMessage('Password minimal 8 karakter'),
  body('fullName').trim().notEmpty().withMessage('Nama lengkap wajib diisi')
    .isLength({ max: 150 }).withMessage('Nama lengkap maksimal 150 karakter'),
];

const loginRules = [
  body('login').trim().notEmpty().withMessage('Username atau email wajib diisi'),
  body('password').notEmpty().withMessage('Password wajib diisi'),
];

// Bukan pendaftaran mandiri. Sejak boilerplate awal route ini terbuka untuk
// publik — pola aplikasi umum yang tidak cocok untuk ERP internal: siapa pun
// bisa membuat akun. Sekarang hanya pemegang user:create (super_admin) yang
// boleh membuat akun karyawan.
router.post('/register', authenticate, authorize('user:create'), validate(registerRules), controller.register);
// Membatasi tebak password. Login yang BERHASIL tidak dihitung, jadi pengguna
// yang benar tidak ikut terkunci karena orang lain salah ketik dari IP yang sama.
// Catatan deploy: di belakang reverse proxy, set app.set('trust proxy', 1) —
// tanpa itu semua pengguna terbaca satu IP (IP proxy) dan berbagi kuota.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit.' },
});

router.post('/login', loginLimiter, validate(loginRules), controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
