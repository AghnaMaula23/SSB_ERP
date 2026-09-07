const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger.js');

/**
 * Setup Swagger UI di Express app
 * Akses di: http://localhost:3000/api-docs
 */
const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ConstructERP API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
    }
  }));

  // Endpoint untuk raw JSON spec (berguna untuk import ke Postman)
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });

  console.log('[SWAGGER] API Docs available at http://localhost:3000/api-docs');
};

module.exports = setupSwagger;
