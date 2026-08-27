package com.alahliyya.lms;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

/**
 * The app's only custom native surface. Three jobs, no third-party dependencies:
 *
 *  1. Secure storage — the refresh token is encrypted with an AES-256-GCM key that
 *     is generated inside the AndroidKeyStore and cannot be exported, then kept as
 *     "base64(iv):base64(ciphertext)" in private SharedPreferences. Extracting the
 *     preferences file off a rooted device yields ciphertext the device's hardware
 *     key must unwrap.
 *
 *  2. Device identity — the platform enforces one authorised device per account, so
 *     the id must survive an app reinstall or every reinstall would need an admin
 *     device reset. ANDROID_ID is already scoped per app-signing-key and per user;
 *     it is hashed here so the raw value never crosses the JS bridge or the network.
 *
 *  3. Opening a downloaded document through a FileProvider, so course PDFs can be
 *     handed to the system viewer without ever becoming world-readable files.
 */
@CapacitorPlugin(name = "LmsNative")
public class LmsNativePlugin extends Plugin {

    private static final String PREFS = "lms_secure_store";
    private static final String KEY_ALIAS = "lms_secure_store_v1";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final String DEVICE_ID_KEY = "device_id_fallback";
    /** Emulators and a well-known 2011 firmware bug hand out this ANDROID_ID to everyone. */
    private static final String BAD_ANDROID_ID = "9774d56d682e549c";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Fetches the Keystore key, generating it on first use. Never leaves the secure hardware. */
    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }

    private String encrypt(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
            + ":"
            + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
    }

    private String decrypt(String stored) throws Exception {
        int separator = stored.indexOf(':');
        if (separator < 0) return null;
        byte[] iv = Base64.decode(stored.substring(0, separator), Base64.NO_WRAP);
        byte[] ciphertext = Base64.decode(stored.substring(separator + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            prefs().edit().putString(key, encrypt(value)).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Secure store write failed");
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        JSObject result = new JSObject();
        String stored = prefs().getString(key, null);
        if (stored == null) {
            result.put("value", null);
            call.resolve(result);
            return;
        }
        try {
            result.put("value", decrypt(stored));
        } catch (Exception e) {
            // A key rotation (app data cleared, device restored) makes old ciphertext
            // undecryptable. Drop it and report empty rather than wedging the login.
            prefs().edit().remove(key).apply();
            result.put("value", null);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        prefs().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void deviceId(PluginCall call) {
        JSObject result = new JSObject();
        result.put("id", stableDeviceId());
        call.resolve(result);
    }

    private String stableDeviceId() {
        String androidId = Settings.Secure.getString(
            getContext().getContentResolver(),
            Settings.Secure.ANDROID_ID
        );

        String source;
        if (androidId == null || androidId.isEmpty() || BAD_ANDROID_ID.equals(androidId)) {
            // No usable platform id: fall back to a UUID kept in the same encrypted store.
            String stored = prefs().getString(DEVICE_ID_KEY, null);
            if (stored != null) {
                try {
                    return decrypt(stored);
                } catch (Exception ignored) {
                    // fall through and mint a new one
                }
            }
            source = UUID.randomUUID().toString();
            String minted = sha256Hex("lms-device:" + source);
            try {
                prefs().edit().putString(DEVICE_ID_KEY, encrypt(minted)).apply();
            } catch (Exception ignored) {
                // Unstable id is better than no login at all; the user may need a device reset.
            }
            return minted;
        }

        source = androidId;
        return sha256Hex("lms-device:" + source);
    }

    private String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            // SHA-256 is guaranteed present on every Android device; this is unreachable.
            return UUID.randomUUID().toString().replace("-", "");
        }
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String path = call.getString("path");
        String mime = call.getString("mime", "application/octet-stream");
        if (path == null) {
            call.reject("path is required");
            return;
        }

        File file = new File(Uri.parse(path).getPath() == null ? path : Uri.parse(path).getPath());
        if (!file.exists()) {
            call.reject("File not found");
            return;
        }

        try {
            Uri content = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(content, mime);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No app can open this file");
        }
    }
}
