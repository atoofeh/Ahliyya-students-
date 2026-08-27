package com.alahliyya.lms;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LmsNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Course video and quiz content are the product. FLAG_SECURE makes the window
        // invisible to screenshots, screen recorders and casting at the OS level —
        // something the browser client cannot do. It does not defeat a camera pointed
        // at the screen or a rooted device; see docs/SECURITY.md.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
