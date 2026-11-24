using System;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using IndustrialDigitalTwinSimulator;

namespace TwinOps
{
    internal static class Program
    {
        public const string AppTitle = "TWIN OPS: Field Engineer";
        public const string RuntimeDownloadUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += OnThreadException;
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

            ShellLog.Info("Starting " + AppTitle + " (" + Environment.OSVersion + ", " + (Environment.Is64BitProcess ? "x64" : "x86") + ").");

            // Fail early with a readable, branded message when the evergreen
            // WebView2 Runtime is not installed instead of an opaque crash.
            string browserVersion = null;
            string runtimeError = null;
            try
            {
                browserVersion = CoreWebView2Environment.GetAvailableBrowserVersionString();
            }
            catch (Exception ex)
            {
                runtimeError = ex.Message;
            }

            if (string.IsNullOrEmpty(browserVersion))
            {
                ShellLog.Warn("WebView2 Runtime unavailable: " + (runtimeError ?? "unknown reason"));
                using (var form = new RuntimeErrorForm(
                    "Embedded browser runtime not found",
                    "The Microsoft Edge WebView2 Runtime is required to run TWIN OPS, but it was not found on this computer." +
                    Environment.NewLine + Environment.NewLine +
                    "Windows 11 normally includes the runtime. On older or stripped-down systems, install it from Microsoft and launch the game again." +
                    (runtimeError != null ? Environment.NewLine + Environment.NewLine + "Details: " + runtimeError : string.Empty),
                    RuntimeDownloadUrl))
                {
                    form.ShowDialog();
                }

                return;
            }

            ShellLog.Info("WebView2 Runtime version: " + browserVersion);

            // Boot the game entry page directly over its own virtual origin.
            // The storage bridge targets the same config folder as the
            // Industrial Digital Twin Simulator, keeping both exes in sync.
            Application.Run(new IndustrialDigitalTwinSimulator.MainForm(AppTitle, "game.idt.local", "game.html"));

            ShellLog.Info("TWIN OPS closed.");
        }

        private static void OnThreadException(object sender, ThreadExceptionEventArgs e)
        {
            HandleFatal(e.Exception);
        }

        private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            HandleFatal(e.ExceptionObject as Exception);
        }

        private static void HandleFatal(Exception exception)
        {
            ShellLog.Error("Unhandled exception.", exception);
            try
            {
                MessageBox.Show(
                    "TWIN OPS encountered an unexpected error and may need to be restarted." +
                    Environment.NewLine + Environment.NewLine +
                    (exception != null ? exception.Message : "Unknown error.") +
                    Environment.NewLine + Environment.NewLine +
                    "A log was written to: " + ShellLog.LogPath,
                    AppTitle,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch (Exception)
            {
                // Last-resort error reporting: nothing else we can do.
            }
        }
    }
}
