const fs = require("fs");
const path = require("path");
const config = require("../config/config");

const VARS = {
  APP_GROUP_ID: config.appGroup,
  DATABASE_NAME: config.database.name,
  AI_ENDPOINT: config.ai.endpoint,
  AI_MODEL: config.ai.model,
  WIDGET_KIND: config.widget.kind,
  AI_KV_KEY: config.ai.kvKeyItem,
  AI_KV_ENABLED: config.ai.kvEnabledItem,
};

/** Read a native source template and fill its {{TOKEN}} placeholders. */
function loadTemplate(relativePath, extraVars = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, "native", relativePath),
    "utf8"
  );
  const vars = { ...VARS, ...extraVars };
  return source.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) {
      throw new Error(
        `[loadTemplate] missing {{${key}}} in native/${relativePath}`
      );
    }
    return vars[key];
  });
}

module.exports = loadTemplate;
