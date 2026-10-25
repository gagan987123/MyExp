const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");
const loadTemplate = require("./loadTemplate");

const WIDGET_BUNDLE_ID = "com.gagan987123.myexp.widget";
const TARGET_NAME = "MyExpWidget";

const WIDGET_SWIFT = loadTemplate("widget/MyExpWidget.swift");

const WIDGET_INFO_PLIST = loadTemplate("widget/MyExpWidget-Info.plist");

const WIDGET_ENTITLEMENTS = loadTemplate("widget/MyExpWidget.entitlements");

/**
 * Creates the MyExpWidget WidgetKit extension target on every prebuild:
 * SwiftUI widget (small + medium) reading the shared SQLite file, plus
 * App Group entitlement. Re-runnable: skips creation if the target exists.
 */
module.exports = function withWidget(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const dir = path.join(projectRoot, "ios", "MyExpWidget");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "MyExpWidget.swift"), WIDGET_SWIFT);
    fs.writeFileSync(
      path.join(dir, "MyExpWidget-Info.plist"),
      WIDGET_INFO_PLIST
    );
    fs.writeFileSync(
      path.join(dir, "MyExpWidget.entitlements"),
      WIDGET_ENTITLEMENTS
    );

    const objects = project.hash.project.objects;
    const targets = objects.PBXNativeTarget || {};
    const targetKey = Object.keys(targets).find(
      (k) =>
        !k.endsWith("_comment") &&
        typeof targets[k] === "object" &&
        (targets[k].name === `"${TARGET_NAME}"` ||
          targets[k].name === TARGET_NAME)
    );

    let widgetUuid;
    if (!targetKey) {
      const created = project.addTarget(
        TARGET_NAME,
        "app_extension",
        TARGET_NAME,
        WIDGET_BUNDLE_ID
      );
      widgetUuid = created.uuid;
      const widgetGroup = project.addPbxGroup([], TARGET_NAME, TARGET_NAME);
      project.addSourceFile(
        `${TARGET_NAME}/MyExpWidget.swift`,
        { target: widgetUuid },
        widgetGroup.uuid
      );

      const targetObj = objects.PBXNativeTarget[widgetUuid] || {};
      const listUuid = targetObj.buildConfigurationList;
      const list = (objects.XCConfigurationList || {})[listUuid] || {};
      for (const entry of list.buildConfigurations || []) {
        const cfg = (objects.XCBuildConfiguration || {})[entry.value] || {};
        cfg.buildSettings = cfg.buildSettings || {};
        cfg.buildSettings.SWIFT_VERSION = '"5.0"';
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '"18.0"';
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${TARGET_NAME}/${TARGET_NAME}.entitlements"`;
        cfg.buildSettings.APPLICATION_EXTENSION_API_ONLY = "YES";
      }
    } else {
      widgetUuid = targetKey;
    }

    // Repair pass (always runs): every MyExpWidget.swift build entry belongs
    // in the widget target's own Sources phase and nowhere else. The xcode
    // lib otherwise drops new entries into the main target's phase.
    // NOTE: re-read the objects fresh — addTarget above may have replaced
    // the containers, making the earlier `objects` const stale.
    const fresh = project.hash.project.objects;
    const makeUuid = () =>
      "0123456789ABCDEF".split("")
        .map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)])
        .join("")
        .slice(0, 24);
    let widgetTarget = fresh.PBXNativeTarget[widgetUuid] || null;
    // Ensure the widget target owns a Sources phase (addTarget does not
    // create build phases, and expo may add them only after plugins run).
    if (widgetTarget) {
      widgetTarget.buildPhases = widgetTarget.buildPhases || [];
      let hasSources = widgetTarget.buildPhases.some(
        (r) => (fresh.PBXSourcesBuildPhase || {})[r.value]
      );
      if (!hasSources) {
        const phaseUuid = makeUuid();
        fresh.PBXSourcesBuildPhase = fresh.PBXSourcesBuildPhase || {};
        fresh.PBXSourcesBuildPhase[phaseUuid] = {
          isa: "PBXSourcesBuildPhase",
          buildActionMask: 2147483647,
          files: [],
          runOnlyForDeploymentPostprocessing: 0,
        };
        fresh.PBXSourcesBuildPhase[`${phaseUuid}_comment`] = "Sources";
        widgetTarget.buildPhases.push({
          value: phaseUuid,
          comment: "Sources",
        });
        console.log(
          `[withWidget] created Sources phase ${phaseUuid.slice(0, 8)}`
        );
      }
    }
    let widgetSourcesUuid = null;
    for (const ref of widgetTarget.buildPhases || []) {
      if ((fresh.PBXSourcesBuildPhase || {})[ref.value]) {
        widgetSourcesUuid = ref.value;
      }
    }
    if (widgetSourcesUuid) {
      const fileRefKeys = Object.entries(fresh.PBXFileReference || {})
        .filter(
          ([k, r]) =>
            !k.endsWith("_comment") &&
            typeof r === "object" &&
            typeof r.path === "string" &&
            r.path.includes("MyExpWidget.swift")
        )
        .map(([k]) => k);
      const buildFileKeys = Object.entries(fresh.PBXBuildFile || {})
        .filter(
          ([k, b]) =>
            !k.endsWith("_comment") &&
            typeof b === "object" &&
            fileRefKeys.includes(b.fileRef)
        )
        .map(([k]) => k);
      console.log(
        `[withWidget] repairing placement: ${buildFileKeys.length} entries → phase ${widgetSourcesUuid.slice(0, 8)}`
      );
      // Dedup: one build entry per file wins; extras cause duplicate-symbol
      // and duplicate-@main build failures.
      const keep = buildFileKeys.slice(0, 1);
      const drop = buildFileKeys.slice(1);
      for (const gone of drop) {
        delete fresh.PBXBuildFile[gone];
        delete fresh.PBXBuildFile[`${gone}_comment`];
      }
      for (const [phaseUuid, phase] of Object.entries(
        fresh.PBXSourcesBuildPhase || {}
      )) {
        if (phaseUuid.endsWith("_comment")) continue;
        if (phaseUuid === widgetSourcesUuid) continue;
        phase.files = (phase.files || []).filter(
          (f) => !buildFileKeys.includes(f.value)
        );
      }
      const widgetPhase = fresh.PBXSourcesBuildPhase[widgetSourcesUuid];
      widgetPhase.files = widgetPhase.files || [];
      for (const bf of keep) {
        if (!widgetPhase.files.some((f) => f.value === bf)) {
          widgetPhase.files.push({
            value: bf,
            comment: "MyExpWidget.swift in Sources",
          });
        }
      }
    } else {
      console.log("[withWidget] WARNING: widget Sources phase not found");
    }
    return config;
  });
};
