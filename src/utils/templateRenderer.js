const fs = require("fs");
const path = require("path");

function renderTemplate(templateName, data = {}) {
  const templatePath = path.join(__dirname, "..", "templates", templateName);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  let template = fs.readFileSync(templatePath, "utf8");
  for (const key in data) {
    template = template.replace(new RegExp(`{{${key}}}`, "g"), data[key]);
  }
  return template;
}

module.exports = { renderTemplate };
