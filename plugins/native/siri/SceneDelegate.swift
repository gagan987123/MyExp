import UIKit

/// Attaches the window created by AppDelegate to the connecting scene.
/// Required on the iOS 27 SDK, which traps at launch for apps that declare
/// no scene adoption (NoSceneLifecycleAdoption). The React Native view
/// hierarchy itself is still built by AppDelegate / ExpoReactNativeFactory.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let window = appDelegate.window
    else { return }
    window.windowScene = windowScene
    window.makeKeyAndVisible()
  }
}
