const { validationResult } = require('express-validator');

/**
 * Jalankan daftar validator express-validator, lalu hentikan request
 * dengan 400 kalau ada yang gagal. Dipakai di routes:
 *   router.post('/', validate([ body('x').notEmpty() ]), controller.create)
 */
const validate = (validations) => {
  return async (req, res, next) => {
    for (const validation of validations) {
      await validation.run(req);
    }

    const result = validationResult(req);
    if (result.isEmpty()) return next();

    return res.status(400).json({
      success: false,
      message: 'Validasi gagal',
      errors: result.array().map(({ path, msg }) => ({ field: path, message: msg })),
    });
  };
};

module.exports = validate;
