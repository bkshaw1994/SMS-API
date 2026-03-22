const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

const config = require("./config/env");
const pool = require("./db/pool");
const { buildDbError } = require("./utils/dbErrors");
const {
  findFirstExistingColumn,
  findExistingColumns,
} = require("./utils/schema");
const { getSwaggerSpec } = require("./docs/swagger");
const { createSystemController } = require("./controllers/systemController");
const { createAuthController } = require("./controllers/authController");
const { createUserController } = require("./controllers/userController");
const {
  createDashboardController,
} = require("./controllers/dashboard.controller");
const { createUserService } = require("./services/userService");
const { createDashboardService } = require("./services/dashboard.service");
const { createSystemRoutes } = require("./routes/systemRoutes");
const { createAuthRoutes } = require("./routes/authRoutes");
const { createUserRoutes } = require("./routes/userRoutes");
const { createDashboardRoutes } = require("./routes/dashboard.routes");
const { createAuthenticateToken } = require("./middlewares/authenticateToken");
const { createUserDb } = require("./db/userDb");
const { createEmailClient } = require("./utils/email");
const {
  createDashboardRepository,
} = require("./repositories/dashboard.repository");
const {
  createDashboardAuthMiddleware,
} = require("./middleware/auth.middleware");
const {
  addTokenToBlacklist,
  isTokenBlacklisted,
} = require("./utils/tokenBlacklist");

const app = express();
app.use(cors());
app.use(express.json());

const swaggerSpec = getSwaggerSpec(config.port);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/docs.json", (req, res) => {
  res.json(swaggerSpec);
});

const systemController = createSystemController({
  pool,
  buildDbError,
});
const authController = createAuthController({
  pool,
  buildDbError,
  findFirstExistingColumn,
  findExistingColumns,
  addTokenToBlacklist,
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
});
const userDb = createUserDb({
  pool,
  findFirstExistingColumn,
});
const emailClient = createEmailClient({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,
  user: config.smtpUser,
  pass: config.smtpPass,
  from: config.smtpFrom,
});
const userService = createUserService({
  userDb,
  emailClient,
  resetPasswordBaseUrl: config.resetPasswordBaseUrl,
  passwordSaltRounds: config.passwordSaltRounds,
});
const dashboardRepository = createDashboardRepository({
  pool,
  findFirstExistingColumn,
});
const dashboardService = createDashboardService({
  dashboardRepository,
});
const userController = createUserController({
  pool,
  buildDbError,
  findFirstExistingColumn,
  userService,
});
const dashboardController = createDashboardController({
  dashboardService,
  buildDbError,
});
const authenticateToken = createAuthenticateToken(
  config.jwtSecret,
  isTokenBlacklisted,
);
const dashboardAuthMiddleware = createDashboardAuthMiddleware({
  jwtSecret: config.jwtSecret,
  dashboardRepository,
});

app.use(createSystemRoutes(systemController, authenticateToken));
app.use(createAuthRoutes(authController, authenticateToken));
app.use(createUserRoutes(userController, authenticateToken));
app.use(createDashboardRoutes(dashboardController, dashboardAuthMiddleware));

module.exports = app;
