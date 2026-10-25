const config = require("./config/config");

module.exports = {
  expo: {
    name: config.app.name,
    slug: config.app.slug,
    version: config.app.version,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: config.app.scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: config.app.bundleId,
      infoPlist: {
        LSApplicationQueriesSchemes: [
          "upi",
          "phonepe",
          "tez",
          "paytmmp",
          "whatsapp",
        ],
        UIApplicationSceneManifest: {
          UIApplicationSupportsMultipleScenes: false,
          UISceneConfigurations: {
            UIWindowSceneSessionRoleApplication: [
              {
                UISceneConfigurationName: "Default Configuration",
                UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
              },
            ],
          },
        },
      },
      deploymentTarget: config.app.iosDeploymentTarget,
      entitlements: {
        "com.apple.security.application-groups": [config.appGroup],
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: config.app.androidPackage,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-splash-screen",
      "expo-sqlite",
      "./plugins/withSiriIntents",
      "./plugins/withWidget",
      "./plugins/withShareExtension",
      "expo-secure-store",
      "expo-sharing",
      [
        "expo-build-properties",
        {
          ios: {
            usePrecompiledModules: config.build.usePrecompiledModules,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  },
};
