# OPL + MAS First-Run User Guide Build Notes

This directory is the tracked rebuild entry for the Chinese `OPL + MAS 新手首次启动图文教程`.

Final deliverables are generated under:

```text
dist/user-guides/opl-mas-first-run/
```

The generated `dist/` files are intentionally ignored by git. Keep this tracked script and README as the durable handoff surface for future agents.

## Files

- `generate_user_guide.py`: source-of-truth build script for Markdown, DOCX, PDF, assets, README, and verification report.
- `dist/user-guides/opl-mas-first-run/OPL-MAS-新手首次启动图文教程.zh-CN.md`: generated Markdown source稿.
- `dist/user-guides/opl-mas-first-run/OPL-MAS-新手首次启动图文教程.docx`: generated Word manual.
- `dist/user-guides/opl-mas-first-run/OPL-MAS-新手首次启动图文教程.pdf`: generated horizontal slide-style PDF.
- `dist/user-guides/opl-mas-first-run/assets/*.png`: generated screenshot crops.
- `dist/user-guides/opl-mas-first-run/verification-report.json`: generated QA summary.

## Rebuild

Run from the repo root:

```bash
python3 scripts/user-guides/opl-mas-first-run/generate_user_guide.py
```

The script regenerates all deliverables. It does not require hand-editing files under `dist/`.

## Release Update Checklist

When OPL has a new release:

1. Check the current latest release:

   ```bash
   curl -fsSL -H 'Accept: application/vnd.github+json' \
     https://api.github.com/repos/gaofeng21cn/one-person-lab/releases/latest |
     jq -r '.tag_name + " " + .html_url'
   ```

2. Update these constants in `generate_user_guide.py`:

   - `LATEST_CHECKED_TAG`
   - `LATEST_CHECKED_URL`
   - `RELEASE_TAG`
   - `RELEASE_URL`
   - `FULL_DMG`

3. If screenshots or first-run evidence are refreshed, replace files under:

   ```text
   dist/user-guides/opl-mas-first-run/vm-screenshots/
   dist/user-guides/opl-mas-first-run/vm-artifacts/final-run/
   ```

4. Keep the user-facing download wording stable:

   - Link to `https://github.com/gaofeng21cn/one-person-lab/releases/latest`.
   - Explain the difference between Full first-install DMG and standard mac-arm64 DMG.
   - Recommend Full for first install or a clean machine.

## Screenshot Requirements

- macOS guest must use Chinese system language.
- OPL should render in Chinese.
- Desktop display must be Retina/HiDPI with effective `1920x1080`.
- Source screenshots should be `3840x2160`.
- Do not show real API keys, tokens, accounts, patient data, real hospital data, or sensitive local paths.
- The install-App screenshot should keep the natural DMG default window size. Do not enlarge the window only to fill space.

The expected display proof is recorded in:

```text
dist/user-guides/opl-mas-first-run/vm-artifacts/final-run/display-retina-effective-1080p.txt
```

## Layout Rules

- DOCX is generated from Markdown with Pandoc.
- DOCX Chinese font is forced to `Microsoft YaHei`, including East Asian font slots and theme/fontTable fallbacks.
- PDF is generated as a 16:9 horizontal slide-style document, one step per page.
- PDF notes use one consistent body font size; FAQ uses larger spacing.
- The first research task example should remain one prompt sentence.
- MAS must be presented as the OPL `Research Foundry / Med Auto Science` entry, not as a standalone install product.
- Codex API key or permission setup must say: `请联系 gflabtoken 管理员开通`.

## Verification

Run from the repo root after rebuilding:

```bash
python3 -m py_compile scripts/user-guides/opl-mas-first-run/generate_user_guide.py
pdfinfo dist/user-guides/opl-mas-first-run/OPL-MAS-新手首次启动图文教程.pdf
officecli validate dist/user-guides/opl-mas-first-run/OPL-MAS-新手首次启动图文教程.docx
officecli view dist/user-guides/opl-mas-first-run/OPL-MAS-新手首次启动图文教程.docx outline
```

The script also renders the PDF at 150 dpi to:

```text
tmp/pdfs/opl-mas-first-run/render-pandoc/
```

Review `contact-sheet.png` and selected page images before handing off the final PDF.

DOCX font sanity check:

```bash
python3 - <<'PY'
import zipfile
from pathlib import Path
p = Path('dist/user-guides/opl-mas-first-run/OPL-MAS-新手首次启动图文教程.docx')
forbidden = ['MS Mincho', 'ＭＳ 明朝', 'ＭＳ ゴシック', '宋体', 'SimSun', 'Noto Sans CJK SC']
with zipfile.ZipFile(p) as z:
    bad = []
    for name in z.namelist():
        if name.endswith('.xml') and name.startswith('word/'):
            data = z.read(name).decode('utf-8', errors='ignore')
            for token in forbidden:
                if token in data:
                    bad.append((name, token, data.count(token)))
    print(bad)
PY
```

The expected result is `[]`.
