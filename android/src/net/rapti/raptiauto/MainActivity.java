package net.rapti.raptiauto;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.security.SecureRandom;
import java.net.URL;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * RaptiAuto host activity. The whole simulator UI is a web app bundled in
 * assets/www and served from a virtual https origin so that localStorage,
 * WebAudio and ES modules behave exactly like in a normal browser.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";

    private static final int REQ_CHOOSER = 101;
    private static final int REQ_OPEN = 102;
    private static final int REQ_SAVE = 103;

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> chooserCallback;
    private String pendingSaveContent;
    private String pendingSaveName;
    private String pendingOpenId;
    private boolean immersive = false;
    /** the blue of the splash screen: what the window shows until the page has drawn its own colours */
    private static final int SPLASH = Color.parseColor("#1D4BFF");
    /** View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR (API 26): dark buttons on a bright navigation bar */
    private static final int FLAG_LIGHT_NAVIGATION_BAR = 0x10;
    private boolean lightBars = false;
    private int lastKeyboardPx = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) pendingSaveName = savedInstanceState.getString("pendingSaveName");
        Window w = getWindow();
        w.setStatusBarColor(SPLASH);
        w.setNavigationBarColor(SPLASH);

        root = new FrameLayout(this);
        root.setBackgroundColor(SPLASH);
        web = new WebView(this);
        web.setBackgroundColor(SPLASH);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        // real web pages shown in the virtual Chromium may load http:// images and styles
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        web.addJavascriptInterface(new Bridge(), "RaptiNative");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());

        root.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override
            public void onGlobalLayout() {
                handleKeyboard();
                sendInsets();
            }
        });

        web.loadUrl(START_URL);
    }

    /* ------------------------------------------------------------------ */
    /* Asset server                                                       */
    /* ------------------------------------------------------------------ */

    private class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (u != null && HOST.equals(u.getHost())) {
                return serveAsset(u.getPath());
            }
            return super.shouldInterceptRequest(view, request);
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri u = Uri.parse(url);
            if (HOST.equals(u.getHost())) return false;
            openExternal(url);
            return true;
        }

        /**
         * The renderer died (e.g. out of memory): start the page again instead of crashing the app.
         * API 26+ (no @Override: the build compiles against API 23, where the method does not exist yet).
         */
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (web != null) {
                root.removeView(web);
                web.destroy();
                web = null;
            }
            recreate();
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            lastInsets = "";
            sendInsets();
        }
    }

    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.length() == 0 || "/".equals(path)) path = "/index.html";
        String assetPath = "www" + path;
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-cache");
        try {
            InputStream in = getAssets().open(assetPath);
            return new WebResourceResponse(mimeFor(path), "UTF-8", 200, "OK", headers, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers, null);
        }
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".wav")) return "audio/wav";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        return "application/octet-stream";
    }

    /* ------------------------------------------------------------------ */
    /* Chrome client: <input type=file> support                          */
    /* ------------------------------------------------------------------ */

    private class AppChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (chooserCallback != null) chooserCallback.onReceiveValue(null);
            chooserCallback = callback;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            try {
                startActivityForResult(i, REQ_CHOOSER);
            } catch (ActivityNotFoundException e) {
                chooserCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CHOOSER) {
            if (chooserCallback != null) {
                chooserCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                chooserCallback = null;
            }
        } else if (requestCode == REQ_SAVE) {
            boolean ok = false;
            // the system may have closed the app while the picker was open: the content waits in the cache
            if (pendingSaveContent == null) pendingSaveContent = readPendingSave();
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSaveContent != null) {
                try {
                    OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt");
                    out.write(pendingSaveContent.getBytes("UTF-8"));
                    out.close();
                    ok = true;
                } catch (Exception e) {
                    ok = false;
                }
            }
            js("RaptiApp.onNativeSaved(" + ok + "," + JSONObject.quote(pendingSaveName == null ? "" : pendingSaveName) + ")");
            pendingSaveContent = null;
            pendingSaveName = null;
            pendingSaveFile().delete();
        } else if (requestCode == REQ_OPEN) {
            String id = pendingOpenId == null ? "" : pendingOpenId;
            pendingOpenId = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try {
                    Uri uri = data.getData();
                    InputStream in = getContentResolver().openInputStream(uri);
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    int total = 0;
                    while ((n = in.read(buf)) > 0) {
                        bos.write(buf, 0, n);
                        total += n;
                        if (total > 8 * 1024 * 1024) break;
                    }
                    in.close();
                    String text = bos.toString("UTF-8");
                    String name = displayName(uri);
                    js("RaptiApp.onNativeFile(" + JSONObject.quote(id) + "," + JSONObject.quote(name == null ? "" : name)
                            + "," + JSONObject.quote(text) + ")");
                    return;
                } catch (Exception e) {
                    // fall through to failure callback
                }
            }
            js("RaptiApp.onNativeFile(" + JSONObject.quote(id) + ",null,null)");
        }
    }

    /* ------------------------------------------------------------------ */
    /* JavaScript bridge                                                  */
    /* ------------------------------------------------------------------ */

    /*
     * The bridge is visible to every frame, also to the sandboxed iframe in which real web pages run
     * (IoT tab, the Pi's Chromium). Only the app's own page knows this key: it asks for it once, as its
     * first script, before any iframe exists; every call with an effect must send it. The page is loaded
     * once per activity (a renderer crash recreates the activity, and so the key).
     */
    private final String bridgeKey = newKey();
    private volatile boolean keyTaken = false;

    private static String newKey() {
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xFF));
        return sb.toString();
    }

    private boolean trusted(String key) {
        return key != null && key.length() > 0 && key.equals(bridgeKey);
    }

    private class Bridge {
        /** The key for this page load; only the first caller (the app itself) gets it. */
        @JavascriptInterface
        public synchronized String handshake() {
            if (keyTaken) return "";
            keyTaken = true;
            return bridgeKey;
        }

        @JavascriptInterface
        public void setImmersive(final String key, final boolean on) {
            if (!trusted(key)) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    applyImmersive(on);
                }
            });
        }

        /** The page's colours for the status and navigation bars ("#rrggbb"); light = a bright theme, so the bar icons turn dark. */
        @JavascriptInterface
        public void setBars(final String key, final String status, final String nav, final boolean light) {
            if (!trusted(key)) return;
            final int s, n;
            try {
                s = Color.parseColor(status);
                n = Color.parseColor(nav);
            } catch (Exception e) {
                return;
            }
            runOnUiThread(new Runnable() {
                public void run() {
                    applyBars(s, n, light);
                }
            });
        }

        @JavascriptInterface
        public void keepScreenOn(final String key, final boolean on) {
            if (!trusted(key)) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void setOrientation(final String key, final String mode) {
            if (!trusted(key)) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    if ("landscape".equals(mode)) {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                    } else if ("portrait".equals(mode)) {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
                    } else {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                    }
                }
            });
        }

        @JavascriptInterface
        public void vibrate(final String key, int ms) {
            if (!trusted(key)) return;
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 500)));
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void saveFile(final String key, final String name, final String mime, final String content) {
            if (!trusted(key)) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingSaveContent = content;
                    pendingSaveName = name;
                    writePendingSave(content);
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    // a custom extension with a json / text type would be saved as "x.rapti.json" by some providers
                    String n = name == null ? "" : name.toLowerCase();
                    boolean own = n.endsWith(".rapti") || n.endsWith(".raptiplc") || n.endsWith(".ino");
                    i.setType(own || mime == null || mime.length() == 0 ? "application/octet-stream" : mime);
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        js("RaptiApp.onNativeSaved(false," + JSONObject.quote(name) + ")");
                    }
                }
            });
        }

        @JavascriptInterface
        public void openFile(final String key, final String id) {
            if (!trusted(key)) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingOpenId = id;
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    try {
                        startActivityForResult(i, REQ_OPEN);
                    } catch (ActivityNotFoundException e) {
                        js("RaptiApp.onNativeFile(" + JSONObject.quote(id) + ",null,null)");
                    }
                }
            });
        }

        @JavascriptInterface
        public void shareText(final String key, final String title, final String text) {
            if (!trusted(key)) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_SUBJECT, title);
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    try {
                        startActivity(Intent.createChooser(i, title));
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public void openUrl(final String key, final String url) {
            if (!trusted(key)) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    openExternal(url);
                }
            });
        }

        /**
         * A real HTTP request for the simulated internet (live data, real web pages), made here so
         * that CORS and mixed-content rules of the WebView do not apply. The answer comes back as
         * RaptiApp.onNativeHttp(id, {status, url, headers, body} | {error}).
         */
        @JavascriptInterface
        public void httpRequest(final String key, final String id, final String method, final String url, final String headersJson, final String body) {
            if (!trusted(key)) return;
            new Thread(new Runnable() {
                public void run() {
                    JSONObject out = new JSONObject();
                    HttpURLConnection c = null;
                    try {
                        String target = url;
                        String m = method == null || method.length() == 0 ? "GET" : method.toUpperCase();
                        int code = 0;
                        for (int hop = 0; hop < 6; hop++) {
                            URL u = new URL(target);
                            String proto = u.getProtocol();
                            if (!"http".equals(proto) && !"https".equals(proto)) throw new java.io.IOException("only http and https");
                            if (isLocalHost(u.getHost())) throw new java.io.IOException("local network addresses are blocked");
                            c = (HttpURLConnection) u.openConnection();
                            c.setInstanceFollowRedirects(false);
                            c.setConnectTimeout(8000);
                            c.setReadTimeout(12000);
                            c.setRequestMethod(m);
                            c.setRequestProperty("Accept-Encoding", "identity");
                            if (headersJson != null && headersJson.length() > 0) {
                                JSONObject hs = new JSONObject(headersJson);
                                Iterator<String> it = hs.keys();
                                while (it.hasNext()) {
                                    String k = it.next();
                                    String lk = k.toLowerCase();
                                    if (lk.equals("host") || lk.equals("content-length") || lk.equals("connection") || lk.equals("accept-encoding")) continue;
                                    c.setRequestProperty(k, hs.optString(k));
                                }
                            }
                            if (body != null && body.length() > 0 && !m.equals("GET") && !m.equals("HEAD")) {
                                c.setDoOutput(true);
                                OutputStream os = c.getOutputStream();
                                os.write(body.getBytes("UTF-8"));
                                os.close();
                            }
                            code = c.getResponseCode();
                            String loc = c.getHeaderField("Location");
                            if (code >= 300 && code < 400 && loc != null) {
                                target = new URL(new URL(target), loc).toString();
                                if (code == 303 || ((code == 301 || code == 302) && m.equals("POST"))) m = "GET";
                                c.disconnect();
                                continue;
                            }
                            break;
                        }
                        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                        ByteArrayOutputStream bos = new ByteArrayOutputStream();
                        if (in != null) {
                            byte[] buf = new byte[16384];
                            int n, total = 0;
                            while ((n = in.read(buf)) > 0) {
                                bos.write(buf, 0, n);
                                total += n;
                                if (total > 4 * 1024 * 1024) break;
                            }
                            in.close();
                        }
                        String type = c.getContentType();
                        String cs = "UTF-8";
                        if (type != null) {
                            int i = type.toLowerCase().indexOf("charset=");
                            if (i >= 0) cs = type.substring(i + 8).replace("\"", "").split(";")[0].trim();
                        }
                        String text;
                        try { text = bos.toString(cs); } catch (Exception e) { text = bos.toString("UTF-8"); }
                        JSONObject hs = new JSONObject();
                        for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                            if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                            hs.put(e.getKey().toLowerCase(), e.getValue().get(0));
                        }
                        out.put("status", code);
                        out.put("url", c.getURL().toString());
                        out.put("headers", hs);
                        out.put("body", text);
                    } catch (Exception e) {
                        try { out.put("error", e.getClass().getSimpleName() + ": " + e.getMessage()); } catch (Exception ignored) { }
                    } finally {
                        if (c != null) c.disconnect();
                    }
                    js("RaptiApp.onNativeHttp(" + JSONObject.quote(id) + "," + out.toString() + ")");
                }
            }).start();
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                return pi.versionName;
            } catch (Exception e) {
                return "1.0";
            }
        }

        @JavascriptInterface
        public boolean isNative() {
            return true;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Helpers                                                            */
    /* ------------------------------------------------------------------ */

    private void js(final String code) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript("try{" + code + "}catch(e){}", null);
            }
        });
    }

    private java.io.File pendingSaveFile() { return new java.io.File(getCacheDir(), "pending-save"); }

    private void writePendingSave(String content) {
        try {
            OutputStream o = new java.io.FileOutputStream(pendingSaveFile());
            o.write(content.getBytes("UTF-8"));
            o.close();
        } catch (Exception ignored) {
        }
    }

    private String readPendingSave() {
        try {
            java.io.File f = pendingSaveFile();
            if (!f.exists()) return null;
            InputStream in = new java.io.FileInputStream(f);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            return bos.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (pendingSaveName != null) out.putString("pendingSaveName", pendingSaveName);
    }

    /** The file name the user sees (a document Uri's last path segment is an id like "msf:1000000034"). */
    private String displayName(Uri uri) {
        String name = null;
        Cursor c = null;
        try {
            c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return name != null ? name : uri.getLastPathSegment();
    }

    /** True for addresses of the phone itself or its local network (the simulated internet stays outside). */
    private static boolean isLocalHost(String host) {
        try {
            for (InetAddress a : InetAddress.getAllByName(host)) {
                if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress()) return true;
                byte[] b = a.getAddress();
                if (b.length == 16 && (b[0] & 0xFE) == 0xFC) return true; // IPv6 unique local fc00::/7
                if (b.length == 4 && (b[0] & 0xFF) == 100 && (b[1] & 0xC0) == 64) return true; // carrier NAT 100.64/10
            }
        } catch (Exception e) {
            return false; // unknown host: the request itself reports the error
        }
        return false;
    }

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    /** Colours the system bars like the page. On a bright theme the bar icons turn dark (the navigation bar's from Android 8). */
    private void applyBars(int status, int nav, boolean light) {
        lightBars = light;
        if (light && Build.VERSION.SDK_INT < 26) nav = Color.parseColor("#0B1026"); // white buttons need a dark bar
        Window w = getWindow();
        w.setStatusBarColor(status);
        w.setNavigationBarColor(nav);
        root.setBackgroundColor(status);
        web.setBackgroundColor(status);
        if (!immersive) w.getDecorView().setSystemUiVisibility(barFlags());
    }

    private int barFlags() {
        int f = View.SYSTEM_UI_FLAG_VISIBLE;
        if (lightBars) {
            f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) f |= FLAG_LIGHT_NAVIGATION_BAR;
        }
        return f;
    }

    private void applyImmersive(boolean on) {
        immersive = on;
        Window w = getWindow();
        View decor = w.getDecorView();
        WindowManager.LayoutParams lp = w.getAttributes();
        try {
            // layoutInDisplayCutoutMode exists from API 28; set reflectively (SHORT_EDGES = 1)
            lp.getClass().getField("layoutInDisplayCutoutMode").setInt(lp, on ? 1 : 0);
            w.setAttributes(lp);
        } catch (Exception ignored) {
        }
        if (on) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } else {
            decor.setSystemUiVisibility(barFlags());
        }
        root.postDelayed(new Runnable() {
            public void run() {
                sendInsets();
            }
        }, 250);
    }

    private String lastInsets = "";

    /**
     * Tells the page how far system bars / the display cutout overlap the WebView, in CSS px.
     * Measured against the WebView's real position on screen, so it is 0 whenever the window
     * already lays the WebView out below the status bar (e.g. right after leaving immersive mode).
     */
    private void sendInsets() {
        if (web == null) return;
        float d = getResources().getDisplayMetrics().density;
        int top = 0, bottom = 0, left = 0, right = 0;
        try {
            View decor = getWindow().getDecorView();
            WindowInsets wi = decor.getRootWindowInsets();
            if (wi != null) {
                int st = 0, sb = 0, sl = 0, sr = 0;
                if (!immersive) {
                    // With hidden bars LAYOUT_STABLE still reports their size, so only use them when shown.
                    st = wi.getSystemWindowInsetTop();
                    sb = wi.getSystemWindowInsetBottom();
                    sl = wi.getSystemWindowInsetLeft();
                    sr = wi.getSystemWindowInsetRight();
                }
                try {
                    Object cut = wi.getClass().getMethod("getDisplayCutout").invoke(wi);
                    if (cut != null) {
                        st = Math.max(st, (Integer) cut.getClass().getMethod("getSafeInsetTop").invoke(cut));
                        sb = Math.max(sb, (Integer) cut.getClass().getMethod("getSafeInsetBottom").invoke(cut));
                        sl = Math.max(sl, (Integer) cut.getClass().getMethod("getSafeInsetLeft").invoke(cut));
                        sr = Math.max(sr, (Integer) cut.getClass().getMethod("getSafeInsetRight").invoke(cut));
                    }
                } catch (Exception ignored) {
                }
                int[] loc = new int[2];
                web.getLocationOnScreen(loc);
                int sw = decor.getWidth(), sh = decor.getHeight();
                top = Math.max(0, st - loc[1]);
                left = Math.max(0, sl - loc[0]);
                right = Math.max(0, sr - (sw - (loc[0] + web.getWidth())));
                bottom = Math.max(0, sb - (sh - (loc[1] + web.getHeight())));
            }
        } catch (Exception ignored) {
        }
        String args = Math.round(top / d) + "," + Math.round(right / d) + ","
                + Math.round(bottom / d) + "," + Math.round(left / d) + "," + immersive;
        if (args.equals(lastInsets)) return;
        lastInsets = args;
        js("RaptiApp.onNativeInsets(" + args + ")");
    }

    /** Keeps the WebView above the soft keyboard, also in immersive mode where adjustResize is ignored. */
    private void handleKeyboard() {
        if (web == null) return;
        Rect r = new Rect();
        root.getWindowVisibleDisplayFrame(r);
        int[] loc = new int[2];
        root.getLocationOnScreen(loc);
        int rootH = root.getHeight();
        int screenH = root.getRootView().getHeight();
        int kb = screenH - r.bottom;
        boolean visible = kb > screenH * 0.15;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
        int wanted = ViewGroup.LayoutParams.MATCH_PARENT;
        if (visible) {
            int avail = r.bottom - loc[1];
            if (avail > 0 && avail < rootH) wanted = avail;
        }
        if (lp.height != wanted) {
            lp.height = wanted;
            web.setLayoutParams(lp);
        }
        int kbCss = visible ? Math.round(kb / getResources().getDisplayMetrics().density) : 0;
        if (kbCss != lastKeyboardPx) {
            lastKeyboardPx = kbCss;
            js("RaptiApp.onNativeKeyboard(" + kbCss + ")");
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && immersive) applyImmersive(true);
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.RaptiApp&&RaptiApp.onBack)?String(RaptiApp.onBack()):'false'",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || !value.contains("true")) {
                            MainActivity.super.onBackPressed();
                        }
                    }
                });
    }

    @Override
    protected void onPause() {
        js("RaptiApp.onNativePause&&RaptiApp.onNativePause()");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        js("RaptiApp.onNativeResume&&RaptiApp.onNativeResume()");
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
