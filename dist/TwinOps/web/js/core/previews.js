/* Hand-built vector previews for the launcher cards. Fully offline, crisp at any DPI. */
export const PREVIEWS = {
  parking: `
<svg class="preview-art" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="p-ground" x1="0" y1="0" x2="0.7" y2="1"><stop stop-color="#162530"/><stop offset="1" stop-color="#091119"/></linearGradient>
    <linearGradient id="p-body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6ae7d0"/><stop offset="1" stop-color="#1d9d95"/></linearGradient>
    <linearGradient id="p-body2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#71b8ff"/><stop offset="1" stop-color="#2d6fb0"/></linearGradient>
    <filter id="p-glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="p-grid" width="26" height="15" patternUnits="userSpaceOnUse" patternTransform="matrix(0.866,0.5,-0.866,0.5,0,0)">
      <path d="M0 0h26M0 0v15" stroke="#4fc9c1" stroke-width="0.5" opacity="0.18"/>
    </pattern>
  </defs>
  <ellipse cx="320" cy="205" rx="240" ry="92" fill="#0e2730" opacity="0.34" filter="url(#p-glow)"/>
  <polygon points="70,190 320,105 568,190 320,272" fill="url(#p-ground)" stroke="#2a6670" stroke-width="1"/>
  <polygon points="70,190 320,105 568,190 320,272" fill="url(#p-grid)"/>
  <g stroke="#379a93" stroke-width="1" opacity="0.55">
    <path d="M157 155 320 250 483 155"/><path d="M225 130 320 185 415 130"/>
  </g>
  <g opacity="0.9">
    <polygon points="132,196 174,172 214,194 172,218" fill="#0d2b2b" stroke="#2b8d7d" stroke-width="1.4"/>
    <polygon points="217,208 259,184 299,206 257,230" fill="#2a2413" stroke="#a47730" stroke-width="1.3"/>
    <polygon points="303,220 345,196 385,218 343,242" fill="#0d2b2b" stroke="#2b8d7d" stroke-width="1.4"/>
    <polygon points="389,208 431,184 471,206 429,230" fill="#2a2413" stroke="#a47730" stroke-width="1.3"/>
    <polygon points="475,196 517,172 557,194 515,218" fill="#0d2b2b" stroke="#2b8d7d" stroke-width="1.4"/>
  </g>
  <g stroke="#5ce3c4" stroke-width="1.2">
    <path d="M118 208 160 184" opacity=".35"/><path d="M203 220 245 196" opacity=".35"/><path d="M289 232 331 208" opacity=".35"/>
  </g>
  <g>
    <polygon points="238,141 306,180 306,205 238,166" fill="url(#p-body)" stroke="#b5fff2" stroke-width="0.8"/>
    <polygon points="238,141 270,123 338,162 306,180" fill="#91ffe9" opacity=".9"/>
    <polygon points="270,123 338,162 338,187 306,205 306,180" fill="#1d7f82"/>
    <polygon points="257,143 287,160 287,171 257,154" fill="#0b2933" opacity=".9"/>
    <polygon points="299,167 320,179 320,190 299,178" fill="#0b2933" opacity=".9"/>
    <circle cx="264" cy="183" r="5" fill="#0a1116" stroke="#9be5dd"/><circle cx="313" cy="201" r="5" fill="#0a1116" stroke="#9be5dd"/>
    <circle cx="322" cy="183" r="3" fill="#5ce3c4" filter="url(#p-glow)"/>
  </g>
  <g>
    <polygon points="407,153 465,187 465,207 407,173" fill="url(#p-body2)" stroke="#c9e7ff" stroke-width="0.7"/>
    <polygon points="407,153 432,139 490,173 465,187" fill="#a5d4ff" opacity=".85"/>
    <polygon points="432,139 490,173 490,193 465,207 465,187" fill="#285888"/>
    <polygon points="420,156 446,171 446,182 420,167" fill="#0b2032" opacity=".92"/>
    <circle cx="428" cy="190" r="4.5" fill="#0a1116" stroke="#b9dbff"/><circle cx="473" cy="207" r="4.5" fill="#0a1116" stroke="#b9dbff"/>
  </g>
  <g>
    <polygon points="540,142 576,163 576,202 540,181" fill="#263540" stroke="#6f8fa3" stroke-width="0.8"/>
    <polygon points="540,142 557,132 593,153 576,163" fill="#405764"/>
    <polygon points="576,163 593,153 593,192 576,202" fill="#1b2934"/>
    <rect x="550" y="156" width="14" height="10" rx="1" fill="#63f0d5" opacity=".75" transform="skewY(30)"/>
    <circle cx="552" cy="177" r="2" fill="#ffb547"/>
  </g>
  <g>
    <rect x="110" y="146" width="4" height="70" rx="1" fill="#546c7a"/>
    <rect x="96" y="140" width="32" height="8" rx="2" fill="#728d9c"/>
    <polygon points="100,148 132,148 138,162 106,162" fill="#ffb547" opacity=".22"/>
    <circle cx="118" cy="146" r="14" fill="#ffcf6e" opacity=".14" filter="url(#p-glow)"/>
    <rect x="104" y="132" width="4" height="70" rx="1" fill="#546c7a" transform="translate(520 0)"/>
    <rect x="510" y="126" width="32" height="8" rx="2" fill="#728d9c"/>
    <rect x="512" y="120" width="100" height="3" rx="1.5" fill="#36e2c2" opacity=".7"/>
    <rect x="512" y="120" width="100" height="3" rx="1.5" fill="#36e2c2" opacity=".3" filter="url(#p-glow)"/>
    <rect x="606" y="110" width="4" height="26" fill="#6f8798"/>
  </g>
  <g font-family="Cascadia Mono, Consolas, monospace" fill="#7edfd2" font-size="9" opacity=".8">
    <text x="143" y="210">P-01</text><text x="228" y="222">P-04</text><text x="314" y="234">P-07</text><text x="400" y="222">P-11</text><text x="486" y="210">P-15</text>
  </g>
  <g font-family="Cascadia Mono, Consolas, monospace" font-size="8" opacity=".55">
    <text x="98" y="235" fill="#ffb547">ENTRY</text><text x="520" y="235" fill="#63b6ff">EXIT</text>
  </g>
  <g fill="#36e2c2" opacity=".55">
    <circle cx="98" cy="166" r="2.4"/><circle cx="552" cy="155" r="2.4"/><circle cx="320" cy="118" r="1.6"/>
  </g>
  <path d="M44 263h552" stroke="#2b5060" stroke-width="1" opacity=".35"/>
</svg>`,
  water: `
<svg class="preview-art" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="w-body" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#0f3c59" stop-opacity=".88"/><stop offset=".5" stop-color="#1a78a8" stop-opacity=".42"/><stop offset="1" stop-color="#0b2d44" stop-opacity=".9"/></linearGradient>
    <linearGradient id="w-water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4ac8ff"/><stop offset="1" stop-color="#1668a8"/></linearGradient>
    <radialGradient id="w-glow"><stop stop-color="#46a9ff" stop-opacity=".35"/><stop offset="1" stop-color="#46a9ff" stop-opacity="0"/></radialGradient>
    <filter id="w-blur"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <ellipse cx="330" cy="230" rx="255" ry="75" fill="url(#w-glow)"/>
  <ellipse cx="330" cy="228" rx="185" ry="48" fill="#07141f" stroke="#20577a" stroke-width="1"/>
  <ellipse cx="330" cy="228" rx="145" ry="34" fill="none" stroke="#2a6c93" stroke-width=".7" opacity=".5"/>
  <g>
    <path d="M232 90v120c0 18 44 32 98 32s98-14 98-32V90" fill="url(#w-body)" stroke="#4f98b6" stroke-width="1.2"/>
    <ellipse cx="330" cy="90" rx="98" ry="28" fill="#0a2233" stroke="#66b6d8" stroke-width="1.2"/>
    <ellipse cx="330" cy="90" rx="80" ry="20" fill="#0b2a3d" stroke="#2e6e8c" stroke-width=".7"/>
    <path d="M234 180c0-18 43-28 96-28s96 10 96 28v31c0 17-43 29-96 29s-96-12-96-29Z" fill="url(#w-water)" opacity=".72"/>
    <path d="M236 180c18 8 50 12 94 12s76-4 94-12" fill="none" stroke="#a8e9ff" stroke-width="1.5" opacity=".8"/>
    <path d="M236 182c17-5 50-8 94-8s77 3 94 8" fill="none" stroke="#4cc9ff" stroke-width=".8" opacity=".45"/>
    <path d="M258 144v14M290 150v12M330 146v16M370 148v12M402 144v14" stroke="#3b89ab" stroke-width="1" opacity=".6"/>
    <rect x="319" y="92" width="22" height="8" rx="3" fill="#0d2637" stroke="#60a7c4" stroke-width=".8"/>
    <path d="M330 100v60" stroke="#7cd4ff" stroke-width="1" stroke-dasharray="2 4" opacity=".6"/>
    <circle cx="330" cy="164" r="4" fill="#9feaff" opacity=".85" filter="url(#w-blur)"/>
    <text x="432" y="112" font-family="Cascadia Mono, monospace" font-size="10" fill="#8cdcff" opacity=".85">68.4%</text>
    <text x="432" y="125" font-family="Segoe UI, sans-serif" font-size="7" fill="#6e9ab5" opacity=".8">LEVEL</text>
  </g>
  <g stroke="#5f8fa8" stroke-width="7" fill="none" stroke-linecap="round">
    <path d="M232 200v50h-46v-9"/><path d="M428 200v50h46"/>
  </g>
  <g stroke="#8fb9cc" stroke-width="2" fill="none" opacity=".6">
    <path d="M232 200v50h-46v-9"/><path d="M428 200v50h46"/>
  </g>
  <g>
    <rect x="74" y="208" width="72" height="42" rx="7" fill="#10222e" stroke="#3e7b97" stroke-width="1"/>
    <circle cx="110" cy="229" r="14" fill="#0a1822" stroke="#43b1e8" stroke-width="1.2"/>
    <path d="M110 215v14l9 6" stroke="#7fdcff" stroke-width="2" fill="none"/>
    <circle cx="110" cy="229" r="3" fill="#43b1e8"/>
    <rect x="100" y="201" width="22" height="8" rx="2" fill="#2b4c5f"/>
    <circle cx="132" cy="216" r="2" fill="#3ce58b"/><circle cx="132" cy="224" r="2" fill="#ffb547"/>
    <text x="88" y="242" font-family="Cascadia Mono, monospace" font-size="6" fill="#78b0c9">P-01</text>
  </g>
  <g>
    <rect x="498" y="198" width="58" height="16" rx="4" fill="#1a303d" stroke="#3e7b97"/>
    <circle cx="510" cy="206" r="9" fill="#1b3d4d" stroke="#9fd9eb" stroke-width="1"/>
    <path d="M510 198v16M502 206h16" stroke="#d4f2ff" stroke-width="2"/>
    <text x="500" y="226" font-family="Cascadia Mono, monospace" font-size="7" fill="#7badc4">V-02</text>
  </g>
  <g fill="none" stroke="#46a9ff" stroke-width="1" opacity=".5">
    <circle cx="330" cy="166" r="128" stroke-dasharray="2 9"/><circle cx="330" cy="166" r="150" stroke-dasharray="1 14"/>
  </g>
  <g fill="#63d6ff" opacity=".8"><circle cx="330" cy="167" r="2"/><circle cx="463" cy="205" r="2"/><circle cx="185" cy="205" r="2"/></g>
  <path d="M54 267h532" stroke="#25506a" stroke-width="1" opacity=".35"/>
</svg>`,
  conveyor: `
<svg class="preview-art" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="c-belt" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#2b333b"/><stop offset=".5" stop-color="#3e4a55"/><stop offset="1" stop-color="#252c33"/></linearGradient>
    <linearGradient id="c-box" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e2bc85"/><stop offset="1" stop-color="#a37340"/></linearGradient>
    <radialGradient id="c-glow"><stop stop-color="#ffb547" stop-opacity=".3"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></radialGradient>
    <filter id="c-blur"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
  <ellipse cx="320" cy="208" rx="250" ry="82" fill="url(#c-glow)"/>
  <g fill="#0c171f" stroke="#374a57" stroke-width="1">
    <rect x="118" y="156" width="404" height="18" rx="9" transform="rotate(-18 118 156)"/>
    <rect x="118" y="198" width="404" height="18" rx="9" transform="rotate(-18 118 198)"/>
    <rect x="96" y="148" width="72" height="18" rx="9" transform="rotate(72 96 148)"/>
    <rect x="460" y="148" width="72" height="18" rx="9" transform="rotate(72 460 148)"/>
  </g>
  <g fill="none" stroke="#6c7d89" stroke-width="1.4">
    <path d="M142 137 506 22M142 177 506 62M142 217 506 102"/>
  </g>
  <g stroke="#1b252d" stroke-width="5" fill="none" stroke-linecap="round">
    <path d="M162 150 494 42M162 192 494 84M162 232 494 124"/>
  </g>
  <g stroke="#ffb547" stroke-width="1.2" fill="none" opacity=".65">
    <path d="M166 152 490 45M166 194 490 87M166 234 490 127"/>
  </g>
  <g fill="#61727e">
    <circle cx="203" cy="136" r="3.5"/><circle cx="253" cy="122" r="3.5"/><circle cx="303" cy="108" r="3.5"/><circle cx="353" cy="94" r="3.5"/><circle cx="403" cy="80" r="3.5"/><circle cx="453" cy="66" r="3.5"/>
  </g>
  <g>
    <polygon points="230,112 262,102 288,110 256,120" fill="url(#c-box)" stroke="#f2d6a7" stroke-width=".7"/>
    <polygon points="230,112 230,128 256,136 256,120" fill="#875a2f"/>
    <polygon points="256,120 288,110 288,126 256,136" fill="#a87846"/>
    <text x="244" y="121" font-family="Cascadia Mono, monospace" font-size="5" fill="#3b2a18">BX-08</text>
  </g>
  <g>
    <polygon points="327,87 359,77 385,85 353,95" fill="url(#c-box)" stroke="#f2d6a7" stroke-width=".7"/>
    <polygon points="327,87 327,103 353,111 353,95" fill="#875a2f"/>
    <polygon points="353,95 385,85 385,101 353,111" fill="#a87846"/>
    <text x="341" y="96" font-family="Cascadia Mono, monospace" font-size="5" fill="#3b2a18">BX-12</text>
  </g>
  <g>
    <polygon points="456,54 480,46 500,54 476,62" fill="url(#c-box)" stroke="#f2d6a7" stroke-width=".7"/>
    <polygon points="456,54 456,68 476,76 476,62" fill="#875a2f"/>
    <polygon points="476,62 500,54 500,68 476,76" fill="#a87846"/>
  </g>
  <g>
    <rect x="506" y="61" width="38" height="92" rx="6" fill="#11202b" stroke="#4b6070" stroke-width="1"/>
    <rect x="512" y="70" width="26" height="18" rx="2" fill="#0d2c34" stroke="#2a6d72"/>
    <text x="516" y="82" font-family="Cascadia Mono, monospace" font-size="6" fill="#59e2d2">SORT</text>
    <circle cx="520" cy="99" r="2.5" fill="#3ce58b"/><circle cx="529" cy="99" r="2.5" fill="#ffb547"/>
    <path d="M514 136h22" stroke="#39505f" stroke-width="3"/>
    <rect x="512" y="145" width="26" height="4" rx="2" fill="#ffb547" opacity=".55"/>
  </g>
  <g>
    <polygon points="92,172 170,146 198,156 120,182" fill="#1a2732" stroke="#a56b2f" stroke-width="1.2"/>
    <polygon points="120,182 198,156 198,210 120,236" fill="#13202b" stroke="#a56b2f" stroke-width="1.2"/>
    <text x="140" y="205" font-family="Cascadia Mono, monospace" font-size="9" fill="#ffb547" transform="skewY(18)">BIN A</text>
  </g>
  <g>
    <polygon points="438,118 510,94 538,104 466,128" fill="#1a2732" stroke="#3c93d1" stroke-width="1.2"/>
    <polygon points="466,128 538,104 538,158 466,182" fill="#13202b" stroke="#3c93d1" stroke-width="1.2"/>
    <text x="482" y="151" font-family="Cascadia Mono, monospace" font-size="9" fill="#63b6ff" transform="skewY(18)">BIN B</text>
  </g>
  <g stroke="#ffb547" stroke-width="1.5" fill="none" opacity=".85">
    <path d="M575 170 590 176 575 182"/><path d="M590 176h-18"/>
  </g>
  <g fill="none" stroke="#ffb547" stroke-width="1" opacity=".35">
    <circle cx="320" cy="148" r="126" stroke-dasharray="2 10"/>
  </g>
  <path d="M52 262h538" stroke="#3f3a2a" stroke-width="1" opacity=".35"/>
</svg>`,
  cold: `
<svg class="preview-art" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="k-wall" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#16344d"/><stop offset="1" stop-color="#0a1c2b"/></linearGradient>
    <linearGradient id="k-side" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#0b2033"/><stop offset="1" stop-color="#071521"/></linearGradient>
    <radialGradient id="k-glow"><stop stop-color="#63b6ff" stop-opacity=".35"/><stop offset="1" stop-color="#63b6ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="k-shelf" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#51718a"/><stop offset="1" stop-color="#2f4659"/></linearGradient>
    <filter id="k-blur"><feGaussianBlur stdDeviation="7"/></filter>
  </defs>
  <ellipse cx="320" cy="210" rx="250" ry="83" fill="url(#k-glow)"/>
  <g>
    <polygon points="160,92 360,52 520,106 320,156" fill="#0f2435" stroke="#3c789e" stroke-width="1.2"/>
    <polygon points="160,92 320,156 320,258 160,194" fill="url(#k-wall)" stroke="#3c789e" stroke-width="1"/>
    <polygon points="320,156 520,106 520,208 320,258" fill="url(#k-side)" stroke="#3c789e" stroke-width="1"/>
    <g stroke="#28536d" stroke-width=".7" opacity=".65">
      <path d="M160 126 320 190 520 140"/><path d="M160 160 320 224 520 174"/><path d="M240 112v132"/><path d="M400 136v118"/>
    </g>
    <path d="M160 92 360 52 520 106" fill="none" stroke="#6fc8ff" stroke-width="1.6" opacity=".8"/>
    <path d="M160 92v102M520 106v102" stroke="#6fc8ff" stroke-width="1.2" opacity=".5"/>
  </g>
  <g>
    <g transform="translate(182 160)">
      <rect x="0" y="0" width="112" height="8" rx="1" fill="url(#k-shelf)"/>
      <rect x="0" y="34" width="112" height="8" rx="1" fill="url(#k-shelf)"/>
      <rect x="0" y="68" width="112" height="8" rx="1" fill="url(#k-shelf)"/>
      <rect x="3" y="8" width="4" height="60" fill="#2b4254"/><rect x="105" y="8" width="4" height="60" fill="#2b4254"/>
      <g fill="#7fdcff" opacity=".9">
        <rect x="14" y="-12" width="17" height="12" rx="2"/><rect x="38" y="-10" width="14" height="10" rx="2"/><rect x="62" y="-13" width="18" height="13" rx="2"/><rect x="88" y="-9" width="12" height="9" rx="2"/>
        <rect x="16" y="22" width="15" height="11" rx="2" fill="#ffb547"/><rect x="41" y="24" width="16" height="9" rx="2"/><rect x="66" y="21" width="14" height="12" rx="2" fill="#a98bff"/><rect x="88" y="24" width="12" height="9" rx="2"/>
        <rect x="15" y="56" width="18" height="12" rx="2" fill="#3ce58b"/><rect x="40" y="58" width="14" height="10" rx="2"/><rect x="62" y="55" width="16" height="13" rx="2" fill="#ff6172"/><rect x="86" y="58" width="14" height="10" rx="2"/>
      </g>
    </g>
    <g transform="translate(340 172)">
      <rect x="0" y="0" width="132" height="8" rx="1" fill="url(#k-shelf)"/>
      <rect x="0" y="38" width="132" height="8" rx="1" fill="url(#k-shelf)"/>
      <rect x="0" y="76" width="132" height="8" rx="1" fill="url(#k-shelf)"/>
      <rect x="3" y="8" width="4" height="68" fill="#2b4254"/><rect x="125" y="8" width="4" height="68" fill="#2b4254"/>
      <g fill="#cfe9ff">
        <rect x="14" y="-14" width="22" height="14" rx="3"/><rect x="44" y="-12" width="18" height="12" rx="3" fill="#63b6ff"/><rect x="70" y="-15" width="24" height="15" rx="3"/><rect x="102" y="-11" width="16" height="11" rx="3"/>
        <rect x="13" y="23" width="20" height="13" rx="3" fill="#a98bff"/><rect x="43" y="26" width="17" height="10" rx="3"/><rect x="70" y="22" width="21" height="14" rx="3" fill="#3ce58b"/><rect x="99" y="25" width="20" height="11" rx="3"/>
      </g>
    </g>
  </g>
  <g>
    <rect x="440" y="176" width="26" height="62" rx="4" fill="#0b1c2a" stroke="#4d7f9c" stroke-width="1"/>
    <circle cx="453" cy="194" r="6" fill="none" stroke="#8fdcff" stroke-width="1.2"/>
    <path d="M453 188v6l4 3" stroke="#8fdcff" stroke-width="1.2" fill="none"/>
    <path d="M446 214h14M446 220h14" stroke="#376078" stroke-width="1.5"/>
  </g>
  <g>
    <polygon points="556,118 606,106 606,202 556,214" fill="#162a3b" stroke="#4d7f9c" stroke-width="1.1"/>
    <polygon points="556,118 574,112 624,124 606,130" fill="#2e4d65"/>
    <circle cx="581" cy="160" r="17" fill="none" stroke="#63b6ff" stroke-width="1.2" stroke-dasharray="3 3"/>
    <text x="576" y="164" font-family="Cascadia Mono, monospace" font-size="10" fill="#9fdcff">-18°</text>
    <rect x="566" y="186" width="28" height="3" rx="1" fill="#63b6ff" opacity=".5"/>
  </g>
  <g fill="none" stroke="#9fdcff" stroke-width="1.3" opacity=".6">
    <path d="M255 96v18M247 105h16M249 99l12 12M261 99l-12 12"/>
    <path d="M382 70v14M375 77h14M377 72l10 10M387 72l-10 10" opacity=".6"/>
  </g>
  <g>
    <circle cx="404" cy="238" r="6" fill="#36e2c2" opacity=".2" filter="url(#k-blur)"/>
    <circle cx="404" cy="238" r="2.2" fill="#36e2c2"/>
    <text x="414" y="241" font-family="Cascadia Mono, monospace" font-size="7" fill="#63b6ff" opacity=".8">ZONE A · 2.4°C</text>
  </g>
  <g fill="none" stroke="#3b6e8e" stroke-width="1" opacity=".35">
    <circle cx="334" cy="170" r="150" stroke-dasharray="2 11"/>
  </g>
  <path d="M50 264h542" stroke="#22465c" stroke-width="1" opacity=".4"/>
</svg>`,
  solar: `
<svg class="preview-art" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="s-panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d476f"/><stop offset="1" stop-color="#0a2038"/></linearGradient>
    <linearGradient id="s-panel-top" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#3d7bb8"/><stop offset="1" stop-color="#122d4a"/></linearGradient>
    <linearGradient id="s-energy" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#a98bff"/><stop offset=".5" stop-color="#46a9ff"/><stop offset="1" stop-color="#36e2c2"/></linearGradient>
    <radialGradient id="s-sun"><stop stop-color="#ffe9a8"/><stop offset=".4" stop-color="#ffc247" stop-opacity=".7"/><stop offset="1" stop-color="#ffc247" stop-opacity="0"/></radialGradient>
    <filter id="s-glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <ellipse cx="320" cy="224" rx="260" ry="68" fill="#13283a" opacity=".55"/>
  <circle cx="535" cy="62" r="40" fill="url(#s-sun)" filter="url(#s-glow)"/>
  <circle cx="535" cy="62" r="13" fill="#ffe6a0" opacity=".9"/>
  <g stroke="#ffd27a" stroke-width="1" opacity=".4">
    <path d="M535 34v-12M535 90v12M507 62h-12M563 62h12M515 42l-8-8M555 82l8 8M555 42l8-8M515 82l-8 8"/>
  </g>
  <g stroke="#4b6a83" stroke-width="8" stroke-linecap="round">
    <path d="M134 188v56M214 178v66M294 168v76"/>
    <path d="M134 244 294 168M134 244h160"/>
  </g>
  <g>
    <polygon points="88,170 208,140 268,158 148,188" fill="url(#s-panel-top)" stroke="#6aa6d8" stroke-width="1"/>
    <polygon points="88,170 148,188 148,200 88,182" fill="#0b1b2c" stroke="#375f82"/>
    <polygon points="148,188 268,158 268,170 148,200" fill="url(#s-panel)" stroke="#375f82"/>
    <g stroke="#8ec5ee" stroke-width=".6" opacity=".6">
      <path d="M118 164 148 192M148 156 178 184M178 148 208 176M208 140 238 168"/>
      <path d="M103 174 223 144M118 178 238 148M133 182 253 152"/>
    </g>
    <circle cx="255" cy="162" r="2" fill="#63f0d5" filter="url(#s-glow)"/>
  </g>
  <g transform="translate(58 18)">
    <polygon points="88,170 208,140 268,158 148,188" fill="url(#s-panel-top)" stroke="#6aa6d8" stroke-width="1" opacity=".78"/>
    <polygon points="88,170 148,188 148,198 88,180" fill="#0b1b2c" stroke="#375f82" opacity=".8"/>
    <polygon points="148,188 268,158 268,168 148,198" fill="url(#s-panel)" stroke="#375f82" opacity=".85"/>
    <g stroke="#8ec5ee" stroke-width=".6" opacity=".35">
      <path d="M118 164 148 192M148 156 178 184M178 148 208 176"/>
    </g>
  </g>
  <g transform="translate(110 36)">
    <polygon points="88,170 208,140 268,158 148,188" fill="url(#s-panel-top)" stroke="#6aa6d8" stroke-width="1" opacity=".6"/>
    <polygon points="148,188 268,158 268,168 148,198" fill="url(#s-panel)" stroke="#375f82" opacity=".6"/>
  </g>
  <g>
    <rect x="354" y="170" width="86" height="62" rx="4" fill="#10202e" stroke="#8669d9" stroke-width="1.2"/>
    <rect x="362" y="178" width="70" height="20" rx="2" fill="#07131e" stroke="#4b7d9f"/>
    <text x="369" y="191" font-family="Cascadia Mono, monospace" font-size="7" fill="#cbb8ff">CHARGE</text>
    <g fill="#233b4d" stroke="#5d7d95" stroke-width=".8">
      <rect x="363" y="204" width="30" height="21" rx="2"/><rect x="398" y="204" width="30" height="21" rx="2"/>
    </g>
    <rect x="363" y="204" width="26" height="5" fill="#a98bff" opacity=".8"/><rect x="398" y="204" width="18" height="5" fill="#a98bff" opacity=".65"/>
    <circle cx="374" cy="234" r="2" fill="#3ce58b"/><circle cx="383" cy="234" r="2" fill="#3ce58b"/>
  </g>
  <g>
    <rect x="466" y="170" width="62" height="54" rx="4" fill="#10202e" stroke="#46a9ff" stroke-width="1.1"/>
    <path d="M488 196h18M497 187v18" stroke="#7fd1ff" stroke-width="1.5"/>
    <path d="M497 181v9l-6 5h9l-4 8" fill="none" stroke="#ffd35c" stroke-width="1.4"/>
    <rect x="474" y="212" width="46" height="3" rx="1.5" fill="#35607f"/>
  </g>
  <g>
    <rect x="556" y="188" width="42" height="44" rx="5" fill="#122231" stroke="#3b607a"/>
    <path d="M566 208h22M566 216h15M566 224h19" stroke="#7c9db2" stroke-width="1.5" opacity=".6"/>
  </g>
  <g fill="none" stroke="url(#s-energy)" stroke-width="2.2" stroke-linecap="round">
    <path d="M268 168C304 168 318 190 354 194" stroke-dasharray="3 9">
      <animate attributeName="stroke-dashoffset" from="0" to="-48" dur="1.6s" repeatCount="indefinite"/>
    </path>
    <path d="M440 198C454 198 456 190 466 188" stroke-dasharray="2 8">
      <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.2s" repeatCount="indefinite"/>
    </path>
    <path d="M528 196h28" stroke-dasharray="2 7">
      <animate attributeName="stroke-dashoffset" from="0" to="-36" dur="1s" repeatCount="indefinite"/>
    </path>
  </g>
  <g fill="#8fd6ff" filter="url(#s-glow)" opacity=".9">
    <circle cx="300" cy="176" r="2.2"/><circle cx="380" cy="195" r="1.8"/><circle cx="454" cy="192" r="1.7"/><circle cx="540" cy="196" r="1.7"/>
  </g>
  <g font-family="Cascadia Mono, monospace" font-size="7" fill="#8aa9c0" opacity=".7">
    <text x="354" y="252">BATT 82%</text><text x="466" y="238">INV 98%</text><text x="150" y="265">ARRAY · 4.8 kW</text>
  </g>
  <path d="M48 266h548" stroke="#2b4660" stroke-width="1" opacity=".35"/>
</svg>`,
  game: `
<svg class="preview-art" viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0a1a2e"/><stop offset="1" stop-color="#123049"/></linearGradient>
    <linearGradient id="g-ground" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#17303d"/><stop offset="1" stop-color="#0a1a22"/></linearGradient>
    <linearGradient id="g-suit" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff8a5c"/><stop offset="1" stop-color="#c2502a"/></linearGradient>
    <filter id="g-glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="640" height="300" fill="url(#g-sky)"/>
  <polygon points="0,300 640,300 640,208 0,214" fill="url(#g-ground)"/>
  <g stroke="#2c5a6e" stroke-width="1" opacity=".5">
    <path d="M0 226 640 220"/><path d="M0 244 640 232"/><path d="M0 266 640 248"/>
  </g>
  <g opacity=".92">
    <polygon points="86,208 118,168 150,208" fill="#0f2c3e" stroke="#46a9ff" stroke-width="1.2"/>
    <rect x="105" y="182" width="26" height="26" fill="#46a9ff" opacity=".55" filter="url(#g-glow)"/>
    <g transform="translate(210,176)">
      <rect x="-16" y="-10" width="86" height="34" rx="3" fill="#101d27" stroke="#a98bff" stroke-width="1.2" transform="skewX(-16)"/>
      <rect x="72" y="-14" width="42" height="30" rx="3" fill="#181125" stroke="#a98bff" stroke-width="1" transform="skewX(-16)"/>
    </g>
    <g transform="translate(356,182)">
      <rect x="-24" y="-14" width="120" height="26" rx="4" fill="#131c22" stroke="#ffb547" stroke-width="1.2"/>
      <circle cx="12" cy="22" r="8" fill="#0e161c" stroke="#ffb547"/><circle cx="58" cy="22" r="8" fill="#0e161c" stroke="#ffb547"/>
      <rect x="-30" y="-2" width="26" height="20" rx="3" fill="#2a1d10" stroke="#ffb547" stroke-width=".8"/>
    </g>
    <g transform="translate(500,170)">
      <rect x="-22" y="-16" width="92" height="54" rx="2" fill="#1a2732" stroke="#63b6ff" stroke-width="1.2"/>
      <rect x="-8" y="-16" width="30" height="54" fill="#0f2733" stroke="#63b6ff" stroke-width=".8"/>
      <rect x="46" y="-16" width="24" height="10" fill="#22333f"/>
      <circle cx="58" cy="-20" r="4" fill="#3ce58b" filter="url(#g-glow)"/>
    </g>
  </g>
  <g>
    <rect x="120" y="150" width="8" height="60" fill="#243541"/><circle cx="124" cy="150" r="7" fill="#9fd8ef" opacity=".8"/>
    <rect x="148" y="158" width="7" height="52" fill="#243541"/><circle cx="151.5" cy="158" r="5.5" fill="#9fd8ef" opacity=".7"/>
    <rect x="176" y="164" width="6" height="46" fill="#243541"/><circle cx="179" cy="164" r="4.5" fill="#9fd8ef" opacity=".6"/>
  </g>
  <g>
    <polygon points="248,268 262,238 288,238 302,268" fill="url(#g-suit)" stroke="#ffd2bd" stroke-width="1"/>
    <circle cx="275" cy="226" r="13" fill="#1c2b36" stroke="#ff9d73" stroke-width="1.6"/>
    <rect x="262" y="246" width="26" height="10" rx="3" fill="#ffd2bd" opacity=".85"/>
    <rect x="252" y="252" width="12" height="14" rx="3" fill="#0e161c" stroke="#ff9d73" stroke-width=".8"/>
    <rect x="286" y="252" width="12" height="14" rx="3" fill="#0e161c" stroke="#ff9d73" stroke-width=".8"/>
  </g>
  <g transform="translate(462,236)">
    <rect x="-64" y="-44" width="128" height="64" rx="7" fill="#0a1219" stroke="#36e2c2" stroke-width="1.6" opacity=".95"/>
    <text x="0" y="-24" text-anchor="middle" font-family="Cascadia Mono, monospace" font-size="11" fill="#36e2c2">H2O-02 · 64%</text>
    <text x="0" y="-8" text-anchor="middle" font-family="Cascadia Mono, monospace" font-size="11" fill="#ffb547">SOL-05 · 41%</text>
    <text x="0" y="8" text-anchor="middle" font-family="Cascadia Mono, monospace" font-size="11" fill="#63b6ff">CLD-04 · -17.8°C</text>
  </g>
  <g stroke="#cfe3ef" stroke-width="1.4" opacity=".85">
    <path d="M320 118v20M310 128h20"/><circle cx="320" cy="128" r="13" fill="none" opacity=".4"/>
  </g>
  <g font-family="Cascadia Mono, monospace" font-size="8" fill="#8aa9c0" opacity=".75">
    <text x="42" y="42">WORK ORDERS 2</text><text x="42" y="56" fill="#ffb547">▸ SEAL RESERVOIR LEAK · 84s</text>
    <text x="520" y="42" text-anchor="end">SHIFT 08:42</text><text x="520" y="56" text-anchor="end" fill="#3ce58b">● 5 TWINS LINKED</text>
  </g>
</svg>`,
};
