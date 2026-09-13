const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./auth.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate } = require('../../middleware/auth.js');

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

router.post('/register', validate(registerRules), controller.register);
router.post('/login', validate(loginRules), controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
