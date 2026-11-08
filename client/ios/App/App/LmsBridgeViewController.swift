import Capacitor

@objc(LmsBridgeViewController)
final class LmsBridgeViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        let plugin = LmsNativePlugin()
        bridge?.registerPluginInstance(plugin)
        plugin.startScreenCaptureProtection()
    }
}
