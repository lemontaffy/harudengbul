# 폰트 (셀프호스팅)

globals.css 의 `@font-face` 가 아래 파일명을 참조한다. **파일이 없으면 시스템 폰트로
graceful fallback** 되므로 빌드/구동은 깨지지 않는다. 용량·라이선스 때문에 레포에
바이너리를 커밋하지 않으니, 배포 전에 아래 파일을 이 디렉터리에 넣는다.

필요 파일:

- `PretendardVariable.subset.woff2` — 본문/UI(`--font-body`). KR 서브셋.
- `Paperlogy-SemiBold.subset.woff2` — 제목/숫자(`--font-display`, weight 600).
- `Paperlogy-ExtraBold.subset.woff2` — 제목 강조(`--font-display`, weight 800).
  ※ Paperlogy 는 **SemiBold·ExtraBold 2웨이트만** (전 웨이트 금지 — 용량).

## 변환·서브셋 (fonttools)

```bash
pip install fonttools brotli
# Pretendard Variable (woff2 가변) — 한국어 + 라틴 + 기호 서브셋
pyftsubset PretendardVariable.ttf \
  --output-file=PretendardVariable.subset.woff2 --flavor=woff2 \
  --layout-features='*' --unicodes="U+0000-00FF,U+1100-11FF,U+3130-318F,U+AC00-D7A3,U+2010-2027,U+2030-205E,U+20A9,U+FF01-FF60"

# Paperlogy 2웨이트 (otf/ttf → woff2 서브셋)
for w in SemiBold ExtraBold; do
  pyftsubset "Paperlogy-$w.ttf" \
    --output-file="Paperlogy-$w.subset.woff2" --flavor=woff2 \
    --unicodes="U+0000-00FF,U+1100-11FF,U+3130-318F,U+AC00-D7A3,U+2010-2027,U+20A9,U+FF01-FF60"
done
```

서비스워커(serwist `defaultCache`)가 woff2 요청을 런타임 캐시(CacheFirst)하므로,
첫 로드 후 오프라인에서도 폰트가 유지된다.
