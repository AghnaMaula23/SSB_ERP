require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler, notFound } = require('./middleware/error.js');
const setupSwagger = require('./config/swagger-setup.js');

const app = express();

// Swagger API Docs
setupSwagger(app);

// Global Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Module Routes — uncomment as you build each module
app.use('/api/auth',               require('./modules/auth/auth.routes.js'));
app.use('/api/users',              require('./modules/user/user.routes.js'));
app.use('/api/roles',              require('./modules/role/role.routes.js'));
app.use('/api/permissions',        require('./modules/permission/permission.routes.js'));
// app.use('/api/projects',           require('./modules/project/project.routes.js'));
// app.use('/api/request-alat',       require('./modules/request-alat/request-alat.routes.js'));
// app.use('/api/request-material',   require('./modules/request-material/request-material.routes.js'));
// app.use('/api/approvals',          require('./modules/approval-center/approval.routes.js'));
app.use('/api/equipment',          require('./modules/divisi-alat/divisi-alat.routes.js'));
// app.use('/api/income',             require('./modules/income/income.routes.js'));
// app.use('/api/finance-field',      require('./modules/finance-field/finance-field.routes.js'));
// app.use('/api/finance-accounting', require('./modules/finance-accounting/finance-accounting.routes.js'));
// app.use('/api/payroll',            require('./modules/payroll/payroll.routes.js'));

// Error Handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => console.log(`[API] http://localhost:${PORT}`));

module.exports = app;
