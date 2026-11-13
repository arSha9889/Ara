# AraChat NSIS installer artwork

The AraChat Connection artwork in this directory is an original composition
created for AraChat. It incorporates the `paper-airplane` outline from
[Heroicons](https://github.com/tailwindlabs/heroicons), copyright Tailwind Labs,
Inc., licensed under MIT.

- Source asset: `heroicons-paper-airplane.svg`
- Upstream revision: `2374ac564a6ae8a9bf42c93982a9aa7d6492c527`
- License: `HEROICONS-LICENSE.txt`

`installer-sidebar.bmp`, `installer-header.bmp`, and
`uninstaller-header.bmp` are generated files. Regenerate them on macOS with:

```sh
swift windows/nsis/assets/generate-installer-art.swift .
```

Run the command from `apps/pc/src-tauri`. The generator uses the existing
AraChat application icon at `icons/icon.png`.
