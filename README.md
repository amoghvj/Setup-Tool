# Setup Tool

A desktop-based setup tool for the OptiRoute Pro project. It helps users install the Node.js + Express server component onto their local machine.

## Quick Start (Development)

```bash
python src/main.py
```

## Build to EXE

```bash
pip install -r requirements.txt
pyinstaller --onefile --windowed --add-data "resources/server;resources/server" --name "SetupTool" src/main.py
```

The compiled exe is output to `dist/SetupTool.exe`.

## Testing as Installed Application

1. Copy `dist/SetupTool.exe` → `installed/SetupTool/SetupTool.exe`
2. Copy `resources/server/` → `installed/SetupTool/resources/server/`
3. Run `installed/SetupTool/SetupTool.exe`

## Project Structure

| Directory | Purpose |
|---|---|
| `src/` | Python source code |
| `resources/server/` | Pre-packaged Node.js + Express server (bundled into exe) |
| `installed/SetupTool/` | Simulated install directory (mirrors Program Files layout) |
| `build/`, `dist/` | PyInstaller output (auto-generated) |
