/* איורי הבגדים – SVG מצוירים ביד. כל איור על לוח 100×100. */
(function () {
  var INK = '#2d2a4a';

  function star(cx, cy, r, fill) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 5 * i - Math.PI / 2;
      var rr = i % 2 ? r * 0.45 : r;
      p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return '<polygon points="' + p.join(' ') + '" fill="' + (fill || '#ffe066') + '" stroke="none"/>';
  }
  function moon(cx, cy, r, fill) {
    return '<path d="M' + (cx + r * 0.3) + ' ' + (cy - r) + 'a' + r + ' ' + r + ' 0 1 0 ' + (r * 0.7) + ' ' + (r * 1.6) +
      'a' + (r * 0.8) + ' ' + (r * 0.8) + ' 0 0 1 -' + (r * 0.7) + ' -' + (r * 1.6) + 'z" fill="' + (fill || '#ffe066') + '" stroke="none"/>';
  }
  function shine(d) {
    return '<path d="' + d + '" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3.5"/>';
  }
  function wrap(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="' + INK +
      '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g></svg>';
  }

  var PANTS = 'M27 24h46l5 66H56L50 46l-6 44H22z';
  var LONG_SHIRT = 'M36 14L18 22 10 72l11 2 7-30v44h44V44l7 30 11-2-8-50-18-8-14 10z';

  var ICONS = {
    jeans: wrap(
      '<path d="M27 12h46v12H27z" fill="#3a6ad4"/>' +
      '<path d="' + PANTS + '" fill="#4f8ef7"/>' +
      '<path d="M50 24v20" fill="none"/>' +
      '<path d="M32 28c2 9 9 11 13 4M68 28c-2 9-9 11-13 4" fill="none" stroke="#ffd166" stroke-width="2" stroke-dasharray="3 3"/>' +
      '<path d="M35 12v12M65 12v12" fill="none" stroke-width="2"/>' +
      '<path d="M23 82h21M56.5 82h21" fill="none" stroke-width="2.5"/>' +
      '<circle cx="50" cy="18" r="2.6" fill="#ffd166"/>' +
      shine('M31 40l-2 30')
    ),
    tshirt: wrap(
      '<path d="M36 14l-20 10-8 16 13 7 5-6v45h48V41l5 6 13-7-8-16-20-10c-2 7-7 11-14 11s-12-4-14-11z" fill="#ff6b6b"/>' +
      '<path d="M40 16c2 4 6 6 10 6s8-2 10-6" fill="none" stroke-width="2"/>' +
      '<path d="M50 68c-8-5-12-9-12-13a6 6 0 0 1 12-3a6 6 0 0 1 12 3c0 4-4 8-12 13z" fill="#ffd166"/>' +
      shine('M31 46v30')
    ),
    pjpants: wrap(
      '<path d="M27 14h46v10H27z" fill="#7b4fd6"/>' +
      '<path d="' + PANTS + '" fill="#9b6dff"/>' +
      '<path d="M22.6 82h21.4l-1 8H22zM56 82h21.5l.5 8H57z" fill="#7b4fd6"/>' +
      '<path d="M46 24l-3 11M54 24l3 11" fill="none" stroke="#ffd166" stroke-width="2.5"/>' +
      star(33, 40, 4.5) + star(66, 50, 4) + star(30, 66, 3.5) + star(70, 70, 4.5) + moon(38, 54, 4) + moon(63, 36, 3.5) +
      shine('M30 44l-1.5 18')
    ),
    pjshirt: wrap(
      '<path d="' + LONG_SHIRT + '" fill="#4cc9f0"/>' +
      '<path d="M18 22l-2 12M82 22l2 12" fill="none" stroke-width="2"/>' +
      '<path d="M13 64l10 2M87 64l-10 2" fill="none" stroke-width="2.5"/>' +
      '<path d="M50 24v64" fill="none" stroke-width="2"/>' +
      '<path d="M36 14l14 10-7 9-10-15zM64 14L50 24l7 9 10-15z" fill="#fff"/>' +
      '<rect x="56" y="42" width="11" height="11" rx="2" fill="#3aa8d4"/>' +
      moon(60, 47.5, 3) +
      star(36, 50, 3.5, '#fff') + star(40, 72, 3, '#fff') + star(63, 70, 3.5, '#fff') +
      '<circle cx="50" cy="44" r="2.3" fill="#ffd166" stroke-width="1.5"/><circle cx="50" cy="58" r="2.3" fill="#ffd166" stroke-width="1.5"/><circle cx="50" cy="72" r="2.3" fill="#ffd166" stroke-width="1.5"/>'
    ),
    hat: wrap(
      '<ellipse cx="50" cy="70" rx="42" ry="11" fill="#2b2d42"/>' +
      '<path d="M27 68c-2-18 0-34 10-40 5-3 9 3 13 3s8-6 13-3c10 6 12 22 10 40-7 3-15 4-23 4s-16-1-23-4z" fill="#3d405b"/>' +
      '<path d="M27.5 57c7 3 15 4 22.5 4s15.5-1 22.5-4l.5 11c-7 3-15 4-23 4s-16-1-23-4z" fill="#ff9f1c"/>' +
      '<path d="M44 33c3 4 9 4 12 0" fill="none" stroke-width="2"/>' +
      shine('M38 36c-3 6-4 12-4 18') + shine('M20 72c6 4 16 5 22 5')
    ),
    tzitzit: wrap(
      '<path d="M28 10h44a4 4 0 0 1 4 4v52H24V14a4 4 0 0 1 4-4z" fill="#fffdf6"/>' +
      '<path d="M40 10c0 9 4 14 10 14s10-5 10-14z" fill="#e7e1ff"/>' +
      '<path d="M24.5 50h51M24.5 57h51" fill="none" stroke="#1f4e9c" stroke-width="3.5"/>' +
      '<g stroke-width="2" fill="none">' +
      '<path d="M24 78l-4 16M25.5 78l-1.5 17M27 78l1 16"/><path d="M28.5 78l4 15" stroke="#2a7de1"/>' +
      '<path d="M76 78l4 16M74.5 78l1.5 17M73 78l-1 16"/><path d="M71.5 78l-4 15" stroke="#2a7de1"/>' +
      '</g>' +
      '<rect x="21.5" y="64" width="8" height="15" rx="2.5" fill="#fffdf6" stroke-width="2.2"/>' +
      '<rect x="70.5" y="64" width="8" height="15" rx="2.5" fill="#fffdf6" stroke-width="2.2"/>' +
      '<path d="M21.5 69h8M21.5 74h8M70.5 69h8M70.5 74h8" fill="none" stroke="#2a7de1" stroke-width="1.8"/>' +
      shine('M30 18v26')
    ),
    dressshirt: wrap(
      '<path d="' + LONG_SHIRT + '" fill="#f8f9ff"/>' +
      '<path d="M13 64l10 2M87 64l-10 2" fill="none" stroke-width="2.5"/>' +
      '<path d="M50 24v64" fill="none" stroke-width="2"/>' +
      '<path d="M36 14l14 10-7 10-11-16zM64 14L50 24l7 10 11-16z" fill="#cfe0ff"/>' +
      '<path d="M57 42h10v9a5 5 0 0 1-10 0z" fill="#eef2ff" stroke-width="2"/>' +
      '<circle cx="50" cy="40" r="2" fill="#cfe0ff" stroke-width="1.5"/><circle cx="50" cy="54" r="2" fill="#cfe0ff" stroke-width="1.5"/><circle cx="50" cy="68" r="2" fill="#cfe0ff" stroke-width="1.5"/><circle cx="50" cy="82" r="2" fill="#cfe0ff" stroke-width="1.5"/>' +
      '<path d="M32 46v34" fill="none" stroke="#c7d2fe" stroke-width="3"/>'
    ),
    dresspants: wrap(
      '<path d="M27 12h46v12H27z" fill="#22223b"/>' +
      '<path d="' + PANTS + '" fill="#4a4e69"/>' +
      '<rect x="44" y="14" width="12" height="8" rx="2" fill="#ffd166" stroke-width="2"/>' +
      '<path d="M50 24v20" fill="none"/>' +
      '<path d="M36 28l-3 58M64 28l3 58" fill="none" stroke="#9a8c98" stroke-width="2"/>' +
      shine('M30 30l-3 40')
    ),
    socks: wrap(
      '<g transform="translate(-24 4)">' +
      '<path d="M44 10h20v46c0 3 2 5 5 7l12 8c6 4 5 13-2 15-3 1-7 1-10-1L48 78c-4-3-5-7-4-11z" fill="#ff8fab"/>' +
      '<path d="M44 10h20v10H44z" fill="#fb6f92"/>' +
      '</g>' +
      '<path d="M44 10h20v46c0 3 2 5 5 7l12 8c6 4 5 13-2 15-3 1-7 1-10-1L48 78c-4-3-5-7-4-11z" fill="#06d6a0"/>' +
      '<path d="M44 10h20v11H44z" fill="#ffd166"/>' +
      '<path d="M44 14.5h20" fill="none" stroke="#ef476f" stroke-width="2.5"/>' +
      '<path d="M44 30h20M44 38h20" fill="none" stroke="#fff" stroke-width="2.5"/>' +
      '<path d="M44.5 64c0 6 2 10 6 13l6 2c-3-5-4-10-2-15z" fill="#118ab2" stroke-width="2"/>' +
      '<path d="M74 67c5 2 10 6 8 12-1 4-4 7-8 7 3-6 3-13 0-19z" fill="#118ab2" stroke-width="2"/>'
    ),
    underwear: wrap(
      '<path d="M22 22h56v11H22z" fill="#f4a261"/>' +
      '<path d="M22 33h56l4 46H56l-6-17-6 17H18z" fill="#ffd166"/>' +
      '<path d="M50 33v29" fill="none" stroke-width="2"/>' +
      '<g stroke="none" fill="#f15bb5"><circle cx="30" cy="44" r="3"/><circle cx="40" cy="56" r="3"/><circle cx="62" cy="44" r="3"/><circle cx="70" cy="60" r="3"/><circle cx="28" cy="66" r="3"/><circle cx="60" cy="68" r="2.5"/></g>' +
      '<path d="M30 22v11M40 22v11M60 22v11M70 22v11" fill="none" stroke="#e76f51" stroke-width="1.5"/>'
    ),
    tank: wrap(
      '<path d="M34 12h8c0 8 3 14 8 14s8-6 8-14h8c0 10 4 16 12 20v56H22V32c8-4 12-10 12-20z" fill="#80ed99"/>' +
      '<path d="M22 80h56" fill="none" stroke-width="2"/>' +
      '<path d="M34 40v34M42 44v30M50 46v28M58 44v30M66 40v34" fill="none" stroke="#57cc99" stroke-width="2"/>' +
      shine('M28 36v36')
    ),
    sweater: wrap(
      '<path d="M34 16l-16 8-8 50 12 2 8-30v42h40V46l8 30 12-2-8-50-16-8c-3 6-9 9-16 9s-13-3-16-9z" fill="#f77f00"/>' +
      '<path d="M30 79h40v9H30zM11.2 66.5l11.9 2-1.1 7.5-12-2zM88.8 66.5l-11.9 2 1.1 7.5 12-2z" fill="#e85d04" stroke-width="2.5"/>' +
      '<path d="M34 16c3 6 9 9 16 9s13-3 16-9" fill="none" stroke="#e85d04" stroke-width="4"/>' +
      '<path d="M30 48l5-5 5 5 5-5 5 5 5-5 5 5 5-5 5 5" fill="none" stroke="#fff" stroke-width="2.5"/>' +
      '<path d="M30 60l5-5 5 5 5-5 5 5 5-5 5 5 5-5 5 5" fill="none" stroke="#ffd166" stroke-width="2.5"/>' +
      '<g stroke="none" fill="#fff"><circle cx="35" cy="70" r="1.8"/><circle cx="45" cy="70" r="1.8"/><circle cx="55" cy="70" r="1.8"/><circle cx="65" cy="70" r="1.8"/></g>'
    ),
    coat: wrap(
      '<path d="M36 12L20 20l-8 56 11 2 7-28v40h40V50l7 28 11-2-8-56-16-8-14 8z" fill="#2a9d8f"/>' +
      '<path d="M36 12c1 7 6 12 14 12s13-5 14-12l-4-2c-1 6-5 9-10 9s-9-3-10-9z" fill="#e9c46a"/>' +
      '<path d="M50 24v66" fill="none"/>' +
      '<path d="M50 24v66" fill="none" stroke="#e9c46a" stroke-width="1.5" stroke-dasharray="2 2.5"/>' +
      '<rect x="47" y="34" width="6" height="8" rx="2" fill="#e9c46a" stroke-width="2"/>' +
      '<path d="M34 62h10M56 62h10" fill="none" stroke-width="2.5"/>' +
      '<path d="M13.5 66l10 2M86.5 66l-10 2" fill="none" stroke-width="2.5"/>' +
      shine('M34 30v26')
    ),
    kippah: wrap(
      '<path d="M14 66c4-26 18-40 36-40s32 14 36 40c-10 4-23 6-36 6s-26-2-36-6z" fill="#3a0ca3"/>' +
      '<path d="M21 61c4-17 14-27 29-27s25 10 29 27" fill="none" stroke="#f72585" stroke-width="4.5"/>' +
      '<path d="M30 56c3-10 10-15 20-15s17 5 20 15" fill="none" stroke="#4cc9f0" stroke-width="4.5"/>' +
      '<path d="M39 51c2-4 6-6 11-6s9 2 11 6" fill="none" stroke="#ffd166" stroke-width="4.5"/>' +
      '<path d="M14 66c10 4 23 6 36 6s26-2 36-6" fill="none"/>' +
      '<g stroke="none" fill="#fff" fill-opacity=".7"><circle cx="50" cy="31" r="2"/></g>'
    ),
    shoes: wrap(
      '<path d="M12 78V60c0-10 2-18 6-24h20c3 8 9 13 18 15l20 5c9 2 14 8 14 16v6z" fill="#b5651d"/>' +
      '<path d="M10 78h82v5a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#3d2c2e"/>' +
      '<path d="M18 36c-2 6-3 14-3 22h24" fill="none" stroke-width="2"/>' +
      '<path d="M42 44l7-5M47 49l7-5M53 52l6-5" fill="none" stroke="#ffd166" stroke-width="3"/>' +
      '<path d="M74 62c5 1 9 4 10 8" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3.5"/>'
    ),
    hanger: wrap(
      '<path d="M50 32v-4c0-4 6-5 6-10a6 6 0 0 0-12 0" fill="none" stroke-width="4"/>' +
      '<path d="M50 32L13 60c-5 4-3 10 3 10h68c6 0 8-6 3-10z" fill="none" stroke="#2d2a4a" stroke-width="5"/>' +
      '<path d="M50 32L13 60c-5 4-3 10 3 10h68c6 0 8-6 3-10z" fill="none" stroke="#ffd166" stroke-width="2"/>' +
      '<g transform="rotate(-12 64 78)"><path d="M56 70h18l4 6-4 6H56z" fill="#f15bb5"/><circle cx="72" cy="76" r="1.8" fill="#fff"/></g>' +
      star(26, 26, 6, '#4cc9f0') + star(78, 30, 4.5, '#f72585')
    ),
    towel: wrap(
      '<rect x="20" y="16" width="60" height="70" rx="6" fill="#ff99c8"/>' +
      '<path d="M20 28h60M20 74h60" fill="none" stroke-width="2.5"/>' +
      '<path d="M20 34h60M20 68h60" fill="none" stroke="#fff" stroke-width="3"/>' +
      '<path d="M26 86v6M34 86v6M42 86v6M50 86v6M58 86v6M66 86v6M74 86v6" fill="none" stroke-width="2"/>' +
      '<path d="M50 59c-6-4-9-7-9-10a4.5 4.5 0 0 1 9-2.5a4.5 4.5 0 0 1 9 2.5c0 3-3 6-9 10z" fill="#fff" stroke-width="2"/>'
    ),
    suit: wrap(
      '<path d="M34 12L18 20l-8 56 11 2 7-28v40h44V50l7 28 11-2-8-56-16-8z" fill="#1d3557"/>' +
      '<path d="M40 12h20l-10 20z" fill="#fff"/>' +
      '<path d="M48 18h4l1 4-3 26-3-26z" fill="#e63946" stroke-width="2"/>' +
      '<path d="M34 12l16 30-8 4-10-30zM66 12L50 42l8 4 10-30z" fill="#274472"/>' +
      '<circle cx="50" cy="60" r="2.2" fill="#a8dadc" stroke-width="1.5"/><circle cx="50" cy="72" r="2.2" fill="#a8dadc" stroke-width="1.5"/>' +
      '<path d="M60 56h8" fill="none" stroke-width="2.5"/>' +
      '<path d="M63 56l2-4 2 4" fill="#fff" stroke-width="1.5"/>'
    )
  };

  var ICON_NAMES = {
    jeans: "ג'ינס", tshirt: 'חולצה', pjpants: "מכנסי פיג'מה", pjshirt: "חולצת פיג'מה", hat: 'כובע',
    tzitzit: 'ציצית', dressshirt: 'חולצה מכופתרת', dresspants: 'מכנסי בד', socks: 'גרביים', underwear: 'תחתונים',
    tank: 'גופייה', sweater: 'סוודר', coat: 'מעיל', kippah: 'כיפה', shoes: 'נעליים', hanger: 'קולב', towel: 'מגבת', suit: 'חליפה'
  };

  window.ICONS = ICONS;
  window.ICON_NAMES = ICON_NAMES;
})();
