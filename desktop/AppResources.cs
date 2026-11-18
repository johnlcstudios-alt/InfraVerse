using System;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>Shared application resources (currently the embedded window icon).</summary>
    internal static class AppResources
    {
        public const string IconResourceName = "IndustrialDigitalTwinSimulator.app.ico";

        /// <summary>
        /// Loads the multi-resolution application icon embedded in the executable,
        /// falling back to the executable's associated icon.
        /// </summary>
        public static Icon LoadAppIcon()
        {
            try
            {
                Assembly assembly = Assembly.GetExecutingAssembly();
                using (var stream = assembly.GetManifestResourceStream(IconResourceName))
                {
                    if (stream != null)
                    {
                        return new Icon(stream);
                    }
                }
            }
            catch (Exception)
            {
                // Fall through to the associated-icon fallback.
            }

            try
            {
                Icon associated = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (associated != null)
                {
                    return associated;
                }
            }
            catch (Exception)
            {
                // Fall through to the system icon.
            }

            return SystemIcons.Application;
        }
    }
}
