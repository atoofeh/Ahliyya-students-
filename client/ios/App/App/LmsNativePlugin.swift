import Capacitor
import CryptoKit
import Security
import UIKit

@objc(LmsNativePlugin)
public final class LmsNativePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentInteractionControllerDelegate {
    public let identifier = "LmsNativePlugin"
    public let jsName = "LmsNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise),
    ]

    private let keychainService = "com.alahliyya.lms.secure-store"
    private let deviceIdKey = "lms_device_id"
    private var observers: [NSObjectProtocol] = []
    private var captureCover: UIView?
    private var documentController: UIDocumentInteractionController?

    @objc func secureSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("key and value are required")
            return
        }
        do {
            try writeKeychain(value, account: key)
            call.resolve()
        } catch {
            call.reject("Secure store write failed")
        }
    }

    @objc func secureGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required")
            return
        }
        do {
            if let value = try readKeychain(account: key) {
                call.resolve(["value": value])
            } else {
                call.resolve(["value": NSNull()])
            }
        } catch {
            call.reject("Secure store read failed")
        }
    }

    @objc func secureRemove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required")
            return
        }
        let status = SecItemDelete(baseKeychainQuery(account: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Secure store delete failed")
            return
        }
        call.resolve()
    }

    @objc func deviceId(_ call: CAPPluginCall) {
        do {
            if let stored = try readKeychain(account: deviceIdKey) {
                call.resolve(["id": stored])
                return
            }

            // IDFV is scoped to this app vendor. Store only its hash in Keychain so
            // the binding survives reinstall and the raw identifier never leaves iOS.
            let source = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
            let value = sha256Hex("lms-device:\(source)")
            try writeKeychain(value, account: deviceIdKey)
            call.resolve(["id": value])
        } catch {
            call.reject("Could not create a stable device id")
        }
    }

    @objc func openFile(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("path"),
              let url = URL(string: rawPath), url.isFileURL else {
            call.reject("A local file URL is required")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, FileManager.default.fileExists(atPath: url.path),
                  self.bridge?.viewController != nil else {
                call.reject("File not found or no viewer is available")
                return
            }
            let controller = UIDocumentInteractionController(url: url)
            controller.delegate = self
            self.documentController = controller
            if controller.presentPreview(animated: true) {
                call.resolve()
            } else {
                self.documentController = nil
                call.reject("No viewer can open this file")
            }
        }
    }

    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("Could not open notification settings")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("Could not open notification settings") }
            }
        }
    }

    public func startScreenCaptureProtection() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: UIScreen.capturedDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.updateCaptureCover()
            self.notifyListeners("screenRecordingChanged", data: ["captured": UIScreen.main.isCaptured])
        })
        observers.append(center.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in self?.showCaptureCover() })
        observers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in self?.updateCaptureCover() })
        observers.append(center.addObserver(
            forName: UIApplication.userDidTakeScreenshotNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in self?.notifyListeners("screenshotDetected", data: [:]) })
        updateCaptureCover()
    }

    private func updateCaptureCover() {
        if UIApplication.shared.applicationState != .active || UIScreen.main.isCaptured {
            showCaptureCover()
        } else {
            captureCover?.removeFromSuperview()
            captureCover = nil
        }
    }

    private func showCaptureCover() {
        guard let window = bridge?.viewController?.view.window else { return }
        if captureCover == nil {
            let cover = UIView()
            cover.translatesAutoresizingMaskIntoConstraints = false
            cover.backgroundColor = UIColor(red: 18.0 / 255.0, green: 42.0 / 255.0, blue: 78.0 / 255.0, alpha: 1)

            let message = UILabel()
            message.translatesAutoresizingMaskIntoConstraints = false
            message.text = Locale.preferredLanguages.first?.hasPrefix("ar") == true
                ? "تم إيقاف عرض المحتوى أثناء تسجيل الشاشة"
                : "Content is hidden while the screen is recorded"
            message.textColor = .white
            message.font = .systemFont(ofSize: 18, weight: .semibold)
            message.textAlignment = .center
            message.numberOfLines = 0
            cover.addSubview(message)
            NSLayoutConstraint.activate([
                message.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: 28),
                message.trailingAnchor.constraint(equalTo: cover.trailingAnchor, constant: -28),
                message.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            ])
            captureCover = cover
            window.addSubview(cover)
            NSLayoutConstraint.activate([
                cover.leadingAnchor.constraint(equalTo: window.leadingAnchor),
                cover.trailingAnchor.constraint(equalTo: window.trailingAnchor),
                cover.topAnchor.constraint(equalTo: window.topAnchor),
                cover.bottomAnchor.constraint(equalTo: window.bottomAnchor),
            ])
        } else if let captureCover {
            window.bringSubviewToFront(captureCover)
        }
    }

    private func baseKeychainQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
    }

    private func readKeychain(account: String) throws -> String? {
        var query = baseKeychainQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw KeychainError.readFailed
        }
        return value
    }

    private func writeKeychain(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query = baseKeychainQuery(account: account)
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw KeychainError.writeFailed }

        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else {
            throw KeychainError.writeFailed
        }
    }

    private func sha256Hex(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    public func documentInteractionControllerViewControllerForPreview(
        _ controller: UIDocumentInteractionController
    ) -> UIViewController {
        bridge?.viewController ?? UIViewController()
    }

    public func documentInteractionControllerDidEndPreview(_ controller: UIDocumentInteractionController) {
        documentController = nil
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    private enum KeychainError: Error {
        case readFailed
        case writeFailed
    }
}
