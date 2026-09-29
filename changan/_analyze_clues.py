# -*- coding: utf-8 -*-
import re
from pathlib import Path

root = Path(__file__).parent
s = (root / 'src/data/scenes.js').read_text(encoding='utf-8')

# Extract clue values from choices: clue: '...'
clues = re.findall(r"clue:\s*'([^']+)'", s)
print('total clue-bearing choices:', len(clues))

pips = {
 'wolf_pack(5)':['狼卫','西域','胡人','夹道','西市','货栈','阙勒霍多','跟踪','脚印'],
 'kelehuoduo(4)':['阙勒霍多','油罐','西市','胡人','西域','货栈','兴庆宫','灯楼'],
 'longbo_truth(4)':['龙波','萧规','第八团','烽燧堡','动机','鱼肠','理解','对峙'],
 'jingsi_intrigue(4)':['靖安司','李必','徐宾','军械','元载','朝堂','文书','围','调兵'],
}
thresholds = {'wolf_pack(5)':5,'kelehuoduo(4)':4,'longbo_truth(4)':4,'jingsi_intrigue(4)':4}
print()
for name,kws in pips.items():
    cov=[kw for kw in kws if any(kw in c for c in clues)]
    th = thresholds[name]
    ok = 'REACHABLE' if len(cov)>=th else 'NOT-reachable'
    print(f'{name:18s} covered {len(cov)}/{len(kws)} (need {th}) -> {ok}')
    print(f'     covered: {cov}')
    print(f'     missing: {[k for k in kws if k not in cov]}')

print()
print('ALL unique clues (%d):' % len(set(clues)))
for c in sorted(set(clues)):
    print('  -', c)
