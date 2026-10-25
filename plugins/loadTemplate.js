const fs = require("fs");
const path = require("path");

/** Read a native source template shipped next to the config plugins. */
function loadTemplate(relativePath) {
  return fs.readFileSync(path.join(__dirname, "native", relativePath), "utf8");
}

module.exports = loadTemplate;
