# Third-Party Notices

The Industrial Digital Twin Simulator is built from the following third-party
components. Their licenses apply to those components; this file is provided for
attribution and does not modify those licenses.

## Three.js

- Project: Three.js — https://threejs.org/
- Version: 0.170.0
- Vendored files:
  - `web/vendor/three.module.js` (core library)
  - `web/vendor/addons/controls/OrbitControls.js`
  - `web/vendor/addons/utils/BufferGeometryUtils.js`
- License: MIT

```
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Microsoft Edge WebView2

- Components: `Microsoft.Web.WebView2` NuGet package (`Microsoft.Web.WebView2.Core.dll`,
  `Microsoft.Web.WebView2.WinForms.dll`, `WebView2Loader.dll`), and the Microsoft Edge
  WebView2 Runtime installed on the user's machine.
- Project/docs: https://learn.microsoft.com/microsoft-edge/webview2/
- License: Microsoft license terms for the WebView2 SDK and Runtime. The SDK's
  redistributable binaries are included in the portable package under Microsoft's
  redistribution terms; the WebView2 Runtime itself is a machine-level Microsoft
  component and is not redistributed with this application.

## .NET Framework 4.8

- The desktop shell targets .NET Framework 4.8, which is a Microsoft Windows
  component and is not redistributed with this application.
- Reference assemblies (`Microsoft.NETFramework.ReferenceAssemblies` NuGet package)
  are used at build time only and are not included in the portable package.
- License: Microsoft .NET Framework license terms — https://dotnet.microsoft.com/

## Build-time tooling (not distributed)

- .NET 8 SDK — MIT license — https://dotnet.microsoft.com/ (used to build the
  .NET Framework application; not required by end users).
- NuGet packages are restored at build time and pinned in
  `desktop/IndustrialDigitalTwinSimulator.csproj`.

## Trademarks

Microsoft, Windows, and Microsoft Edge are trademarks of Microsoft Corporation.
All other product names are trademarks or registered trademarks of their
respective owners.
