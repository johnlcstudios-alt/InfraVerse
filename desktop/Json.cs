using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace IndustrialDigitalTwinSimulator
{
    /// <summary>
    /// Raised when a string is not well-formed JSON.
    /// </summary>
    internal sealed class JsonFormatException : Exception
    {
        public JsonFormatException(string message) : base(message)
        {
        }
    }

    /// <summary>
    /// Minimal, dependency-free JSON utilities used by the native storage bridge.
    ///
    /// The desktop shell never needs to mutate the web application's JSON payloads:
    /// it stores the exact text it receives and injects the exact text it has
    /// validated. This class exists so the shell can (a) reject malformed payloads
    /// before they reach disk, (b) skip corrupt on-disk configuration files instead
    /// of injecting broken JavaScript, and (c) parse the small message envelopes
    /// posted by the web app. No third-party JSON library is used.
    ///
    /// Parsed values are represented as:
    ///   object -> Dictionary&lt;string, object&gt; (ordinal keys)
    ///   array  -> List&lt;object&gt;
    ///   string -> string
    ///   number -> double
    ///   true / false -> bool
    ///   null -> null
    /// </summary>
    internal static class Json
    {
        private const int MaxDepth = 128;

        /// <summary>Parses JSON text, throwing <see cref="JsonFormatException"/> when malformed.</summary>
        public static object Parse(string text)
        {
            if (text == null)
            {
                throw new JsonFormatException("JSON text is null.");
            }

            return new Parser(text).ParseDocument();
        }

        /// <summary>Attempts to parse JSON text without throwing.</summary>
        public static bool TryParse(string text, out object value)
        {
            value = null;
            if (text == null)
            {
                return false;
            }

            try
            {
                value = Parse(text);
                return true;
            }
            catch (JsonFormatException)
            {
                return false;
            }
        }

        /// <summary>Returns true when the text is exactly one well-formed JSON value.</summary>
        public static bool IsValid(string text)
        {
            object ignored;
            return TryParse(text, out ignored);
        }

        /// <summary>Encodes a string as a JSON string literal (including quotes).</summary>
        public static string Quote(string value)
        {
            if (value == null)
            {
                return "null";
            }

            var builder = new StringBuilder(value.Length + 8);
            builder.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"':
                        builder.Append("\\\"");
                        break;
                    case '\\':
                        builder.Append("\\\\");
                        break;
                    case '\b':
                        builder.Append("\\b");
                        break;
                    case '\f':
                        builder.Append("\\f");
                        break;
                    case '\n':
                        builder.Append("\\n");
                        break;
                    case '\r':
                        builder.Append("\\r");
                        break;
                    case '\t':
                        builder.Append("\\t");
                        break;
                    default:
                        if (c < 0x20 || c == '\u2028' || c == '\u2029')
                        {
                            builder.Append("\\u");
                            builder.Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            builder.Append(c);
                        }

                        break;
                }
            }

            builder.Append('"');
            return builder.ToString();
        }

        /// <summary>Serialises the simple value model produced by <see cref="Parse"/>.</summary>
        public static string Serialize(object value)
        {
            var builder = new StringBuilder(256);
            WriteValue(builder, value);
            return builder.ToString();
        }

        private static void WriteValue(StringBuilder builder, object value)
        {
            if (value == null)
            {
                builder.Append("null");
                return;
            }

            if (value is string)
            {
                builder.Append(Quote((string)value));
                return;
            }

            if (value is bool)
            {
                builder.Append((bool)value ? "true" : "false");
                return;
            }

            if (value is double)
            {
                double number = (double)value;
                if (double.IsNaN(number) || double.IsInfinity(number))
                {
                    builder.Append("null");
                }
                else
                {
                    builder.Append(number.ToString("R", CultureInfo.InvariantCulture));
                }

                return;
            }

            var dictionary = value as Dictionary<string, object>;
            if (dictionary != null)
            {
                builder.Append('{');
                bool first = true;
                foreach (KeyValuePair<string, object> pair in dictionary)
                {
                    if (!first)
                    {
                        builder.Append(',');
                    }

                    first = false;
                    builder.Append(Quote(pair.Key));
                    builder.Append(':');
                    WriteValue(builder, pair.Value);
                }

                builder.Append('}');
                return;
            }

            var list = value as List<object>;
            if (list != null)
            {
                builder.Append('[');
                for (int i = 0; i < list.Count; i++)
                {
                    if (i > 0)
                    {
                        builder.Append(',');
                    }

                    WriteValue(builder, list[i]);
                }

                builder.Append(']');
                return;
            }

            builder.Append(Quote(Convert.ToString(value, CultureInfo.InvariantCulture)));
        }

        private sealed class Parser
        {
            private readonly string _text;
            private int _index;
            private int _depth;

            public Parser(string text)
            {
                _text = text;
                _index = 0;
                _depth = 0;
            }

            private bool AtEnd
            {
                get { return _index >= _text.Length; }
            }

            public object ParseDocument()
            {
                SkipWhitespace();
                if (AtEnd)
                {
                    throw Error("Unexpected end of JSON input.");
                }

                object value = ParseValue();
                SkipWhitespace();
                if (!AtEnd)
                {
                    throw Error("Unexpected trailing characters after JSON value.");
                }

                return value;
            }

            private object ParseValue()
            {
                if (AtEnd)
                {
                    throw Error("Unexpected end of JSON input.");
                }

                char c = _text[_index];
                switch (c)
                {
                    case '{':
                        return ParseObject();
                    case '[':
                        return ParseArray();
                    case '"':
                        return ParseString();
                    case 't':
                        ExpectLiteral("true");
                        return true;
                    case 'f':
                        ExpectLiteral("false");
                        return false;
                    case 'n':
                        ExpectLiteral("null");
                        return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9'))
                        {
                            return ParseNumber();
                        }

                        throw Error("Unexpected character '" + c + "' in JSON value.");
                }
            }

            private Dictionary<string, object> ParseObject()
            {
                EnterContainer();
                _index++; // '{'
                var result = new Dictionary<string, object>(StringComparer.Ordinal);
                SkipWhitespace();
                if (!AtEnd && _text[_index] == '}')
                {
                    _index++;
                    ExitContainer();
                    return result;
                }

                while (true)
                {
                    SkipWhitespace();
                    if (AtEnd || _text[_index] != '"')
                    {
                        throw Error("Expected a quoted object key.");
                    }

                    string key = ParseString();
                    SkipWhitespace();
                    if (AtEnd || _text[_index] != ':')
                    {
                        throw Error("Expected ':' after object key.");
                    }

                    _index++;
                    SkipWhitespace();
                    result[key] = ParseValue();
                    SkipWhitespace();
                    if (AtEnd)
                    {
                        throw Error("Unterminated JSON object.");
                    }

                    char separator = _text[_index++];
                    if (separator == '}')
                    {
                        ExitContainer();
                        return result;
                    }

                    if (separator != ',')
                    {
                        throw Error("Expected ',' or '}' in JSON object.");
                    }
                }
            }

            private List<object> ParseArray()
            {
                EnterContainer();
                _index++; // '['
                var result = new List<object>();
                SkipWhitespace();
                if (!AtEnd && _text[_index] == ']')
                {
                    _index++;
                    ExitContainer();
                    return result;
                }

                while (true)
                {
                    SkipWhitespace();
                    result.Add(ParseValue());
                    SkipWhitespace();
                    if (AtEnd)
                    {
                        throw Error("Unterminated JSON array.");
                    }

                    char separator = _text[_index++];
                    if (separator == ']')
                    {
                        ExitContainer();
                        return result;
                    }

                    if (separator != ',')
                    {
                        throw Error("Expected ',' or ']' in JSON array.");
                    }
                }
            }

            private string ParseString()
            {
                _index++; // opening quote
                var builder = new StringBuilder();
                while (true)
                {
                    if (AtEnd)
                    {
                        throw Error("Unterminated JSON string.");
                    }

                    char c = _text[_index++];
                    if (c == '"')
                    {
                        return builder.ToString();
                    }

                    if (c == '\\')
                    {
                        if (AtEnd)
                        {
                            throw Error("Unterminated escape sequence in JSON string.");
                        }

                        char escaped = _text[_index++];
                        switch (escaped)
                        {
                            case '"':
                                builder.Append('"');
                                break;
                            case '\\':
                                builder.Append('\\');
                                break;
                            case '/':
                                builder.Append('/');
                                break;
                            case 'b':
                                builder.Append('\b');
                                break;
                            case 'f':
                                builder.Append('\f');
                                break;
                            case 'n':
                                builder.Append('\n');
                                break;
                            case 'r':
                                builder.Append('\r');
                                break;
                            case 't':
                                builder.Append('\t');
                                break;
                            case 'u':
                                builder.Append(ParseUnicodeEscape());
                                break;
                            default:
                                throw Error("Invalid escape sequence '\\" + escaped + "' in JSON string.");
                        }
                    }
                    else if (c < 0x20)
                    {
                        throw Error("Unescaped control character in JSON string.");
                    }
                    else
                    {
                        builder.Append(c);
                    }
                }
            }

            private char ParseUnicodeEscape()
            {
                if (_index + 4 > _text.Length)
                {
                    throw Error("Incomplete unicode escape sequence in JSON string.");
                }

                int code = 0;
                for (int i = 0; i < 4; i++)
                {
                    int value = HexValue(_text[_index + i]);
                    if (value < 0)
                    {
                        throw Error("Invalid unicode escape sequence in JSON string.");
                    }

                    code = (code << 4) | value;
                }

                _index += 4;
                return (char)code;
            }

            private object ParseNumber()
            {
                int start = _index;
                if (!AtEnd && _text[_index] == '-')
                {
                    _index++;
                }

                if (AtEnd)
                {
                    throw Error("Invalid JSON number.");
                }

                char c = _text[_index];
                if (c == '0')
                {
                    _index++;
                    if (!AtEnd && IsDigit(_text[_index]))
                    {
                        throw Error("Invalid JSON number: leading zero.");
                    }
                }
                else if (c >= '1' && c <= '9')
                {
                    _index++;
                    while (!AtEnd && IsDigit(_text[_index]))
                    {
                        _index++;
                    }
                }
                else
                {
                    throw Error("Invalid JSON number.");
                }

                if (!AtEnd && _text[_index] == '.')
                {
                    _index++;
                    if (AtEnd || !IsDigit(_text[_index]))
                    {
                        throw Error("Invalid JSON number: missing fraction digits.");
                    }

                    while (!AtEnd && IsDigit(_text[_index]))
                    {
                        _index++;
                    }
                }

                if (!AtEnd && (_text[_index] == 'e' || _text[_index] == 'E'))
                {
                    _index++;
                    if (!AtEnd && (_text[_index] == '+' || _text[_index] == '-'))
                    {
                        _index++;
                    }

                    if (AtEnd || !IsDigit(_text[_index]))
                    {
                        throw Error("Invalid JSON number: missing exponent digits.");
                    }

                    while (!AtEnd && IsDigit(_text[_index]))
                    {
                        _index++;
                    }
                }

                string raw = _text.Substring(start, _index - start);
                double parsed;
                if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out parsed))
                {
                    throw Error("JSON number is out of range: " + raw);
                }

                return parsed;
            }

            private void ExpectLiteral(string literal)
            {
                if (_index + literal.Length > _text.Length ||
                    string.CompareOrdinal(_text, _index, literal, 0, literal.Length) != 0)
                {
                    throw Error("Invalid JSON literal, expected '" + literal + "'.");
                }

                _index += literal.Length;
            }

            private void SkipWhitespace()
            {
                while (!AtEnd)
                {
                    char c = _text[_index];
                    if (c == ' ' || c == '\t' || c == '\r' || c == '\n')
                    {
                        _index++;
                    }
                    else
                    {
                        break;
                    }
                }
            }

            private void EnterContainer()
            {
                _depth++;
                if (_depth > MaxDepth)
                {
                    throw Error("JSON nesting is too deep.");
                }
            }

            private void ExitContainer()
            {
                _depth--;
            }

            private JsonFormatException Error(string message)
            {
                return new JsonFormatException(message + " (offset " + _index.ToString(CultureInfo.InvariantCulture) + ")");
            }

            private static bool IsDigit(char c)
            {
                return c >= '0' && c <= '9';
            }

            private static int HexValue(char c)
            {
                if (c >= '0' && c <= '9')
                {
                    return c - '0';
                }

                if (c >= 'a' && c <= 'f')
                {
                    return c - 'a' + 10;
                }

                if (c >= 'A' && c <= 'F')
                {
                    return c - 'A' + 10;
                }

                return -1;
            }
        }
    }
}
