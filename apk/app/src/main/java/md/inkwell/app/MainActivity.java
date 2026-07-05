package md.inkwell.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Inkwell companion app: a full-screen WebView that loads your self-hosted Inkwell
 * sync server. The address is configurable, so it works over LAN, Tailscale, or any
 * tunnel — not tied to one host. The web app itself keeps the live sync connection
 * (auto-reconnect on wake / network changes); this shell just hosts it and reloads
 * when the app comes back to the foreground so it re-syncs immediately.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "inkwell";
    private static final String KEY_URL = "server_url";

    private WebView web;
    private SharedPreferences prefs;
    private boolean loadedOnce = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // Inkwell persists notes/keys in localStorage
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        WebView.setWebContentsDebuggingEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return false; // keep all navigation inside the app
            }
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) showConnectError();
            }
        });

        setContentView(web);

        String url = prefs.getString(KEY_URL, "");
        if (url.isEmpty()) promptForServer(true);
        else load(url);
    }

    private void load(String url) {
        loadedOnce = true;
        web.loadUrl(url);
    }

    /** Ask for the server address (first run, or when the user chooses to change it). */
    private void promptForServer(final boolean firstRun) {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("http://192.168.1.20:8787");
        input.setText(prefs.getString(KEY_URL, "http://"));
        input.setSelection(input.getText().length());

        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Inkwell server")
                .setMessage("Enter the address your sync server printed on startup — a LAN IP, a Tailscale address, or a tunnel URL.")
                .setView(input)
                .setCancelable(!firstRun)
                .setPositiveButton("Connect", (d, w) -> {
                    String url = input.getText().toString().trim();
                    if (url.isEmpty()) { promptForServer(firstRun); return; }
                    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
                    prefs.edit().putString(KEY_URL, url).apply();
                    load(url);
                });
        if (!firstRun) b.setNegativeButton("Cancel", null);
        b.show();
    }

    private void showConnectError() {
        FrameLayout wrap = new FrameLayout(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad, pad, pad);
        TextView t = new TextView(this);
        t.setText("Can't reach your Inkwell server.\n\nMake sure `npm run sync` is running on your computer and this device can reach that address (same Wi-Fi, or over Tailscale / a tunnel).");
        t.setTextColor(Color.parseColor("#333333"));
        box.addView(t);
        wrap.addView(box);
        setContentView(wrap);

        new AlertDialog.Builder(this)
                .setTitle("Not connected")
                .setPositiveButton("Retry", (d, w) -> { setContentView(web); web.reload(); })
                .setNeutralButton("Change server", (d, w) -> { setContentView(web); promptForServer(false); })
                .setCancelable(true)
                .show();
    }

    /** Coming back to the foreground: reload so the web app re-syncs right away. */
    @Override
    protected void onResume() {
        super.onResume();
        if (loadedOnce && web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    /** Back at the vault root opens a small menu instead of quitting immediately. */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Inkwell")
                .setItems(new CharSequence[]{"Reload", "Change server", "Exit"}, (d, which) -> {
                    if (which == 0) web.reload();
                    else if (which == 1) promptForServer(false);
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
