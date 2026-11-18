using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>
    /// Applies the Windows 10/11 immersive dark title bar to a standard framed
    /// window. The standard caption (with minimize / maximize / close) is kept;
    /// only its DWM colour scheme is switched to dark.
    ///
    /// DWMWA_USE_IMMERSIVE_DARK_MODE is attribute 20 on Windows 10 20H1 and later
    /// and attribute 19 on Windows 10 1809-1909. Unsupported systems simply keep
    /// their normal chrome, so the call is always best-effort.
    /// </summary>
    internal static class TitleBarTheme
    {
        private const int DwmwaUseImmersiveDarkMode = 20;
        private const int DwmwaUseImmersiveDarkModeBefore20H1 = 19;

        private const int SwpNoSize = 0x0001;
        private const int SwpNoMove = 0x0002;
        private const int SwpNoZOrder = 0x0004;
        private const int SwpNoActivate = 0x0010;
        private const int SwpFrameChanged = 0x0020;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, int flags);

        /// <summary>Applies a dark title bar to the form's current window handle.</summary>
        public static void ApplyDark(Form form)
        {
            Apply(form, true);
        }

        /// <summary>
        /// Applies the requested title bar colour scheme. Safe to call repeatedly and
        /// before/after the handle is recreated; failures are ignored.
        /// </summary>
        public static void Apply(Form form, bool dark)
        {
            if (form == null || !form.IsHandleCreated || form.IsDisposed)
            {
                return;
            }

            IntPtr hwnd;
            try
            {
                hwnd = form.Handle;
            }
            catch (Exception)
            {
                return;
            }

            if (hwnd == IntPtr.Zero)
            {
                return;
            }

            int value = dark ? 1 : 0;
            try
            {
                int result = DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref value, sizeof(int));
                if (result != 0)
                {
                    // Windows 10 1809-1909 used attribute 19.
                    DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkModeBefore20H1, ref value, sizeof(int));
                }

                // Force a non-client repaint so the caption picks up the new scheme
                // immediately instead of waiting for the next resize or activation.
                SetWindowPos(
                    hwnd,
                    IntPtr.Zero,
                    0, 0, 0, 0,
                    SwpNoMove | SwpNoSize | SwpNoZOrder | SwpNoActivate | SwpFrameChanged);
            }
            catch (DllNotFoundException)
            {
                // Pre-Vista / stripped systems: keep the default chrome.
            }
            catch (EntryPointNotFoundException)
            {
                // dwmapi is present but the API is unavailable; keep default chrome.
            }
            catch (Exception)
            {
                // Non-fatal cosmetic operation.
            }
        }
    }
}
