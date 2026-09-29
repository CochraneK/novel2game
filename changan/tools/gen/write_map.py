import os, json

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'extensions', 'map.html')

# Build HTML parts
parts = []

def P(s=''):
    parts.append(s)

# CSS
CSS = """
:root { --bg:#14100e; --bg2:#1d1712; --panel:#221b15; --panel2:#2b2219; --line:#4a3a28; --text:#e8dcc8; --muted:#9a8a72; --accent:#d4a24c; --gold:#e0b657; --danger:#b8452f; --ok:#6b8e5a; --info:#4a7c9e; }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:var(--bg); color:var(--text); font-family:"Songti SC","STSong","SimSun","Noto Serif CJK SC","Microsoft YaHei",serif; font-size:14px; padding:0; overflow-x:hidden; }
.container { max-width:1100px; margin:0 auto; padding:20px 16px 60px; }
header { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:20px; flex-wrap:wrap; gap:10px; }
header h1 { font-size:22px; color:var(--gold); letter-spacing:4px; }
header .sub { color:var(--muted); font-size:12px; }
header .nav-row { display:flex; gap:8px; flex-wrap:wrap; }
header .nav-row a { color:var(--accent); text-decoration:none; border:1px solid var(--line); padding:5px 14px; border-radius:3px; font-size:12px; transition:all .15s; }
header .nav-row a:hover { background:var(--panel2); border-color:var(--accent); }
.map-stats { display:flex; gap:16px; align-items:center; padding:12px 16px; background:var(--panel); border:1px solid var(--line); border-radius:4px; margin-bottom:18px; font-size:13px; flex-wrap:wrap; }
.map-stats .stat { display:flex; align-items:center; gap:6px; }
.map-stats .stat strong { color:var(--gold); }
.map-stats .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
.dot-visited { background:var(--ok); }
.dot-current { background:var(--accent); box-shadow:0 0 6px var(--gold); }
.dot-unvisited { background:var(--muted); opacity:.4; }
.map-wrap { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:20px; overflow:auto; margin-bottom:24px; }
#mapSvg { width:100%; max-width:900px; height:auto; display:block; margin:0 auto; }
.map-tooltip { position:fixed; pointer-events:none; z-index:50; background:var(--bg2); border:1px solid var(--accent); border-radius:4px; padding:10px 14px; font-size:12px; line-height:1.6; max-width:280px; opacity:0; transition:opacity .15s; }
.map-tooltip.show { opacity:1; }
.map-tooltip .tt-title { color:var(--gold); font-weight:bold; font-size:14px; }
.map-tooltip .tt-sub { color:var(--muted); font-size:11px; }
.map-tooltip .tt-status { margin-top:4px; font-size:11px; }
.loc-section { margin-bottom:24px; }
.loc-section h2 { font-size:15px; color:var(--gold); letter-spacing:2px; border-left:3px solid var(--accent); padding-left:10px; margin-bottom:12px; }
.loc-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px,1fr)); gap:8px; }
.loc-item { display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--panel2); border:1px solid var(--line); border-radius:3px; font-size:12px; cursor:pointer; transition:all .15s; }
.loc-item:hover { border-color:var(--accent); }
.loc-item .loc-icon { font-size:16px; flex-shrink:0; }
.loc-item .loc-name { flex:1; }
.loc-item .loc-scenes { color:var(--muted); font-size:11px; }
.loc-item .loc-badge { font-size:9px; padding:1px 6px; border-radius:2px; flex-shrink:0; }
.loc-badge.visited { background:rgba(107,142,90,.15); color:var(--ok); border:1px solid rgba(107,142,90,.3); }
.loc-badge.current { background:rgba(212,162,76,.15); color:var(--gold); border:1px solid rgba(212,162,76,.3); }
.loc-badge.unvisited { background:transparent; color:var(--muted); border:1px solid var(--line); }
@media (max-width:640px) { .container { padding:12px 8px 40px; } header h1 { font-size:17px; } .loc-grid { grid-template-columns:1fr; } }
"""

