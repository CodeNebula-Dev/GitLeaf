```text
╭─────────────────────────────────────────────────────────────────────────────╮
│                                                                             │
│   ██████╗ ██╗████████╗                                                     │
│  ██╔════╝ ██║╚══██╔══╝       ════  ════  ════  ════  ════                   │
│  ██║  ███╗██║   ██║         ██╗     ███████╗ █████╗ ███████╗               │
│  ██║   ██║██║   ██║         ██║     ██╔════╝██╔══██╗██╔════╝               │
│  ╚██████╔╝██║   ██║         ██║     █████╗  ███████║█████╗                 │
│   ═══════════════════       ██║     ██╔══╝  ██╔══██║██╔══╝                 │
│                             ███████╗███████╗██║  ██║██║                     │
│                             ════════════════════════════════               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  GitLeaf v0.1.0 -- Local-First Collaborative LaTeX Platform                 │
│                                                                             │
│  Local Workspace : /Users/you/Projects/my-paper                             │
│  Live Web UI     : http://localhost:5173                                    │
│  CRDT Sync Mesh  : [Ready] (relay ws://127.0.0.1:4411)                      │
│  LaTeX Compiler  : [pdflatex detected] (native fast-compile)                │
│  Team Limit      : Unlimited (0$ subscription)                              │
╰─────────────────────────────────────────────────────────────────────────────╯
```

```text
[version: 0.1.0] [arch: local-first] [sync: crdt-mesh] [license: mit] [pricing: free]
```

> **The Open-Source, Local-First, Collaborative LaTeX Platform**  
> Stored directly on your disk. Real-time multi-author collaboration. Native Git version history. Zero subscriptions.

---

## Overview

GitLeaf is a local-first collaborative LaTeX environment designed to eliminate subscription fees and author paywalls.

Traditional cloud LaTeX platforms impose arbitrary limits (such as a 2-collaborator cap on free plans) and lock documents inside proprietary remote databases. GitLeaf operates directly on your local filesystem: projects are stored as standard folders on your drive, synced across team members in real-time via Conflict-Free Replicated Data Types (CRDTs), and version-controlled with Git.

```text
+-----------------------------------------------------------------------------+
|                                GitLeaf UI                                   |
|  +--------------------------------+  +-----------------------------------+  |
|  | Monaco LaTeX Editor            |  | Split-View Live PDF Preview       |  |
|  | - Syntax highlighting          |  | - PDF.js Canvas Rendering         |  |
|  | - Multi-cursor collaboration   |  | - Bidirectional SyncTeX Jump      |  |
|  | - Real-time error diagnostics  |  | - Auto-recompile on save/idle    |  |
|  +--------------------------------+  +-----------------------------------+  |
+--------------------------------------|--------------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
+--------------------------------------+   +----------------------------------+
|        Local Engine & Filesystem     |   |     Distributed Sync Engine      |
| - Direct file write to local disk    |   | - Yjs CRDT real-time sync        |
| - Local TeX compiler (pdflatex/etc)  |   | - WebSocket & P2P relay mesh     |
| - Fast log parser & diagnostics      |   | - Git snapshot & commit history  |
+--------------------------------------+   +----------------------------------+
```

---

## Comparison Matrix

| Feature | GitLeaf | Cloud Proprietary (e.g. Overleaf) |
| :--- | :--- | :--- |
| Collaborator Limit | Unlimited (Free) | 1-2 on Free Tier |
| Storage | Local Filesystem (100% User Owned) | Remote Cloud Server Only |
| Offline Mode | Full Offline Read/Write/Compile | Read-only or None |
| Version Control | Native Git Branches & Snapshots | Paywalled History |
| LaTeX Compilation | Local Hardware (Fast) / Wasm Fallback | Shared Server Queue |
| Sync Engine | Real-Time CRDT Multi-Cursor | Proprietary WebSocket Sync |
| SyncTeX Navigation | Bidirectional Click-to-Jump | Standard |
| Cost | Free & Open Source (MIT) | Monthly Subscription |

---

## Core Capabilities

