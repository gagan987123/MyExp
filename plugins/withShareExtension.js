const fs = require("fs");
const path = require("path");
const { withXcodeProject } = require("@expo/config-plugins");
const loadTemplate = require("./loadTemplate");
const { app, share } = require("../config/config");

// Share-to-log: "Share → MyExp" on any receipt text / screenshot files
// the expense instantly (same shared SQLite file Siri writes to).
const SHARE_BUNDLE_ID = share.bundleId;
const TARGET_NAME = share.targetName;

// Foundation-only: unit-tested with `swift ShareParser.swift TestMain.swift`.
const SHARE_PARSER_SWIFT = loadTemplate("share/ShareParser.swift");

const SHARE_VC_SWIFT = loadTemplate("share/ShareViewController.swift");

const SHARE_INFO_PLIST = loadTemplate("share/MyExpShare-Info.plist");

const SHARE_ENTITLEMENTS = loadTemplate("share/MyExpShare.entitlements");

/**
 * Creates the MyExpShare Share extension target on every prebuild.
 * Mirrors withWidget: writes sources, creates the target once, then a
 * repair pass keeps BOTH Swift files in the share target's own Sources
 * phase and nowhere else.
 */
module.exports = function withShareExtension(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const dir = path.join(projectRoot, "ios", TARGET_NAME);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "ShareViewController.swift"),
      SHARE_VC_SWIFT
    );
    fs.writeFileSync(path.join(dir, "ShareParser.swift"), SHARE_PARSER_SWIFT);
    fs.writeFileSync(
      path.join(dir, "MyExpShare-Info.plist"),
      SHARE_INFO_PLIST
    );
    fs.writeFileSync(
      path.join(dir, "MyExpShare.entitlements"),
      SHARE_ENTITLEMENTS
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

    let shareUuid;
    if (!targetKey) {
      const created = project.addTarget(
        TARGET_NAME,
        "app_extension",
        TARGET_NAME,
        SHARE_BUNDLE_ID
      );
      shareUuid = created.uuid;
      const shareGroup = project.addPbxGroup([], TARGET_NAME, TARGET_NAME);
      for (const file of ["ShareViewController.swift", "ShareParser.swift"]) {
        project.addSourceFile(
          `${TARGET_NAME}/${file}`,
          { target: shareUuid },
          shareGroup.uuid
        );
      }

      const targetObj = objects.PBXNativeTarget[shareUuid] || {};
      const listUuid = targetObj.buildConfigurationList;
      const list = (objects.XCConfigurationList || {})[listUuid] || {};
      for (const entry of list.buildConfigurations || []) {
        const cfg = (objects.XCBuildConfiguration || {})[entry.value] || {};
        cfg.buildSettings = cfg.buildSettings || {};
        cfg.buildSettings.SWIFT_VERSION = '"5.0"';
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = `"${app.iosDeploymentTarget}"`;
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        cfg.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${TARGET_NAME}/${TARGET_NAME}.entitlements"`;
        cfg.buildSettings.APPLICATION_EXTENSION_API_ONLY = "YES";
        cfg.buildSettings.INFOPLIST_FILE = `"${TARGET_NAME}/${TARGET_NAME}-Info.plist"`;
      }
    } else {
      shareUuid = targetKey;
    }

    // Repair pass (always runs): both Swift files belong in the share
    // target's own Sources phase and nowhere else.
    const fresh = project.hash.project.objects;
    const makeUuid = () =>
      "0123456789ABCDEF".split("")
        .map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)])
        .join("")
        .slice(0, 24);
    const shareTarget = fresh.PBXNativeTarget[shareUuid] || null;
    if (shareTarget) {
      shareTarget.buildPhases = shareTarget.buildPhases || [];
      let hasSources = shareTarget.buildPhases.some(
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
        shareTarget.buildPhases.push({
          value: phaseUuid,
          comment: "Sources",
        });
        console.log(
          `[withShareExtension] created Sources phase ${phaseUuid.slice(0, 8)}`
        );
      }
    }
    let shareSourcesUuid = null;
    for (const ref of (shareTarget && shareTarget.buildPhases) || []) {
      if ((fresh.PBXSourcesBuildPhase || {})[ref.value]) {
        shareSourcesUuid = ref.value;
      }
    }
    if (shareSourcesUuid) {
      const wanted = ["ShareViewController.swift", "ShareParser.swift"];
      const fileRefKeys = Object.entries(fresh.PBXFileReference || {})
        .filter(
          ([k, r]) =>
            !k.endsWith("_comment") &&
            typeof r === "object" &&
            typeof r.path === "string" &&
            wanted.some((w) => r.path.includes(w))
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
        `[withShareExtension] repairing placement: ${buildFileKeys.length} entries → phase ${shareSourcesUuid.slice(0, 8)}`
      );
      // Dedup: one build entry per file wins.
      const seen = new Set();
      const drop = [];
      for (const bf of buildFileKeys) {
        const ref = fresh.PBXBuildFile[bf].fileRef;
        if (seen.has(ref)) drop.push(bf);
        else seen.add(ref);
      }
      for (const gone of drop) {
        delete fresh.PBXBuildFile[gone];
        delete fresh.PBXBuildFile[`${gone}_comment`];
      }
      for (const [phaseUuid, phase] of Object.entries(
        fresh.PBXSourcesBuildPhase || {}
      )) {
        if (phaseUuid.endsWith("_comment")) continue;
        if (phaseUuid === shareSourcesUuid) continue;
        phase.files = (phase.files || []).filter(
          (f) => !buildFileKeys.includes(f.value)
        );
      }
      const sharePhase = fresh.PBXSourcesBuildPhase[shareSourcesUuid];
      sharePhase.files = sharePhase.files || [];
      for (const bf of buildFileKeys) {
        if (drop.includes(bf)) continue;
        if (!sharePhase.files.some((f) => f.value === bf)) {
          sharePhase.files.push({ value: bf, comment: "share in Sources" });
        }
      }
    } else {
      console.log("[withShareExtension] WARNING: share Sources phase not found");
    }
    return config;
  });
};
