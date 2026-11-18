using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Microsoft.Web.WebView2.Core;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>
    /// Bridges the web application's <c>window.chrome.webview</c> messages to the
    /// on-disk configuration store.
    ///
    /// Request  (web -> host):
    ///   { channel: "idt-storage", requestId: "...", action: "write"|"remove"|"list",
    ///     key: "...", json: "{...}" }
    ///
    /// Response (host -> web):
    ///   { channel: "idt-storage-response", requestId: "...", ok: true|false, data: ... }
    ///
    /// Requests on any other channel are ignored so the web app can use the same
    /// transport for future features. The bridge is deliberately decoupled from
    /// WebView2 (it writes through a delegate) so its protocol can be unit tested.
    /// </summary>
    internal sealed class StorageBridge
    {
        public const string RequestChannel = "idt-storage";
        public const string ResponseChannel = "idt-storage-response";

        private readonly ConfigStore _store;
        private readonly Action<string> _postJson;
        private CoreWebView2 _core;

        public StorageBridge(ConfigStore store, Action<string> postJson)
        {
            if (store == null)
            {
                throw new ArgumentNullException("store");
            }

            _store = store;
            _postJson = postJson;
        }

        /// <summary>Starts listening for messages on the given WebView2 instance.</summary>
        public void Attach(CoreWebView2 core)
        {
            if (core == null)
            {
                throw new ArgumentNullException("core");
            }

            Detach();
            _core = core;
            _core.WebMessageReceived += OnWebMessageReceived;
        }

        /// <summary>Stops listening for WebView2 messages. Safe to call repeatedly.</summary>
        public void Detach()
        {
            if (_core == null)
            {
                return;
            }

            try
            {
                _core.WebMessageReceived -= OnWebMessageReceived;
            }
            catch (Exception)
            {
                // The browser may already be shutting down.
            }

            _core = null;
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
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

            HandleMessage(payload);
        }

        /// <summary>
        /// Processes one raw message envelope. Returns true when the message was
        /// addressed to this bridge (even if the request itself failed).
        /// </summary>
        public bool HandleMessage(string payload)
        {
            if (payload == null)
            {
                return false;
            }

            Dictionary<string, object> message;
            try
            {
                message = Json.Parse(payload) as Dictionary<string, object>;
            }
            catch (JsonFormatException)
            {
                return false;
            }

            if (message == null)
            {
                return false;
            }

            string channel = ReadString(message, "channel");
            if (!string.Equals(channel, RequestChannel, StringComparison.Ordinal))
            {
                return false;
            }

            string requestId = ReadRequestId(message);
            try
            {
                string action = ReadString(message, "action");
                if (string.IsNullOrEmpty(action))
                {
                    Reply(requestId, false, ErrorData("Missing storage action."));
                    return true;
                }

                switch (action)
                {
                    case "write":
                        HandleWrite(message, requestId);
                        break;
                    case "remove":
                        HandleRemove(message, requestId);
                        break;
                    case "list":
                        HandleList(requestId);
                        break;
                    default:
                        Reply(requestId, false, ErrorData("Unsupported storage action '" + action + "'."));
                        break;
                }
            }
            catch (Exception ex)
            {
                Reply(requestId, false, ErrorData(ex.Message));
            }

            return true;
        }

        private void HandleWrite(Dictionary<string, object> message, string requestId)
        {
            string key = ReadString(message, "key");
            if (string.IsNullOrEmpty(key) || !ConfigStore.IsValidKey(key))
            {
                Reply(requestId, false, ErrorData("Invalid storage key."));
                return;
            }

            string json = ReadString(message, "json");
            if (json == null)
            {
                Reply(requestId, false, ErrorData("Missing JSON payload."));
                return;
            }

            string error;
            if (!_store.TryWrite(key, json, out error))
            {
                Reply(requestId, false, ErrorData(error ?? "Unable to save configuration."));
                return;
            }

            Reply(requestId, true, "{\"key\":" + Json.Quote(key) + "}");
        }

        private void HandleRemove(Dictionary<string, object> message, string requestId)
        {
            string key = ReadString(message, "key");
            if (string.IsNullOrEmpty(key) || !ConfigStore.IsValidKey(key))
            {
                Reply(requestId, false, ErrorData("Invalid storage key."));
                return;
            }

            string error;
            if (!_store.TryRemove(key, out error))
            {
                Reply(requestId, false, ErrorData(error ?? "Unable to delete configuration."));
                return;
            }

            Reply(requestId, true, "{\"key\":" + Json.Quote(key) + "}");
        }

        private void HandleList(string requestId)
        {
            string[] keys = _store.ListKeys();
            var builder = new StringBuilder();
            builder.Append('[');
            for (int i = 0; i < keys.Length; i++)
            {
                if (i > 0)
                {
                    builder.Append(',');
                }

                builder.Append(Json.Quote(keys[i]));
            }

            builder.Append(']');
            Reply(requestId, true, builder.ToString());
        }

        private void Reply(string requestId, bool ok, string dataJson)
        {
            var builder = new StringBuilder(96);
            builder.Append("{\"channel\":").Append(Json.Quote(ResponseChannel));
            builder.Append(",\"requestId\":").Append(Json.Quote(requestId ?? string.Empty));
            builder.Append(",\"ok\":").Append(ok ? "true" : "false");
            builder.Append(",\"data\":").Append(string.IsNullOrEmpty(dataJson) ? "null" : dataJson);
            builder.Append('}');

            if (_postJson == null)
            {
                return;
            }

            try
            {
                _postJson(builder.ToString());
            }
            catch (Exception)
            {
                // The host window may be closing; the web app keeps its in-memory
                // state and localStorage fallback in that case.
            }
        }

        private static string ErrorData(string message)
        {
            return "{\"message\":" + Json.Quote(message ?? "Unknown storage error.") + "}";
        }

        private static string ReadString(Dictionary<string, object> message, string name)
        {
            object value;
            return message.TryGetValue(name, out value) ? value as string : null;
        }

        private static string ReadRequestId(Dictionary<string, object> message)
        {
            object value;
            if (!message.TryGetValue("requestId", out value) || value == null)
            {
                return string.Empty;
            }

            var text = value as string;
            if (text != null)
            {
                return text;
            }

            var number = value as double?;
            if (number.HasValue)
            {
                return number.Value.ToString("R", CultureInfo.InvariantCulture);
            }

            return string.Empty;
        }
    }
}
