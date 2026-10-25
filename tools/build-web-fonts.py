"""Build local WOFF2 fonts without changing the original TTF sources.

Requires fonttools and brotli. Cairo's unused slant axis is pinned to normal;
its complete weight range and character map are retained.
"""
from pathlib import Path
from shutil import copyfile
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import json

root=Path(__file__).resolve().parents[1]
sources=[(root.parent/'Mobile/assets/fonts/Cairo.ttf','Cairo.woff2'),(root/'assets/fonts/NotoSansArabic-Regular.ttf','NotoSansArabic-Regular.woff2'),(root/'assets/fonts/NotoSansArabic-Bold.ttf','NotoSansArabic-Bold.woff2')]
for source,name in sources:
 font=TTFont(source);characters=set(font.getBestCmap())
 if 'fvar' in font and any(axis.axisTag=='slnt' for axis in font['fvar'].axes):font=instantiateVariableFont(font,{'slnt':0},inplace=True)
 font.flavor='woff2';target=root/'assets/fonts'/name;font.save(target)
 verified=TTFont(target)
 if set(verified.getBestCmap())!=characters:raise RuntimeError('Font characters were lost')
 print(json.dumps({'file':name,'sourceBytes':source.stat().st_size,'bytes':target.stat().st_size,'characters':len(characters)}))
copyfile(root.parent/'Mobile/assets/fonts/OFL-Cairo.txt',root/'assets/fonts/OFL-Cairo.txt')
