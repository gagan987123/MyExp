/**
 * Single source of truth for identity, native targets, shared storage and AI.
 * Imported by app.config.js, the config plugins, and app code (config/index.ts).
 * Plain CommonJS so Node (prebuild) and Metro can both load it.
 */

const BUNDLE_ID = "com.gagan987123.myexp";

module.exports = {
  app: {
    name: "MyExp - Expense Tracker",
    slug: "myexp-expense-tracker",
    scheme: "expensetracker",
    version: "1.0.0",
    bundleId: BUNDLE_ID,
    androidPackage: BUNDLE_ID,
    iosDeploymentTarget: "18.0",
  },
  build: {
    usePrecompiledModules: false,
  },
  appGroup: `group.${BUNDLE_ID}`,
  database: {
    name: "expenses.db",
    version: 10,
  },
  widget: {
    targetName: "MyExpWidget",
    bundleId: `${BUNDLE_ID}.widget`,
    kind: "MyExpWidget",
  },
  share: {
    targetName: "MyExpShare",
    bundleId: `${BUNDLE_ID}.share`,
  },
  ai: {
    endpoint: "https://openrouter.ai/api/alpha/decisions",
    keyUrl: "https://openrouter.ai/api/v1/key",
    secureKeyItem: "openrouter_api_key",
    secureEnabledItem: "ai_siri_enabled",
    kvKeyItem: "ai-key",
    kvEnabledItem: "ai-enabled",
    model: "typesafe/jev-1.13",
    minConfidence: 0.7,
  },
};
