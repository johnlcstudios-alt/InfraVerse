using System;
using System.IO;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>
    /// Lightweight diagnostic log for the native shell. Kept under
    /// %LOCALAPPDATA%\IndustrialDigitalTwinSimulator\logs\ and rotated at 1 MB.
    /// Logging must never throw or block the application.
    /// </summary>
    internal static class ShellLog
    {
        private static readonly object SyncRoot = new object();
        private static readonly string LogDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            ConfigStore.ProductFolderName,
            ConfigStore.LogsFolderName);

        private static readonly string LogFilePath = Path.Combine(LogDirectory, "shell.log");

        public static string LogPath
        {
            get { return LogFilePath; }
        }

        public static void Info(string message)
        {
            Write("INFO", message);
        }

        public static void Warn(string message)
        {
            Write("WARN", message);
        }

        public static void Error(string message, Exception exception = null)
        {
            string text = message;
            if (exception != null)
            {
                text += " " + exception.GetType().Name + ": " + exception.Message;
            }

            Write("ERROR", text);
        }

        private static void Write(string level, string message)
        {
            try
            {
                lock (SyncRoot)
                {
                    Directory.CreateDirectory(LogDirectory);
                    RotateIfNeeded();
                    string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff", System.Globalization.CultureInfo.InvariantCulture)
                                  + " [" + level + "] " + message + Environment.NewLine;
                    File.AppendAllText(LogFilePath, line);
                }
            }
            catch (Exception)
            {
                // Diagnostics are best-effort only.
            }
        }

        private static void RotateIfNeeded()
        {
            var info = new FileInfo(LogFilePath);
            if (!info.Exists || info.Length <= 1024 * 1024)
            {
                return;
            }

            try
            {
                string previous = LogFilePath + ".1";
                if (File.Exists(previous))
                {
                    File.Delete(previous);
                }

                File.Move(LogFilePath, previous);
            }
            catch (Exception)
            {
                // If rotation fails we keep appending to the existing log.
            }
        }
    }
}
