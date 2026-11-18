using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace IndustrialDigitalTwinSimulator.SelfTest
{
    /// <summary>
    /// Console self-test for the dependency-free JSON reader and the disk storage
    /// bridge. It compiles the shipping sources directly, so a passing run means
    /// the exact code embedded in the desktop shell parses requests, validates
    /// keys, writes files atomically and produces the expected responses.
    /// </summary>
    internal static class Program
    {
        private static int _checks;
        private static int _failures;

        private static int Main()
        {
            string sandbox = Path.Combine(Path.GetTempPath(), "idt-selftest-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(sandbox);

            Console.WriteLine("Industrial Digital Twin Simulator - storage/bridge self-test");
            Console.WriteLine("Sandbox: " + sandbox);
            Console.WriteLine();

            try
            {
                TestJsonReader();
                TestConfigStore(sandbox);
                TestStorageBridge(sandbox);
            }
            finally
            {
                try
                {
                    Directory.Delete(sandbox, true);
                }
                catch (Exception)
                {
                    // Best-effort cleanup.
                }
            }

            Console.WriteLine();
            if (_failures == 0)
            {
                Console.WriteLine("SELF-TEST PASSED (" + _checks + " checks)");
                return 0;
            }

            Console.WriteLine("SELF-TEST FAILED (" + _failures + " of " + _checks + " checks failed)");
            return 1;
        }

        private static void TestJsonReader()
        {
            Console.WriteLine("[JSON reader]");

            Check(Json.IsValid("{}"), "empty object is valid");
            Check(Json.IsValid("[]"), "empty array is valid");
            Check(Json.IsValid("null"), "null is valid");
            Check(Json.IsValid("true"), "true is valid");
            Check(Json.IsValid("\"hello\""), "string is valid");
            Check(Json.IsValid("{\"a\":1,\"b\":[true,false,null,\"x\"],\"c\":{\"d\":-1.5e-3}}"), "nested document is valid");
            Check(Json.IsValid("  {\n\t\"a\" : 0\n}  "), "whitespace is allowed");
            Check(Json.IsValid("\"\\u00e9 \\uD83D\\uDE00\""), "unicode escapes are valid");
            Check(Json.IsValid("\"line\\nbreak\\ttab\\\"quote\\\\slash\\/solidus\""), "escape sequences are valid");

            Check(!Json.IsValid(""), "empty text is invalid");
            Check(!Json.IsValid("{"), "unterminated object is invalid");
            Check(!Json.IsValid("{\"a\":}"), "missing value is invalid");
            Check(!Json.IsValid("{\"a\" 1}"), "missing colon is invalid");
            Check(!Json.IsValid("[1,]"), "trailing comma is invalid");
            Check(!Json.IsValid("\"unterminated"), "unterminated string is invalid");
            Check(!Json.IsValid("01"), "leading zero is invalid");
            Check(!Json.IsValid("1."), "missing fraction digits are invalid");
            Check(!Json.IsValid(".5"), "bare fraction is invalid");
            Check(!Json.IsValid("--1"), "double sign is invalid");
            Check(!Json.IsValid("tru"), "short literal is invalid");
            Check(!Json.IsValid("{\"a\":1} extra"), "trailing text is invalid");
            Check(!Json.IsValid("\"raw" + (char)1 + "control\""), "raw control character is invalid");
            Check(!Json.IsValid(null), "null text is invalid");

            object parsed;
            Check(Json.TryParse("{\"value\":42}", out parsed) && parsed is Dictionary<string, object>, "object parses to dictionary");
            Check(Json.TryParse("[1,2,3]", out parsed) && parsed is List<object>, "array parses to list");
            Check(Json.TryParse("\"id\\u002d1\"", out parsed) && (string)parsed == "id-1", "string escape decodes");

            string tricky = "quote \" backslash \\ newline \n tab \t control " + (char)1 + " unicode \u00e9";
            string quoted = Json.Quote(tricky);
            object roundTrip;
            Check(Json.TryParse(quoted, out roundTrip) && (string)roundTrip == tricky, "Quote round-trips arbitrary text");
            Check(Json.Quote(null) == "null", "Quote(null) emits null literal");

            const string compact = "{\"a\":1,\"b\":[true,null,\"x\"],\"c\":-2.5}";
            Check(Json.Serialize(Json.Parse(compact)) == compact, "Serialize round-trips the compact document");
        }

        private static void TestConfigStore(string sandbox)
        {
            Console.WriteLine();
            Console.WriteLine("[Configuration store]");

            string directory = Path.Combine(sandbox, "config");
            var store = new ConfigStore(directory);

            Check(store.CreateBootScript() == "window.__IDT_BOOT_CONFIG__ = {};", "boot script is empty without files");
            Check(store.LoadAll().Count == 0, "LoadAll is empty without files");
            Check(store.ListKeys().Length == 0, "ListKeys is empty without files");

            Check(ConfigStore.IsValidKey("idt.global"), "valid key: idt.global");
            Check(ConfigStore.IsValidKey("a_b-c.123"), "valid key: mixed characters");
            Check(ConfigStore.IsValidKey(new string('a', 128)), "valid key: 128 characters");
            Check(!ConfigStore.IsValidKey(new string('a', 129)), "invalid key: 129 characters");
            Check(!ConfigStore.IsValidKey(""), "invalid key: empty");
            Check(!ConfigStore.IsValidKey(null), "invalid key: null");
            Check(!ConfigStore.IsValidKey("."), "invalid key: dot");
            Check(!ConfigStore.IsValidKey(".."), "invalid key: dot dot");
            Check(!ConfigStore.IsValidKey("a/b"), "invalid key: slash");
            Check(!ConfigStore.IsValidKey("a\\b"), "invalid key: backslash");
            Check(!ConfigStore.IsValidKey("a b"), "invalid key: space");
            Check(!ConfigStore.IsValidKey("a:b"), "invalid key: colon");
            Check(!ConfigStore.IsValidKey("caf\u00e9"), "invalid key: non-ascii");

            const string firstPayload = "{\"version\":1,\"scale\":\"metric\"}";
            string error;
            Check(store.TryWrite("idt.global", firstPayload, out error), "write succeeds", error);
            string path = Path.Combine(directory, "idt.global.json");
            Check(File.Exists(path), "write creates <key>.json");
            Check(File.ReadAllText(path) == firstPayload, "write persists exact JSON text");
            Check(store.LoadAll().Count == 1, "LoadAll sees the file");
            Check(store.ListKeys().Length == 1 && store.ListKeys()[0] == "idt.global", "ListKeys reports the key");

            string boot = store.CreateBootScript();
            Check(boot.StartsWith("window.__IDT_BOOT_CONFIG__ = ", StringComparison.Ordinal), "boot script assigns __IDT_BOOT_CONFIG__");
            Check(boot.Contains("\"idt.global\": " + firstPayload), "boot script embeds the raw payload");

            const string secondPayload = "{\"version\":2,\"scale\":\"imperial\"}";
            Check(store.TryWrite("idt.global", secondPayload, out error), "overwrite succeeds", error);
            Check(File.ReadAllText(path) == secondPayload, "overwrite replaces content exactly");
            Check(!File.Exists(Path.Combine(directory, "idt.global.json.tmp")), "no temp file is left behind");

            Check(!store.TryWrite("idt.global", "{not json", out error), "malformed JSON is rejected");
            Check(File.ReadAllText(path) == secondPayload, "rejected payload leaves the previous file intact");
            Check(!store.TryWrite("../escape", "{}", out error), "path traversal key is rejected");

            File.WriteAllText(Path.Combine(directory, "corrupt.json"), "{ this is not json ");
            File.WriteAllText(Path.Combine(directory, "invalid name.json"), "{\"ok\":true}");
            Check(store.LoadAll().Count == 1, "corrupt and unsafe files are skipped");
            boot = store.CreateBootScript();
            Check(!boot.Contains("corrupt"), "boot script excludes corrupt files");
            Check(store.ListKeys().Length == 1, "ListKeys excludes unsafe file names");

            Check(store.TryRemove("idt.global", out error), "remove succeeds", error);
            Check(!File.Exists(path), "remove deletes the file");
            Check(store.TryRemove("idt.global", out error), "removing a missing file succeeds", error);
        }

        private static void TestStorageBridge(string sandbox)
        {
            Console.WriteLine();
            Console.WriteLine("[Storage bridge]");

            string directory = Path.Combine(sandbox, "bridge-config");
            var store = new ConfigStore(directory);
            var responses = new List<string>();
            var bridge = new StorageBridge(store, responses.Add);

            const string payload = "{\"version\":1,\"scene\":{\"name\":\"Plant A\"}}";

            bool handled = bridge.HandleMessage(BuildRequest("r1", "write", "idt.global", payload));
            Check(handled, "write request is handled");
            Check(responses.Count == 1, "write produces one response");
            Dictionary<string, object> response = ParseResponse(responses[0]);
            Check(Channel(response) == StorageBridge.ResponseChannel, "response channel is idt-storage-response");
            Check(StringValue(response, "requestId") == "r1", "write response echoes requestId");
            Check(BoolValue(response, "ok"), "write response is ok");
            Check(File.ReadAllText(Path.Combine(directory, "idt.global.json")) == payload, "write reaches disk verbatim");

            responses.Clear();
            bridge.HandleMessage(BuildRequest("r2", "list", null, null));
            response = ParseResponse(responses[0]);
            Check(BoolValue(response, "ok"), "list response is ok");
            var keys = Value(response, "data") as List<object>;
            Check(keys != null && keys.Count == 1 && (string)keys[0] == "idt.global", "list returns key array");

            responses.Clear();
            bridge.HandleMessage(BuildRequest("r3", "remove", "idt.global", null));
            response = ParseResponse(responses[0]);
            Check(BoolValue(response, "ok"), "remove response is ok");
            Check(!File.Exists(Path.Combine(directory, "idt.global.json")), "remove deletes the file");

            responses.Clear();
            bridge.HandleMessage(BuildRequest("r4", "write", "..", payload));
            response = ParseResponse(responses[0]);
            Check(!BoolValue(response, "ok"), "invalid key is rejected");
            Check(ErrorMessage(response).Contains("Invalid storage key"), "invalid key returns a readable message");

            responses.Clear();
            bridge.HandleMessage(BuildRequest("r5", "write", "idt.global", "{broken"));
            response = ParseResponse(responses[0]);
            Check(!BoolValue(response, "ok"), "malformed payload is rejected");
            Check(!File.Exists(Path.Combine(directory, "idt.global.json")), "malformed payload writes nothing");

            responses.Clear();
            bridge.HandleMessage(BuildRequest("r6", "read", "idt.global", null));
            response = ParseResponse(responses[0]);
            Check(!BoolValue(response, "ok"), "unknown action is rejected");

            responses.Clear();
            Check(!bridge.HandleMessage("{\"channel\":\"some-other-channel\",\"requestId\":\"x\"}"), "other channels are ignored");
            Check(responses.Count == 0, "ignored channel produces no response");

            responses.Clear();
            Check(!bridge.HandleMessage("not json at all"), "malformed envelope is ignored");
            Check(responses.Count == 0, "malformed envelope produces no response");

            responses.Clear();
            bridge.HandleMessage("{\"channel\":\"idt-storage\",\"requestId\":42,\"action\":\"list\"}");
            response = ParseResponse(responses[0]);
            Check(StringValue(response, "requestId") == "42", "numeric requestId is echoed as text");

            responses.Clear();
            bridge.HandleMessage("{\"channel\":\"idt-storage\",\"requestId\":\"r7\",\"action\":\"write\",\"key\":\"idt.global\",\"json\":null}");
            response = ParseResponse(responses[0]);
            Check(!BoolValue(response, "ok"), "non-string payload is rejected");
        }

        private static string BuildRequest(string requestId, string action, string key, string json)
        {
            var builder = new StringBuilder();
            builder.Append("{\"channel\":\"").Append(StorageBridge.RequestChannel).Append("\"");
            builder.Append(",\"requestId\":").Append(Json.Quote(requestId));
            builder.Append(",\"action\":").Append(Json.Quote(action));
            if (key != null)
            {
                builder.Append(",\"key\":").Append(Json.Quote(key));
            }

            if (json != null)
            {
                builder.Append(",\"json\":").Append(Json.Quote(json));
            }

            builder.Append('}');
            return builder.ToString();
        }

        private static Dictionary<string, object> ParseResponse(string json)
        {
            var response = Json.Parse(json) as Dictionary<string, object>;
            if (response == null)
            {
                throw new InvalidOperationException("Response was not a JSON object: " + json);
            }

            return response;
        }

        private static string Channel(Dictionary<string, object> response)
        {
            return Value(response, "channel") as string;
        }

        private static object Value(Dictionary<string, object> response, string name)
        {
            object value;
            return response.TryGetValue(name, out value) ? value : null;
        }

        private static string ErrorMessage(Dictionary<string, object> response)
        {
            var data = Value(response, "data") as Dictionary<string, object>;
            return data == null ? string.Empty : (Value(data, "message") as string ?? string.Empty);
        }

        private static string StringValue(Dictionary<string, object> response, string name)
        {
            return Value(response, name) as string;
        }

        private static bool BoolValue(Dictionary<string, object> response, string name)
        {
            object value = Value(response, name);
            return value is bool && (bool)value;
        }

        private static void Check(bool condition, string name, string detail = null)
        {
            _checks++;
            if (condition)
            {
                Console.WriteLine("  [ok]   " + name);
            }
            else
            {
                _failures++;
                Console.WriteLine("  [FAIL] " + name + (string.IsNullOrEmpty(detail) ? string.Empty : " (" + detail + ")"));
            }
        }
    }
}

