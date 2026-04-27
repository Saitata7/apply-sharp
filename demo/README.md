# ApplySharp demo assets

Files for capturing the README hero GIF and social previews.

## Files

| File         | Purpose                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| `index.html` | Animated 18-second loop showing the value prop. Open in Chrome at 1200x675. |
| `hero.svg`   | Static SVG of the ATS-scoring frame. Used as the README hero image.         |

## Recording the GIF (macOS)

The cleanest way to get a tight, file-size-friendly GIF for GitHub:

### 1. Open the demo at the right size

```bash
open demo/index.html
```

In Chrome, press F12 to open DevTools and toggle device-mode (Cmd+Shift+M). Set the dimensions to **1200x675** so the recording matches the design.

Alternative: resize the Chrome window manually so the stage fills the viewport without scrollbars.

### 2. Record the screen

**Option A (built-in QuickTime):**

- Press **Cmd+Shift+5**
- Choose "Record Selected Portion"
- Drag the selection over the demo stage exactly
- Click Record, let it loop once (18 seconds), then Stop
- Save the .mov file

**Option B (Kap, free, recommended):**

- Install [Kap](https://getkap.co)
- Drag the recording rectangle over the demo
- Set the frame rate to 30 fps
- Record one full 18-second loop
- Export as **GIF**, target file size under **5 MB** for GitHub README

**Option B+ (Gifski for higher quality at smaller size):**

- Install [Gifski](https://gif.ski) from the App Store
- Record with QuickTime first, then drag the .mov into Gifski
- Quality 80, dimensions 1200x675, frame rate 20-25 fps
- Output is typically 2-4 MB and looks great

### 3. Optimize the GIF

If the file is over 8 MB, GitHub will reject inline rendering:

```bash
# install gifsicle
brew install gifsicle

# optimize in place (lossy compression)
gifsicle -O3 --lossy=80 demo.gif -o demo.gif
```

### 4. Add to README

Save the GIF as `demo/applysharp-demo.gif`, then update README.md hero block:

```markdown
<div align="center">
  <img src="demo/applysharp-demo.gif" alt="ApplySharp demo: ATS scoring on a LinkedIn job page" width="900" />
</div>
```

## Recording on Windows / Linux

- Windows: ShareX (free) does GIF capture natively
- Linux: peek (Flatpak) or asciinema for terminal demos

## Cleanup after recording

Once you have the GIF committed, this entire `demo/` directory can stay (the HTML is still useful as a contributor preview) or be deleted to slim the repo. The GIF lives in `demo/applysharp-demo.gif` either way.

## Static SVG hero (no recording needed)

If you want to ship without recording a GIF, the `hero.svg` works as an inline GitHub image:

```markdown
<div align="center">
  <img src="demo/hero.svg" alt="ApplySharp scoring a LinkedIn job posting in the sidebar" width="900" />
</div>
```

GIF gets more clicks but the SVG ships immediately and works on every screen.
