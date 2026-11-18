using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>
    /// Main simulator window. Hosts the web UI inside WebView2, serves the local
    /// <c>web\</c> folder over a virtual HTTPS origin (required for ES modules and
    /// import maps), and connects the web application's storage requests to
    /// per-user JSON files on disk.
    /// </summary>
    internal sealed class MainForm : Form
    {
        private const string VirtualHostName = "app.idt.local";
        private const string StartUrl = "https://app.idt.local/index.html";
        private const string BrowserArguments = "--disable-features=msWebOOUI,msPdfOOUI";

        /// <summary>
        /// Document-created helper that forwards shell keyboard shortcuts from the
        /// page to the host. Needed because the WinForms WebView2 wrapper does not
        /// expose CoreWebView2Controller/AcceleratorKeyPressed.
        /// </summary>
        private const string ShellKeyboardScript =
            "(function () {\n" +
            "  try {\n" +
            "    if (window.__IDT_SHELL_KEYS_INSTALLED__) { return; }\n" +
            "    window.__IDT_SHELL_KEYS_INSTALLED__ = true;\n" +
            "    window.addEventListener('keydown', function (event) {\n" +
            "      if (!event || event.repeat) { return; }\n" +
            "      var key = event.key;\n" +
            "      if (key !== 'F11' && key !== 'Escape' && key !== 'F12') { return; }\n" +
            "      if (!window.chrome || !window.chrome.webview) { return; }\n" +
            "      if (key === 'F11' || key === 'F12') { event.preventDefault(); }\n" +
            "      window.chrome.webview.postMessage({ channel: 'idt-shell', action: 'accelerator', key: key });\n" +
            "    }, true);\n" +
            "  } catch (error) { /* keyboard forwarding is best-effort */ }\n" +
            "})();\n";

        private readonly WebView2 _webView;
        private readonly ConfigStore _configStore;
        private readonly StorageBridge _storageBridge;
        private readonly string _webRoot;

        private bool _initializationStarted;
        private bool _closing;
        private bool _showingErrorPage;

        private bool _fullScreen;
        private bool _darkTitleBar = true;
        private FormBorderStyle _savedBorderStyle = FormBorderStyle.Sizable;
        private FormWindowState _savedWindowState = FormWindowState.Normal;
        private Rectangle _savedBounds;

        public MainForm()
        {
            _configStore = new ConfigStore();
            _webRoot = Path.Combine(AppContext.BaseDirectory, "web");
            _storageBridge = new StorageBridge(_configStore, PostToWebView);

            SuspendLayout();

            Text = Program.AppTitle;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1600, 900);
            MinimumSize = new Size(1280, 720);
            BackColor = Color.FromArgb(7, 11, 20);
            Icon = AppResources.LoadAppIcon();
            KeyPreview = true;
            DoubleBuffered = true;

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(7, 11, 20)
            };
            _webView.CoreWebView2InitializationCompleted += OnCoreWebView2InitializationCompleted;
            Controls.Add(_webView);

            Load += OnFormLoad;
            FormClosing += OnFormClosing;
            ResumeLayout(false);
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            ClampToWorkingArea();
            TitleBarTheme.Apply(this, _darkTitleBar);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            TitleBarTheme.Apply(this, _darkTitleBar);
        }

        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);

            // DWM may reset the non-client title bar after composition changes
            // (theme switch, remote session, GPU reset): re-apply the dark chrome.
            if (m.Msg == 0x031E) // WM_DWMCOMPOSITIONCHANGED
            {
                TitleBarTheme.Apply(this, _darkTitleBar);
            }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.F11)
            {
                ToggleFullScreen();
                return true;
            }

            if (keyData == Keys.Escape && _fullScreen)
            {
                ExitFullScreen();
                return true;
            }

            if (keyData == Keys.F12)
            {
                OpenDevTools();
                return true;
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }

        private async void OnFormLoad(object sender, EventArgs e)
        {
            if (_initializationStarted)
            {
                return;
            }

            _initializationStarted = true;
            try
            {
                await InitializeWebViewAsync();
            }
            catch (Exception ex)
            {
                ShellLog.Error("WebView2 initialization failed.", ex);
                ShowInitializationFailure(ex);
            }
        }

        /// <summary>
        /// Diagnostics hook: set the IDT_DEBUG_PORT environment variable to expose the
        /// WebView2 DevTools endpoint for automated UI verification. Disabled by default
        /// so a shipped build never opens a debugging port.
        /// </summary>
        private static string ResolveBrowserArguments()
        {
            string arguments = BrowserArguments;
            string port = Environment.GetEnvironmentVariable("IDT_DEBUG_PORT");
            int parsed;
            if (!string.IsNullOrWhiteSpace(port) && int.TryParse(port, out parsed) && parsed > 0 && parsed < 65536)
            {
                arguments += " --remote-debugging-port=" + parsed;
                ShellLog.Info("Diagnostics port enabled on 127.0.0.1:" + parsed);
            }
            return arguments;
        }

        private async Task InitializeWebViewAsync()
        {
            string webViewDataFolder = _configStore.WebView2DataDirectory;
            try
            {
                Directory.CreateDirectory(webViewDataFolder);
            }
            catch (Exception ex)
            {
                ShellLog.Warn("Unable to create the WebView2 data folder: " + ex.Message);
                webViewDataFolder = null; // let WebView2 use its default per-user folder
            }

            var options = new CoreWebView2EnvironmentOptions(ResolveBrowserArguments());
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                null,
                webViewDataFolder,
                options);

            if (_closing)
            {
                return;
            }

            await _webView.EnsureCoreWebView2Async(environment);
        }

        private async void OnCoreWebView2InitializationCompleted(
            object sender,
            CoreWebView2InitializationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                Exception error = e.InitializationException ?? new InvalidOperationException("WebView2 initialization failed.");
                ShellLog.Error("WebView2 initialization completed with errors.", error);
                ShowInitializationFailure(error);
                return;
            }

            try
            {
                CoreWebView2 core = _webView.CoreWebView2;
                if (core == null || _closing)
                {
                    return;
                }

                ConfigureSettings(core);
                core.NavigationStarting += OnNavigationStarting;
                core.NavigationCompleted += OnNavigationCompleted;
                core.NewWindowRequested += OnNewWindowRequested;
                core.ProcessFailed += OnProcessFailed;
                core.WebMessageReceived += OnHostMessageReceived;
                _storageBridge.Attach(core);

                // Expose persisted configuration to the page before any script runs.
                try
                {
                    string bootScript = _configStore.CreateBootScript();
                    await core.AddScriptToExecuteOnDocumentCreatedAsync(bootScript);
                    await core.AddScriptToExecuteOnDocumentCreatedAsync(ShellKeyboardScript);
                }
                catch (Exception ex)
                {
                    ShellLog.Error("Unable to inject the boot configuration script.", ex);
                }

                if (_closing)
                {
                    return;
                }

                if (!Directory.Exists(_webRoot))
                {
                    ShellLog.Warn("Web assets folder not found: " + _webRoot);
                    ShowErrorPage(BuildMissingAssetsHtml());
                    return;
                }

                try
                {
                    core.SetVirtualHostNameToFolderMapping(
                        VirtualHostName,
                        _webRoot,
                        CoreWebView2HostResourceAccessKind.DenyCors);
                }
                catch (Exception ex)
                {
                    ShellLog.Error("Unable to map the virtual host to the web assets folder.", ex);
                    ShowErrorPage(BuildMissingAssetsHtml());
                    return;
                }

                if (File.Exists(Path.Combine(_webRoot, "index.html")))
                {
                    core.Navigate(StartUrl);
                }
                else
                {
                    ShellLog.Warn("web\\index.html is missing from the portable layout.");
                    ShowErrorPage(BuildMissingAssetsHtml());
                }
            }
            catch (Exception ex)
            {
                ShellLog.Error("Unexpected error while preparing the embedded browser.", ex);
                ShowInitializationFailure(ex);
            }
        }

        private static void ConfigureSettings(CoreWebView2 core)
        {
            CoreWebView2Settings settings = core.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreDevToolsEnabled = true;
            settings.IsStatusBarEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;
            settings.IsPasswordAutosaveEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            settings.IsSwipeNavigationEnabled = false;
            settings.IsZoomControlEnabled = true;
            settings.IsWebMessageEnabled = true;
        }

        /// <summary>
        /// Handles shell-level messages posted by the page:
        ///  - channel "idt-shell": keyboard shortcuts forwarded by the injected
        ///    document-created helper (WebView2 for WinForms does not expose
        ///    CoreWebView2Controller, so F11 / Esc / F12 are forwarded in JS);
        ///  - channel "idt-app": native window actions requested by the web UI
        ///    (close, minimize, maximize, fullscreen).
        /// </summary>
        private void OnHostMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string payload;
            try
            {
                payload = e.WebMessageAsJson;
            }
            catch (Exception)
            {
                return;
            }

            Dictionary<string, object> message;
            try
            {
                message = Json.Parse(payload) as Dictionary<string, object>;
            }
            catch (JsonFormatException)
            {
                return;
            }

            if (message == null)
            {
                return;
            }

            string channel = ReadString(message, "channel");
            if (string.Equals(channel, "idt-shell", StringComparison.Ordinal))
            {
                HandleShellAccelerator(message);
            }
            else if (string.Equals(channel, "idt-app", StringComparison.Ordinal))
            {
                HandleNativeAppAction(message);
            }
        }

        private void HandleShellAccelerator(Dictionary<string, object> message)
        {
            if (!string.Equals(ReadString(message, "action"), "accelerator", StringComparison.Ordinal))
            {
                return;
            }

            object repeatValue;
            if (message.TryGetValue("repeat", out repeatValue) && repeatValue is bool && (bool)repeatValue)
            {
                return;
            }

            string key = ReadString(message, "key");
            if (string.Equals(key, "F11", StringComparison.Ordinal))
            {
                ToggleFullScreen();
            }
            else if (string.Equals(key, "F12", StringComparison.Ordinal))
            {
                OpenDevTools();
            }
            else if (string.Equals(key, "Escape", StringComparison.Ordinal) && _fullScreen)
            {
                ExitFullScreen();
            }
        }

        /// <summary>
        /// Native window actions requested by the web application. The app's
        /// "Save &amp; Exit" flow relies on the close action to shut down the host.
        /// </summary>
        private void HandleNativeAppAction(Dictionary<string, object> message)
        {
            string action = ReadString(message, "action");
            if (string.IsNullOrEmpty(action))
            {
                return;
            }

            bool handled = true;
            switch (action)
            {
                case "close":
                    PostAppResponse(action);
                    BeginInvoke(new Action(Close));
                    break;
                case "minimize":
                    WindowState = FormWindowState.Minimized;
                    PostAppResponse(action);
                    break;
                case "maximize":
                    WindowState = FormWindowState.Maximized;
                    PostAppResponse(action);
                    break;
                case "restore":
                    WindowState = FormWindowState.Normal;
                    PostAppResponse(action);
                    break;
                case "fullscreen":
                case "toggle-fullscreen":
                    ToggleFullScreen();
                    PostAppResponse(action);
                    break;
                case "exit-fullscreen":
                    ExitFullScreen();
                    PostAppResponse(action);
                    break;
                case "theme":
                case "set-theme":
                    object darkValue;
                    if (message.TryGetValue("dark", out darkValue) && darkValue is bool)
                    {
                        _darkTitleBar = (bool)darkValue;
                        TitleBarTheme.Apply(this, _darkTitleBar);
                    }

                    PostAppResponse(action);
                    break;
                default:
                    handled = false;
                    break;
            }

            if (!handled)
            {
                ShellLog.Warn("Unsupported idt-app action: " + action);
            }
        }

        private void PostAppResponse(string action)
        {
            try
            {
                CoreWebView2 core = _webView.CoreWebView2;
                if (core != null)
                {
                    core.PostWebMessageAsJson(
                        "{\"channel\":\"idt-app-response\",\"action\":" + Json.Quote(action) + ",\"ok\":true}");
                }
            }
            catch (Exception)
            {
                // Best-effort acknowledgement; the window action still happens.
            }
        }

        private static string ReadString(Dictionary<string, object> message, string name)
        {
            object value;
            return message.TryGetValue(name, out value) ? value as string : null;
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            Uri uri;
            if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri))
            {
                return;
            }

            if (IsInternalUri(uri))
            {
                return;
            }

            // Never let the renderer navigate the shell to an external site:
            // hand external links to the default browser instead.
            e.Cancel = true;
            OpenInExternalBrowser(uri);
        }

        private static bool IsInternalUri(Uri uri)
        {
            if (uri == null)
            {
                return false;
            }

            if (string.Equals(uri.Scheme, "about", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(uri.Scheme, "data", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                   string.Equals(uri.Host, VirtualHostName, StringComparison.OrdinalIgnoreCase);
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                return;
            }

            if (_showingErrorPage)
            {
                return;
            }

            ShellLog.Warn("Navigation failed: " + e.WebErrorStatus);
            string detail = "The embedded browser could not load the simulator interface. Error: " + e.WebErrorStatus + ".";
            ShowErrorPage(BuildErrorHtml("Unable to load the simulator", detail));
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;

            Uri uri;
            if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri))
            {
                return;
            }

            if (IsInternalUri(uri) && _webView.CoreWebView2 != null)
            {
                _webView.CoreWebView2.Navigate(uri.AbsoluteUri);
                return;
            }

            OpenInExternalBrowser(uri);
        }

        private void OnProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            ShellLog.Error("WebView2 process failure: " + e.ProcessFailedKind + ".");

            if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited && !_closing)
            {
                BeginInvoke(new Action(() =>
                {
                    if (_closing)
                    {
                        return;
                    }

                    MessageBox.Show(
                        this,
                        "The embedded browser stopped unexpectedly. The simulator will close; please start it again." +
                        Environment.NewLine + Environment.NewLine +
                        "A diagnostic log is available at: " + ShellLog.LogPath,
                        Program.AppTitle,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                    Close();
                }));
            }
        }

        private void OpenInExternalBrowser(Uri uri)
        {
            if (uri == null)
            {
                return;
            }

            if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(uri.Scheme, "mailto", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            try
            {
                Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                ShellLog.Warn("Unable to open external link '" + uri.AbsoluteUri + "': " + ex.Message);
            }
        }

        private void PostToWebView(string payloadJson)
        {
            try
            {
                CoreWebView2 core = _webView.CoreWebView2;
                if (core != null)
                {
                    core.PostWebMessageAsJson(payloadJson);
                }
            }
            catch (Exception)
            {
                // The browser is shutting down; the web app keeps its localStorage
                // fallback in that case.
            }
        }

        private void ShowErrorPage(string html)
        {
            if (_showingErrorPage || _closing)
            {
                return;
            }

            CoreWebView2 core = _webView.CoreWebView2;
            if (core == null)
            {
                return;
            }

            _showingErrorPage = true;
            try
            {
                core.NavigateToString(html);
            }
            catch (Exception ex)
            {
                _showingErrorPage = false;
                ShellLog.Error("Unable to display the embedded error page.", ex);
            }
        }

        private void ShowInitializationFailure(Exception exception)
        {
            if (_closing)
            {
                return;
            }

            BeginInvoke(new Action(() =>
            {
                if (_closing || IsDisposed)
                {
                    return;
                }

                using (var form = new RuntimeErrorForm(
                    "Unable to start the embedded browser",
                    "The Microsoft Edge WebView2 control could not be initialized. The simulator cannot display its interface without it." +
                    Environment.NewLine + Environment.NewLine +
                    "Try installing or repairing the Microsoft Edge WebView2 Runtime, then start the simulator again." +
                    Environment.NewLine + Environment.NewLine +
                    "Details: " + (exception != null ? exception.Message : "Unknown initialization error."),
                    Program.RuntimeDownloadUrl))
                {
                    form.ShowDialog(this);
                }

                Close();
            }));
        }

        private void ClampToWorkingArea()
        {
            if (WindowState != FormWindowState.Normal)
            {
                return;
            }

            Rectangle workingArea = Screen.FromControl(this).WorkingArea;
            if (Width <= workingArea.Width && Height <= workingArea.Height)
            {
                return;
            }

            int width = Math.Min(Width, Math.Max(MinimumSize.Width, (int)(workingArea.Width * 0.94)));
            int height = Math.Min(Height, Math.Max(MinimumSize.Height, (int)(workingArea.Height * 0.94)));
            Size = new Size(width, height);
            Location = new Point(
                workingArea.Left + (workingArea.Width - width) / 2,
                workingArea.Top + (workingArea.Height - height) / 2);
        }

        private void OpenDevTools()
        {
            try
            {
                CoreWebView2 core = _webView.CoreWebView2;
                if (core != null)
                {
                    core.OpenDevToolsWindow();
                }
            }
            catch (Exception ex)
            {
                ShellLog.Warn("Unable to open DevTools: " + ex.Message);
            }
        }

        private void ToggleFullScreen()
        {
            if (_fullScreen)
            {
                ExitFullScreen();
            }
            else
            {
                EnterFullScreen();
            }
        }

        private void EnterFullScreen()
        {
            if (_fullScreen || _closing)
            {
                return;
            }

            _savedBorderStyle = FormBorderStyle;
            _savedWindowState = WindowState;
            _savedBounds = Bounds;
            _fullScreen = true;

            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.None;
            Bounds = Screen.FromControl(this).Bounds;
            TitleBarTheme.Apply(this, _darkTitleBar);
        }

        private void ExitFullScreen()
        {
            if (!_fullScreen)
            {
                return;
            }

            _fullScreen = false;
            FormBorderStyle = _savedBorderStyle;
            if (_savedWindowState == FormWindowState.Maximized)
            {
                WindowState = FormWindowState.Maximized;
            }
            else
            {
                WindowState = FormWindowState.Normal;
                Bounds = _savedBounds;
            }

            TitleBarTheme.Apply(this, _darkTitleBar);
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            _closing = true;
            _storageBridge.Detach();

            try
            {
                CoreWebView2 core = _webView.CoreWebView2;
                if (core != null)
                {
                    core.WebMessageReceived -= OnHostMessageReceived;
                }
            }
            catch (Exception)
            {
                // The browser may already be shutting down.
            }

            try
            {
                _webView.Dispose();
            }
            catch (Exception ex)
            {
                ShellLog.Warn("Error while disposing WebView2: " + ex.Message);
            }
        }

        private string BuildMissingAssetsHtml()
        {
            string webRoot = HtmlEncode(_webRoot);
            return BuildErrorHtml(
                "Simulator files are missing",
                "The portable build is expected to contain a <code>web</code> folder next to <code>IndustrialDigitalTwinSimulator.exe</code>, " +
                "but it could not be found at:<br><br><code>" + webRoot + "</code><br><br>" +
                "Re-run the packaging script (<code>pwsh -File tools/build.ps1</code>) and start the simulator from the generated <code>dist</code> folder.");
        }

        private static string BuildErrorHtml(string title, string bodyHtml)
        {
            var html = new StringBuilder();
            html.Append("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">");
            html.Append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
            html.Append("<title>").Append(HtmlEncode(title)).Append("</title>");
            html.Append("<style>");
            html.Append(":root{color-scheme:dark}");
            html.Append("html,body{height:100%;margin:0}");
            html.Append("body{display:flex;align-items:center;justify-content:center;background:#070b14;color:#e2e8f0;");
            html.Append("font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}");
            html.Append(".card{max-width:760px;margin:32px;padding:40px 44px;border:1px solid #1e293b;border-radius:18px;");
            html.Append("background:linear-gradient(180deg,#0b1220 0%,#101b2f 100%);box-shadow:0 24px 80px rgba(0,0,0,.45);}");
            html.Append(".bar{width:64px;height:5px;border-radius:3px;background:#22d3ee;margin-bottom:22px}");
            html.Append("h1{font-size:26px;line-height:1.25;margin:0 0 18px;color:#f0f9ff;font-weight:650}");
            html.Append("p{font-size:15px;line-height:1.7;margin:0 0 14px;color:#94a3b8}");
            html.Append("code{font-family:Consolas,'Cascadia Mono',monospace;font-size:13px;color:#67e8f9;");
            html.Append("background:#111c2e;border:1px solid #1e293b;border-radius:6px;padding:2px 7px;word-break:break-all}");
            html.Append(".hint{margin-top:26px;font-size:13px;color:#64748b}");
            html.Append("</style></head><body><div class=\"card\"><div class=\"bar\"></div>");
            html.Append("<h1>").Append(HtmlEncode(title)).Append("</h1>");
            html.Append("<p>").Append(bodyHtml).Append("</p>");
            html.Append("<div class=\"hint\">Industrial Digital Twin Simulator &mdash; native desktop shell</div>");
            html.Append("</div></body></html>");
            return html.ToString();
        }

        private static string HtmlEncode(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return value
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;")
                .Replace("'", "&#39;");
        }
    }
}
