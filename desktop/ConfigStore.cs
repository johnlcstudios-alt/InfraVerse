using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>
    /// Disk-backed configuration store shared with the web application.
    ///
    /// Layout:
    ///   %LOCALAPPDATA%\IndustrialDigitalTwinSimulator\config\&lt;key&gt;.json
    ///
    /// Keys are restricted to safe identifiers so they can be mapped to file names
    /// without any path handling. Writes are atomic (unique temp file in the same
    /// directory, flushed to disk, then replaced) which keeps the JSON files valid
    /// even if the simulator is killed mid-save.
    /// </summary>
    internal sealed class ConfigStore
    {
        public const string ProductFolderName = "IndustrialDigitalTwinSimulator";
        public const string ConfigFolderName = "config";
        public const string LogsFolderName = "logs";
        public const string WebView2FolderName = "WebView2Data";

        private static readonly Regex SafeKeyPattern = new Regex(
            "^[A-Za-z0-9._-]{1,128}$",
            RegexOptions.CultureInvariant | RegexOptions.Compiled);

        private readonly string _configDirectory;

        public ConfigStore()
            : this(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                ProductFolderName,
                ConfigFolderName))
        {
        }

        public ConfigStore(string configDirectory)
        {
            if (string.IsNullOrEmpty(configDirectory))
            {
                throw new ArgumentNullException("configDirectory");
            }

            _configDirectory = Path.GetFullPath(configDirectory);
        }

        /// <summary>Absolute path of the configuration directory.</summary>
        public string ConfigDirectory
        {
            get { return _configDirectory; }
        }

        /// <summary>Absolute path of the product data directory (parent of config).</summary>
        public string ProductDataDirectory
        {
            get { return Path.GetDirectoryName(_configDirectory); }
        }

        /// <summary>Absolute path used as the WebView2 user-data folder.</summary>
        public string WebView2DataDirectory
        {
            get { return Path.Combine(ProductDataDirectory, WebView2FolderName); }
        }

        /// <summary>True when the key is a safe storage identifier.</summary>
        public static bool IsValidKey(string key)
        {
            if (string.IsNullOrEmpty(key) || key.Length > 128)
            {
                return false;
            }

            if (key == "." || key == "..")
            {
                return false;
            }

            return SafeKeyPattern.IsMatch(key);
        }

        /// <summary>
        /// Reads every valid *.json file in the configuration directory.
        /// Corrupt, unreadable or invalid files are skipped rather than breaking startup.
        /// </summary>
        public SortedDictionary<string, string> LoadAll()
        {
            var result = new SortedDictionary<string, string>(StringComparer.Ordinal);
            try
            {
                if (!Directory.Exists(_configDirectory))
                {
                    return result;
                }

                foreach (string file in Directory.GetFiles(_configDirectory, "*.json", SearchOption.TopDirectoryOnly))
                {
                    string key = Path.GetFileNameWithoutExtension(file);
                    if (!IsValidKey(key))
                    {
                        continue;
                    }

                    string text;
                    try
                    {
                        text = File.ReadAllText(file, Encoding.UTF8);
                    }
                    catch (Exception)
                    {
                        continue;
                    }

                    if (string.IsNullOrWhiteSpace(text) || !Json.IsValid(text))
                    {
                        continue;
                    }

                    result[key] = text;
                }
            }
            catch (Exception)
            {
                // A missing or unreadable configuration directory is not fatal: the
                // web application simply starts with its built-in defaults.
            }

            return result;
        }

        /// <summary>
        /// Builds the document-created bootstrap script that exposes every saved
        /// configuration to the page as <c>window.__IDT_BOOT_CONFIG__</c>.
        /// Each value is the raw, already-validated JSON text of that config file.
        /// </summary>
        public string CreateBootScript()
        {
            SortedDictionary<string, string> configs = LoadAll();
            var builder = new StringBuilder();
            builder.Append("window.__IDT_BOOT_CONFIG__ = ");
            if (configs.Count == 0)
            {
                builder.Append("{}");
            }
            else
            {
                builder.Append('{');
                bool first = true;
                foreach (KeyValuePair<string, string> pair in configs)
                {
                    if (!first)
                    {
                        builder.Append(',');
                    }

                    first = false;
                    builder.AppendLine();
                    builder.Append("  ").Append(Json.Quote(pair.Key)).Append(": ").Append(pair.Value.Trim());
                }

                builder.AppendLine();
                builder.Append('}');
            }

            builder.Append(';');
            return builder.ToString();
        }

        /// <summary>Atomically writes one configuration file.</summary>
        public bool TryWrite(string key, string json, out string error)
        {
            error = null;
            if (!IsValidKey(key))
            {
                error = "Invalid storage key.";
                return false;
            }

            if (json == null)
            {
                error = "Missing JSON payload.";
                return false;
            }

            if (!Json.IsValid(json))
            {
                error = "Refusing to persist malformed JSON.";
                return false;
            }

            string path = GetConfigPath(key);
            if (path == null)
            {
                error = "Invalid storage key.";
                return false;
            }

            try
            {
                Directory.CreateDirectory(_configDirectory);
                WriteAtomically(path, json);
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        /// <summary>Removes one configuration file (missing files are treated as success).</summary>
        public bool TryRemove(string key, out string error)
        {
            error = null;
            if (!IsValidKey(key))
            {
                error = "Invalid storage key.";
                return false;
            }

            string path = GetConfigPath(key);
            if (path == null)
            {
                error = "Invalid storage key.";
                return false;
            }

            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }

                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        /// <summary>
        /// Lists the keys of all valid configuration files, sorted ordinally.
        /// Corrupt files are excluded so the web app only sees configurations
        /// that were actually injected through the boot script.
        /// </summary>
        public string[] ListKeys()
        {
            var keys = new List<string>(LoadAll().Keys);
            keys.Sort(StringComparer.Ordinal);
            return keys.ToArray();
        }

        /// <summary>Resolves a key to its absolute config path, or null when unsafe.</summary>
        private string GetConfigPath(string key)
        {
            if (!IsValidKey(key))
            {
                return null;
            }

            string path = Path.GetFullPath(Path.Combine(_configDirectory, key + ".json"));
            string prefix = _configDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                            + Path.DirectorySeparatorChar;

            if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            return path;
        }

        /// <summary>
        /// Writes via a unique temp file in the same directory, flushes it to the
        /// physical disk, then swaps it into place. Readers always observe either
        /// the previous complete file or the new complete file.
        /// </summary>
        private static void WriteAtomically(string path, string json)
        {
            string directory = Path.GetDirectoryName(path);
            if (string.IsNullOrEmpty(directory))
            {
                throw new IOException("Unable to resolve the configuration directory.");
            }

            string fileName = Path.GetFileName(path);
            string tempPath = Path.Combine(
                directory,
                "." + fileName + "." + Guid.NewGuid().ToString("N") + ".tmp");

            try
            {
                using (var stream = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    byte[] bytes = new UTF8Encoding(false).GetBytes(json);
                    stream.Write(bytes, 0, bytes.Length);
                    stream.Flush(true);
                }

                if (File.Exists(path))
                {
                    try
                    {
                        File.Replace(tempPath, path, null, true);
                        return;
                    }
                    catch (Exception)
                    {
                        // File.Replace can fail on unusual file systems; fall back to a
                        // delete + move, which is still much safer than truncating in place.
                        File.Delete(path);
                    }
                }

                File.Move(tempPath, path);
            }
            finally
            {
                try
                {
                    if (File.Exists(tempPath))
                    {
                        File.Delete(tempPath);
                    }
                }
                catch (Exception)
                {
                    // Best-effort temp cleanup.
                }
            }
        }
    }
}