P('<!DOCTYPE html>')
P('<html lang="zh-CN">')
P('<head><meta charset="UTF-8">')
P('<meta name="viewport" content="width=device-width,initial-scale=1.0">')
P('<title>长安舆图 · 场景地图</title>')
P('<link rel="icon" href="data:,">')
P(f'<style>{CSS}</style></head><body>')
P('<div class="container">')

# Header
P('<header>')
P('<div><h1>🗺️长安舆图</h1><div class="sub">长安城一百零八坊 · 剧情场景地图</div></div>')
P('<div class="nav-row">')
P('<a href="../index.html">🎮 长安游戏</a>')
P('<a href="hub.html">🏮 总控台/a>')
P('<a href="../results.html">📜 结局图鉴</a>')
P('</div></header>')

# Stats bar (populated by JS)
P('<div class="map-stats" id="statsBar">')
P('  <span class="stat">📍 当前位置: <strong id="curLoc">…/strong></span>')
P('  <span class="stat"><span class="dot dot-visited"></span> 已到访 <strong id="visitedCount">0</strong></span>')
P('  <span class="stat"><span class="dot dot-unvisited"></span> 未探索 <strong id="unvisitedCount">0</strong></span>')
P('</div>')

# SVG Map wrapper
P('<div class="map-wrap">')
P('<svg id="mapSvg" viewBox="0 0 840 960" xmlns="http://www.w3.org/2000/svg" font-family="SimSun,STSong,serif">')

# Helper: grid coords to SVG pixels
# 7 columns (0-6), 9 rows (0-8)
# Map area: x=60..780 (720px wide), y=40..920 (880px tall)
# Cell size: ~100x96
CELL_W = 100
CELL_H = 96
X0 = 60
Y0 = 40

# Grid labels
WARD_NAMES = [
    ['芳林','玄武','光化','承天','长乐','广化','永昌'],
    ['修德','宫城','辅兴','皇城','永兴','安兴','崇仁'],
    ['群贤','宫城','颁政','皇城','靖安','靖安','胜业'],
    ['怀德','金光','布政','朱雀','崇义','长兴','宣阳'],
    ['崇化','延康','延寿','朱雀','丰乐','安业','亲仁'],
    ['丰邑','待贤','西市','延寿','通轨','平康','宣平'],
    ['和会','常安','西市','醴泉','永乐','平康','升平'],
    ['永平','和平','义宁','光德','兴道','务本','修行'],
    ['通轨','归义','大通','善和','开化','崇义','长兴'],
]

def cell_rect(cx, cy):
    x = X0 + cx * CELL_W
    y = Y0 + cy * CELL_H
    return x, y, CELL_W, CELL_H

def cell_center(cx, cy):
    return X0 + cx * CELL_W + CELL_W//2, Y0 + cy * CELL_H + CELL_H//2

