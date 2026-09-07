const { Router } = require('express');
const controller = require('./auth.controller.js');
const { authenticate } = require('../../middleware/auth.js');

const router = Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
