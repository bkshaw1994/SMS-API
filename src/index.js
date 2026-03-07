const app = require("./app");
const config = require("./config/env");

app.listen(config.port, config.host, () => {
  console.log(`SMS API running at http://localhost:${config.port}`);
});
