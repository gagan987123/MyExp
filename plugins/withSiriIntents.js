const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");
const loadTemplate = require("./loadTemplate");

const SCENE_DELEGATE_SWIFT = loadTemplate("siri/SceneDelegate.swift");

const ADD_EXPENSE_INTENT_SWIFT = loadTemplate("siri/AddExpenseIntent.swift");

const SHORTCUTS_SWIFT = loadTemplate("siri/MyExpShortcuts.swift");

const SWIFT_FILES = {
  "SceneDelegate.swift": SCENE_DELEGATE_SWIFT,
  "AddExpenseIntent.swift": ADD_EXPENSE_INTENT_SWIFT,
  "MyExpShortcuts.swift": SHORTCUTS_SWIFT,
};

/**
 * Writes our Swift sources into ios/<AppGroup>/ and adds them to the Xcode
 * target on every prebuild, so `npx expo prebuild` never drops them again.
 */
module.exports = function withSiriIntents(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;

    // Find the PBXGroup that contains AppDelegate.swift.
    const groups = project.hash.project.objects.PBXGroup || {};
    let appGroupKey = null;
    let appGroupName = null;
    for (const [key, group] of Object.entries(groups)) {
      if (key.endsWith("_comment")) continue;
      const children = group.children || [];
      const hasDelegate = children.some(
        (c) => c.comment && c.comment.includes("AppDelegate.swift")
      );
      if (hasDelegate) {
        appGroupKey = key;
        appGroupName = group.name;
        break;
      }
    }
    if (!appGroupKey) {
      console.warn("[withSiriIntents] App group not found, skipping.");
      return config;
    }

    const target = project.getFirstTarget().uuid;
    for (const [fileName, contents] of Object.entries(SWIFT_FILES)) {
      const filePath = path.join(
        projectRoot,
        "ios",
        appGroupName,
        fileName
      );
      fs.writeFileSync(filePath, contents);
      const alreadyAdded = Object.values(
        project.hash.project.objects.PBXFileReference || {}
      ).some(
        (ref) =>
          typeof ref === "object" &&
          ref.path &&
          ref.path.endsWith(fileName)
      );
      if (!alreadyAdded) {
        project.addSourceFile(
          `${appGroupName}/${fileName}`,
          { target },
          appGroupKey
        );
      }
    }
    return config;
  });
};
