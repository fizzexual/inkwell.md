package md.inkwell.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler;

/**
 * Inkwell for Android — LOCAL-FIRST, the way Obsidian works.
 *
 * The whole Inkwell web app is bundled inside this APK (under assets/) and served from a
 * secure in-app origin, so it opens instantly and works fully offline — no black screen if
 * the server is down. Your notes live locally; syncing to your self-hosted server happens in
 * the background (configured inside the app's Sync panel). Mixed content is allowed so the
 * secure app origin can reach a plain http:// sync server on your LAN / Tailscale.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = "https://appassets.androidplatform.net/index.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // Inkwell persists the vault + keys in localStorage
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // secure app origin -> plain-http sync server (LAN / Tailscale) must be allowed
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        WebView.setWebContentsDebuggingEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                // serve bundled app assets locally; everything else (the sync server) hits the network
                return loader.shouldInterceptRequest(req.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return false; // keep navigation in-app
            }
        });

        setContentView(web);
        web.loadUrl(APP_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Inkwell")
                .setItems(new CharSequence[]{"Reload", "Exit"}, (d, which) -> {
                    if (which == 0) web.reload();
                    else finish();
                })
                .show();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
