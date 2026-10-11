import Capacitor

@objc(LmsBridgeViewController)
final class LmsBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        let plugin = LmsNativePlugin()
        bridge?.registerPluginInstance(plugin)
        plugin.startScreenCaptureProtection()
    }
}
