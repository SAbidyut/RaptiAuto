package net.rapti.raptiauto;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
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
import java.util.HashMap;
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
    private int lastKeyboardPx = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#070B16"));
        w.setNavigationBarColor(Color.parseColor("#070B16"));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#070B16"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#070B16"));
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

        web.addJavascriptInterface(new Bridge(), "RaptiNative");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());

        root.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override
            public void onGlobalLayout() {
                handleKeyboard();
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

        @Override
        public void onPageFinished(WebView view, String url) {
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
                    String name = uri.getLastPathSegment();
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

    private class Bridge {
        @JavascriptInterface
        public void setImmersive(final boolean on) {
            runOnUiThread(new Runnable() {
                public void run() {
                    applyImmersive(on);
                }
            });
        }

        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void setOrientation(final String mode) {
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
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 500)));
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String content) {
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingSaveContent = content;
                    pendingSaveName = name;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime == null || mime.length() == 0 ? "application/octet-stream" : mime);
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
        public void openFile(final String id) {
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
        public void shareText(final String title, final String text) {
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
        public void openUrl(final String url) {
            runOnUiThread(new Runnable() {
                public void run() {
                    openExternal(url);
                }
            });
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

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                public void run() {
                    finish();
                }
            });
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

    private void openExternal(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
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
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
        root.postDelayed(new Runnable() {
            public void run() {
                sendInsets();
            }
        }, 250);
    }

    private void sendInsets() {
        float d = getResources().getDisplayMetrics().density;
        int top = 0, bottom = 0, left = 0, right = 0;
        try {
            WindowInsets wi = getWindow().getDecorView().getRootWindowInsets();
            if (wi != null && immersive) {
                Object cut = wi.getClass().getMethod("getDisplayCutout").invoke(wi);
                if (cut != null) {
                    top = (Integer) cut.getClass().getMethod("getSafeInsetTop").invoke(cut);
                    bottom = (Integer) cut.getClass().getMethod("getSafeInsetBottom").invoke(cut);
                    left = (Integer) cut.getClass().getMethod("getSafeInsetLeft").invoke(cut);
                    right = (Integer) cut.getClass().getMethod("getSafeInsetRight").invoke(cut);
                }
            }
        } catch (Exception ignored) {
        }
        js("RaptiApp.onNativeInsets(" + Math.round(top / d) + "," + Math.round(right / d) + ","
                + Math.round(bottom / d) + "," + Math.round(left / d) + "," + immersive + ")");
    }

    /** Keeps the WebView above the soft keyboard, also in immersive mode where adjustResize is ignored. */
    private void handleKeyboard() {
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
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
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