- **Local-First File System**: Every project is a directory on your machine. Edit with GitLeaf, VS Code, or terminal editors without friction.
- **Real-Time Collaboration**: Multi-cursor editing powered by CRDTs. All changes are merged deterministically without conflicts.
- **Git-Native History**: Automated snapshot generation, commit logs, and side-by-side diffing for tracking paper revisions.
- **Flexible Compiler Runner**: Supports local TeX distributions (`pdflatex`, `xelatex`, `lualatex`, `tectonic`) with an in-browser WebAssembly fallback.
- **Split-View PDF & SyncTeX**: Live PDF preview with bidirectional jumping between source code line and rendered document location.
- **Invite Workflow**: Share projects with co-authors via invite tokens or email pairing to clone the project to their local machines.
- **Developer-Centric Interface**: Fast, responsive Monaco editor with LaTeX syntax support, autocomplete, and error diagnostics.

---

## CLI Reference & Workflow

```bash
# Display CLI help & manual
$ gitleaf help

# Initialize a new local paper from academic template
$ gitleaf init "My Research Paper" ieee-conference
# (Templates: ieee-conference, acm-sigconf, springer-nature, article-simple, blank)

# Join a shared paper from a co-author and mirror locally to disk
$ gitleaf join <INVITE_TOKEN> "Your Name"

# Pull and synchronize latest co-author edits directly to disk
$ gitleaf pull

# View Git commit timeline and revision checkpoints in terminal
$ gitleaf history

# Compile LaTeX paper directly from CLI (< 600ms)
$ gitleaf compile

# List all local papers and directory paths
$ gitleaf list

# Launch local workspace engine and live Web IDE
$ gitleaf open
```

---

## Architecture & Data Flow

```text
[Author A (Host)]                             [Author B (Co-Author)]
  |                                              |
  |-- 1. Create project locally                  |
  |      (files written to ./paper/)             |
  |                                              |
  |-- 2. Generate invite token ----------------> |
  |                                              |-- 3. Clone & mirror project locally
  |                                              |      (files written to ./paper/)
  |                                              |
  |== 4. Real-time CRDT multi-cursor sync =======|
  |      (deltas streamed & persisted to disk)   |
  |                                              |
  |-- 5. Compile locally via TeX engine          |-- 5. Compile locally via TeX engine
  |      (output: paper.pdf)                     |      (output: paper.pdf)
```

---

## Quick Start

### 1. Prerequisites

- Node.js (v18.0.0 or higher)
- Optional: Local TeX installation (`pdflatex`, `xelatex`, or `tectonic`) for native compilation speed.

### 2. Installation & Setup

```bash
# Clone the repository
git clone https://github.com/CodeNebula-Dev/GitLeaf.git

# Navigate to project root
cd GitLeaf

# Install dependencies
npm install

# Link GitLeaf CLI globally (allows typing `gitleaf` anywhere in terminal)
npm link

# Start development engine & Web IDE
npm run dev
```

The Web IDE will be available at `http://localhost:5173`. You can also run `gitleaf help` anywhere in your terminal.

---

## Project Structure

```text
GitLeaf/
|-- src/
|   |-- client/               # React frontend with Monaco & PDF viewer
|   |   |-- components/       # Editor, PDF viewer, file tree, toolbar
|   |   |-- hooks/            # Sync, compiler, and state hooks
|   |   `-- styles/           # Theme and layout styles
|   |-- server/               # Local backend service
|   |   |-- compiler/         # TeX engine process runner & log parser
|   |   |-- fs/               # Local filesystem watcher & manager
|   |   `-- sync/             # CRDT room provider & relay
|   |-- shared/               # Shared types, protocols, and constants
|   `-- cli/                  # CLI entrypoint commands
|-- package.json
|-- tsconfig.json
`-- README.md
```

---

## Development Roadmap

- [x] Architecture design and specification
- [ ] Core local project engine and file manager
- [ ] Monaco LaTeX editor integration with custom themes
- [ ] Split-view PDF preview with SyncTeX support
- [ ] Local TeX compiler integration (`pdflatex`, `latexmk`, `tectonic`)
- [ ] Real-time CRDT collaboration layer (Yjs + WebRTC/WebSocket relay)
- [ ] One-click invite pairing and local project replication
- [ ] Git versioning, snapshot timeline, and visual diff view
- [ ] Standalone desktop package (Electron / Tauri)

---

## Contributing

```bash
# 1. Fork repository on GitHub
# 2. Create feature branch
git checkout -b feature/compiler-opt

# 3. Commit changes
git commit -m "feat: add incremental compilation support"

# 4. Push to branch
git push origin feature/compiler-opt

# 5. Open Pull Request
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
