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
const { createSystemRoutes } = require("./routes/systemRoutes");
const { createAuthRoutes } = require("./routes/authRoutes");
const { createUserRoutes } = require("./routes/userRoutes");
const { createAuthenticateToken } = require("./middlewares/authenticateToken");
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
const userController = createUserController({
  pool,
  buildDbError,
  findFirstExistingColumn,
});
const authenticateToken = createAuthenticateToken(
  config.jwtSecret,
  isTokenBlacklisted,
);

app.use(createSystemRoutes(systemController, authenticateToken));
app.use(createAuthRoutes(authController, authenticateToken));
app.use(createUserRoutes(userController, authenticateToken));

module.exports = app;
