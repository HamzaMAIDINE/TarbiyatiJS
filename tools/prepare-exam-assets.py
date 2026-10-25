"""Preserve the supplied exam scans under stable, web-safe names."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
files = sorted((ROOT / 'QCM Exams').glob('*.jpeg'))
if len(files) != 47:
    raise SystemExit('Expected the 47 reviewed source images; check the mapping before importing.')
pages = {
    2023: [27, 26, 25, 24, 23, 29, 21, 22, 19, 18, 17, 20],
    2024: [14, 13, 15, 11, 10, 9, 8, 7, 12, 5, 4, 3, 2, 1, 6],
    2025: [45, 35, 37, 38, 39, 33, 42, 47, 40, 34, 44, 41, 43],
}
keys = {2023: [16], 2024: [], 2025: [32, 31, 30, 36, 28]}
manifest = {}

def preserve(index, relative):
    source = files[index - 1]
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return {'url': '/' + relative, 'originalFile': source.name,
            'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}

for year, indices in pages.items():
    manifest[str(year)] = {
        'pages': [preserve(index, f'assets/exams/{year}/page-{page:02}.jpg')
                  for page, index in enumerate(indices, 1)],
        'corrections': [preserve(index, f'assets/exams/{year}/correction-{page:02}.jpg')
                        for page, index in enumerate(keys[year], 1)]
    }
manifest['unassigned'] = preserve(46, 'assets/exams/unassigned-q79.jpg')
(ROOT / 'content/exams/sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Preserved 40 exam pages, 6 correction images and 1 undated question crop.')