# Draw grid
for ry in range(9):
    for rx in range(7):
        x, y, w, h = cell_rect(rx, ry)
        name = WARD_NAMES[ry][rx]
        # Different fill for special areas
        fill = '#1d1712'
        stroke = '#3a2a1a'
        if name == '宫城':
            fill = '#2a1a0a'
            stroke = '#5a3a1a'
        elif name == '皇城':
            fill = '#2a2018'
            stroke = '#4a3a28'
        elif name == '西市':
            fill = '#1a2a1a'
            stroke = '#3a4a28'
        elif name == '朱雀':
            fill = '#1a1a1a'
            stroke = '#3a2a1a'
        elif name == '靖安':
            fill = '#1a1a2a'
            stroke = '#2a3a5a'

        P(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="1.5" rx="2"/>')

        # Ward name text
        tx = x + w//2
        ty = y + h//2 + 3
        P(f'<text x="{tx}" y="{ty}" text-anchor="middle" fill="var(--muted)" font-size="11" opacity=".7">{name}</text>')

# Main street labels
P(f'<text x="{X0 + 2}" y="{Y0 + 9*CELL_H + 14}" fill="var(--muted)" font-size="10" opacity=".5">南· 明德门/text>')
P(f'<text x="{X0 + 7*CELL_W - 2}" y="{Y0 + 9*CELL_H + 14}" text-anchor="end" fill="var(--muted)" font-size="10" opacity=".5">北· 玄武门/text>')

# East-West divider label
cx = X0 + 7*CELL_W//2
P(f'<text x="{cx}" y="{Y0 - 6}" text-anchor="middle" fill="var(--accent)" font-size="13" font-weight="bold" opacity=".7">↓朱雀大街 ↓/text>')

# ===== Location Markers =====
# Map from place name to grid pos (cx, cy)
LOCS = {
    '死牢': (2, 8, '🔒', '死牢'),
    '靖安司': (2, 2, '🏛️', '靖安司'),
    '案牍库': (2, 2, '📜', '案牍库'),
    '西市': (1, 5, '🏪', '西市'),
    '西市深处': (1, 5, '🏪', '西市深处'),
    '西市老铺': (1, 5, '🏚️', '老铺'),
    '胡饼摊': (1, 4, '🫓', '胡饼摊'),
    '香铺': (1, 5, '🏺', '香铺'),
    '平康坊': (5, 5, '🌙', '平康坊'),
    '望楼': (3, 6, '🏗️', '望楼'),
    '望楼顶': (3, 6, '🏗️', '望楼顶'),
    '兴庆宫': (5, 1, '🏯', '兴庆宫'),
    '灯楼底': (5, 1, '🏯', '灯楼'),
    '灯楼火中': (5, 1, '🔥', '灯楼·火'),
    '灯楼顶': (5, 1, '🔥', '灯楼·顶'),
    '右骁卫': (1, 2, '⚔️', '右骁卫'),
    '三不管夹道': (1, 6, '🚪', '三不管'),
    '暗巷': (2, 5, '🌑', '暗巷'),
    '废弃宅院': (2, 5, '🏚️', '废宅'),
    '宵禁街': (3, 3, '🚫', '宵禁街'),
    '街上': (2, 4, '🏘️', '街上'),
    '茶棚': (2, 4, '🍵', '茶棚'),
}

# Build groups for each location marker
# We'll do grouped markers so the JS can toggle them
# For now draw them as circle+label combos

marker_id = 0
for loc_key, (gx, gy, emoji, short) in LOCS.items():
    x, y = cell_center(gx, gy)
    # Stagger multiple markers in same cell
    marker_id += 1
    id_ = f'mkr_{marker_id}'

    # Draw the marker group
    P(f'<g id="{id_}" class="loc-marker" data-loc="{loc_key}" data-short="{short}" data-grid="{gx},{gy}" transform="translate({x},{y})" style="cursor:pointer">')

    # Circle background
    P(f'<circle r="16" fill="var(--bg2)" stroke="var(--line)" stroke-width="2" class="mkr-ring"/>')
    # Emoji text
    P(f'<text text-anchor="middle" y="5" font-size="18" class="mkr-icon">{emoji}</text>')
    # Label below
    P(f'<text text-anchor="middle" y="32" fill="var(--accent)" font-size="11" font-weight="bold" class="mkr-label">{short}</text>')

    P('</g>')

P('</svg>')
P('</div>')

# Tooltip
P('<div class="map-tooltip" id="mapTooltip">')
P('<div class="tt-title" id="ttTitle"></div>')
P('<div class="tt-sub" id="ttSub"></div>')
P('<div class="tt-status" id="ttStatus"></div>')
P('</div>')

# Location list (below map)
P('<div class="loc-section">')
P('<h2>📍 全场景地点/h2>')
P('<div class="loc-grid" id="locGrid"></div>')
P('</div>')

P('</div><!-- container -->')

# JavaScript
JS = """
const SAVE_KEY = 'changan-save-v1';

function getSaveData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

// Map: scene place text -> our internal key
const PLACE_TO_KEY = {
  '长安 · 死牢':'死牢',
  '靖安司':'靖安司','靖安司· 廊下':'靖安司','靖安司· 案牍库':'案牍库',
  '靖安司· 门外':'靖安司','靖安司· 门槛':'靖安司',
  '西市':'西市','西市 · 巷战':'西市','西市 · 深处':'西市深处',
  '西市 · 老铺':'西市老铺','西市 · 胡饼摊前':'胡饼摊',
  '香铺':'香铺',
  '平康坊· 地下暗市':'平康坊',
  '长安 · 望楼':'望楼','长安 · 望楼顶':'望楼顶',
  '兴庆宫':'兴庆宫','兴庆宫· 灯楼':'兴庆宫',
  '兴庆宫· 灯楼底':'灯楼底','灯楼 · 火中':'灯楼火中','灯楼 · 顶':'灯楼顶',
  '右骁卫军营':'右骁卫',
  '长安 · 三不管夹道':'三不管夹道','长安 · 暗巷':'暗巷',
  '长安 · 废弃宅院':'废弃宅院','长安 · 宵禁街':'宵禁街',
  '长安 · 街上':'街上','长安 · 茶棚':'茶棚',
};

// Visited scenes from save data (flags contain scene visit info indirectly)
// We determine visited locations from the save's flags and sceneId
function getVisitedKeys(save) {
  const keys = new Set();
  if (!save) return keys;

  // The save has sceneId - current scene
  // And flags - past visited nodes
  // We map scenes to locations via PLACE_TO_KEY
  // Since we don't have scene-to-place mapping here, use the save's flags
  // which contain visited nodes as flag names for visited scene ids

  // Current scene
  const curPlace = PLACE_TO_KEY[save.sceneId];
  if (curPlace) keys.add(curPlace);

  // From flags, extract scene id prefixes
  // We'll use a simpler approach: check scene-visit flags
  // If one exists, add related location

  return keys;
}

function init() {
  const save = getSaveData();
  const visited = new Set();
  let currentLoc = '…';

  if (save) {
    // Try to determine current location from sceneId
    const curPlace = PLACE_TO_KEY[save.sceneId];
    if (curPlace) currentLoc = curPlace;

    // Mark visited: from flags named after specific scene-visit patterns
    // and the current scene
    if (curPlace) visited.add(curPlace);

    // Also check flags that might indicate visited locations
    const flagLocMap = {
      'went_willingly':'靖安司','cautious':'靖安司',
      'entered_jingsi':'靖安司','xichat':'西市',
      'talked_to_ge':'平康坊','huwei':'右骁卫',
      'climb_wanglou':'望楼','visited_qinglong':'兴庆宫',
      'entered_denglou':'灯楼底',
    };
    if (save.flags) {
      save.flags.forEach(f => {
        if (flagLocMap[f]) visited.add(flagLocMap[f]);
      });
    }
  }

  // Update stats
  const allMarkerKeys = Object.keys(PLACE_TO_KEY).map(k => PLACE_TO_KEY[k]);
  const uniqueLocs = [...new Set(allMarkerKeys)];

  document.getElementById('curLoc').textContent = currentLoc;
  document.getElementById('visitedCount').textContent = visited.size;
  document.getElementById('unvisitedCount').textContent = uniqueLocs.length - visited.size;

  // Update SVG markers
  document.querySelectorAll('.loc-marker').forEach(g => {
    const loc = g.dataset.loc;
    const ring = g.querySelector('.mkr-ring');
    const label = g.querySelector('.mkr-label');
    if (loc === currentLoc) {
      ring.setAttribute('fill', 'var(--accent)');
      ring.setAttribute('stroke', 'var(--gold)');
      label.setAttribute('fill', 'var(--gold)');
      g.style.opacity = '1';
    } else if (visited.has(loc)) {
      ring.setAttribute('fill', 'rgba(107,142,90,.25)');
      ring.setAttribute('stroke', 'var(--ok)');
      label.setAttribute('fill', 'var(--ok)');
      g.style.opacity = '1';
    } else {
      ring.setAttribute('fill', 'transparent');
      ring.setAttribute('stroke', 'var(--line)');
      label.setAttribute('fill', 'var(--muted)');
      g.style.opacity = '.6';
    }
  });

  // Build location grid
  const grid = document.getElementById('locGrid');
  const locList = [
    {key:'死牢',icon:'🔒',name:'死牢',sceneCount:3},
    {key:'靖安司',icon:'🏛️',name:'靖安司',sceneCount:17},
    {key:'案牍库',icon:'📜',name:'案牍库',sceneCount:3},
    {key:'西市',icon:'🏪',name:'西市',sceneCount:6},
    {key:'西市深处',icon:'🏪',name:'西市深处',sceneCount:3},
    {key:'西市老铺',icon:'🏚️',name:'老铺',sceneCount:3},
    {key:'胡饼摊',icon:'🫓',name:'胡饼摊',sceneCount:1},
    {key:'香铺',icon:'🏺',name:'香铺',sceneCount:5},
    {key:'平康坊',icon:'🌙',name:'平康坊·暗市',sceneCount:4},
    {key:'望楼',icon:'🏗️',name:'望楼',sceneCount:3},
    {key:'望楼顶',icon:'🏗️',name:'望楼顶',sceneCount:1},
    {key:'兴庆宫',icon:'🏯',name:'兴庆宫',sceneCount:1},
    {key:'灯楼底',icon:'🏯',name:'灯楼',sceneCount:5},
    {key:'灯楼火中',icon:'🔥',name:'灯楼·火中',sceneCount:1},
    {key:'灯楼顶',icon:'🔥',name:'灯楼·顶',sceneCount:4},
    {key:'右骁卫',icon:'⚔️',name:'右骁卫军营',sceneCount:5},
    {key:'三不管夹道',icon:'🚪',name:'三不管夹道',sceneCount:3},
    {key:'暗巷',icon:'🌑',name:'暗巷',sceneCount:3},
    {key:'废弃宅院',icon:'🏚️',name:'废弃宅院',sceneCount:4},
    {key:'宵禁街',icon:'🚫',name:'宵禁街',sceneCount:1},
    {key:'街上',icon:'🏘️',name:'街上',sceneCount:4},
    {key:'茶棚',icon:'🍵',name:'茶棚',sceneCount:1},
  ];

  grid.innerHTML = locList.map(l => {
    const v = visited.has(l.key);
    const c = l.key === currentLoc;
    const badge = c ? 'current' : (v ? 'visited' : 'unvisited');
    const badgeLabel = c ? '当前' : (v ? '已到访' : '未探索');
    return `<div class="loc-item" data-loc="${l.key}">
      <span class="loc-icon">${l.icon}</span>
      <span class="loc-name">${l.name}</span>
      <span class="loc-scenes">${l.sceneCount} 场景</span>
      <span class="loc-badge ${badge}">${badgeLabel}</span>
    </div>`;
  }).join('');
}

// Tooltip logic
const tooltip = document.getElementById('mapTooltip');
const ttTitle = document.getElementById('ttTitle');
const ttSub = document.getElementById('ttSub');
const ttStatus = document.getElementById('ttStatus');

document.addEventListener('mouseover', e => {
  const g = e.target.closest('.loc-marker');
  if (!g) { tooltip.classList.remove('show'); return; }
  const loc = g.dataset.loc;
  const short = g.dataset.short;
  const grid = g.dataset.grid;
  ttTitle.textContent = short || loc;
  ttSub.textContent = '坊格: ' + grid;
  ttStatus.textContent = '已到访场景· 点击定位';
  tooltip.classList.add('show');
});

document.addEventListener('mousemove', e => {
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top = (e.clientY + 14) + 'px';
});

document.addEventListener('mouseout', e => {
  if (e.target.closest('.loc-marker')) tooltip.classList.remove('show');
});

// Click location item to scroll to marker
document.addEventListener('click', e => {
  const item = e.target.closest('.loc-item');
  if (!item) return;
  const loc = item.dataset.loc;
  const marker = document.querySelector(`.loc-marker[data-loc="${loc}"]`);
  if (marker) {
    marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Flash effect
    marker.style.transition = 'opacity .3s';
    marker.style.opacity = '0.3';
    setTimeout(() => { marker.style.opacity = ''; }, 600);
  }
});

init();
"""

P('<div class="map-tooltip" id="mapTooltip">')
P('<div class="tt-title" id="ttTitle"></div>')
P('<div class="tt-sub" id="ttSub"></div>')
P('<div class="tt-status" id="ttStatus"></div>')
P('</div>')

P(f'<script>{JS}</script>')
P('</body></html>')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(parts))

print(f'Written {len(parts)} lines to {OUT}')
