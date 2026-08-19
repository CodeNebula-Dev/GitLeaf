export const TEMPLATES: Record<string, { mainFile: string; files: Record<string, string> }> = {
  'ieee-conference': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass[conference]{IEEEtran}
\\IEEEoverridecommandlockouts
% The preceding line is only needed to identify funding in the first footnote. If that is unneeded, please comment it out.
\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{algorithmic}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\def\\BibTeX{{\\rm B\\kern-.05em{\\sc i\\kern-.025em b}\\kern-.08em
    T\\kern-.1667em\\lower.7ex\\hbox{E}\\kern-.125emX}}

\\begin{document}

\\title{GitLeaf: Decentralized Collaborative LaTeX for Academic Research*\\\\
{\\footnotesize \\textsuperscript{*}Note: Sub-titles are not typically used in IEEE submissions.}
}

\\author{\\IEEEauthorblockN{1\\textsuperscript{st} Alice Turing}
\\IEEEauthorblockA{\\textit{Dept. of Computer Science} \\\\
\\textit{University of Technology}\\\\
City, Country \\\\
alice@university.edu}
\\and
\\IEEEauthorblockN{2\\textsuperscript{nd} Bob Shannon}
\\IEEEauthorblockA{\\textit{Dept. of Information Theory} \\\\
\\textit{Research Institute}\\\\
City, Country \\\\
bob@research.org}
}

\\maketitle

\\begin{abstract}
Collaborative LaTeX authoring has traditionally required centralized cloud subscriptions that impose strict author caps and proprietary vendor lock-in. In this paper, we introduce GitLeaf, a local-first peer-to-peer collaborative typesetting platform. By synthesizing Conflict-Free Replicated Data Types (CRDTs) with native local filesystem synchronization and Git version history, GitLeaf enables unlimited co-authors to edit, compile, and time-travel revisions locally with zero cloud dependencies.
\\end{abstract}

\\begin{IEEEkeywords}
LaTeX, Collaborative Editing, CRDT, Local-First Software, Distributed Systems
\\end{IEEEkeywords}

\\section{Introduction}
Real-time collaborative document preparation has become a cornerstone of scientific publishing. Modern researchers frequently collaborate across institutions, requiring tools that can simultaneously handle complex mathematical formulas, cross-references, and bibliographies.

However, prevailing online LaTeX solutions suffer from two critical limitations:
\\begin{enumerate}
    \\item Artificial seat caps (e.g., maximum of two collaborators on free tiers).
    \\item Full reliance on remote cloud infrastructure, compromising privacy and offline usability.
\\end{enumerate}

\\section{System Architecture}
GitLeaf employs a hybrid local-first architecture depicted in Fig. 1. Documents reside directly on the local storage of each participant.

\\begin{equation}
\\Delta(S_{t+1}) = \\text{CRDT\\_Merge}(S_t, \\delta_A, \\delta_B)
\\end{equation}

When author $A$ introduces delta $\\delta_A$ and author $B$ introduces delta $\\delta_B$, the state transition converges deterministically without requiring a central coordinator.

\\section{Evaluation \\& Results}
Preliminary benchmarks demonstrate sub-50ms synchronization latency across distributed local networks with instantaneous local \\LaTeX{} compilation.

\\section{Conclusion}
GitLeaf establishes a new paradigm for academic publishing by combining the speed and privacy of local workflows with the collaborative power of modern web technologies.

\\begin{thebibliography}{00}
\\bibitem{b1} M. Shapiro et al., "Conflict-free replicated data types," \\textit{Symp. on Self-Stabilizing Systems}, 2011.
\\bibitem{b2} L. Lamport, "LaTeX: a document preparation system," \\textit{Addison-Wesley}, 1994.
\\end{thebibliography}

\\end{document}
`,
      'references.bib': `@article{shapiro2011crdt,
  title={Conflict-free replicated data types},
  author={Shapiro, Marc and Pregui{\\c{c}}a, Nuno and Baquero, Carlos and Zawirski, Marek},
  journal={Symposium on Self-Stabilizing Systems},
  pages={386--400},
  year={2011},
  publisher={Springer}
}`,
    },
  },
  'acm-sigconf': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass[sigconf]{acmart}

\\AtBeginDocument{%
  \\providecommand\\BibTeX{{%
    Bib\\TeX}}}

\\setcopyright{acmlicensed}
\\copyrightyear{2026}
\\acmYear{2026}

\\begin{document}

\\title{GitLeaf: Local-First Distributed Typesetting for Computer Systems}

\\author{Ada Lovelace}
\\affiliation{%
  \\institution{Distributed Systems Lab}
  \\city{Cambridge}
  \\country{UK}
}
\\email{ada@systems.lab}

\\begin{abstract}
We present GitLeaf, a high-throughput, local-first LaTeX authoring system built upon state-based CRDTs and direct filesystem mirror protocols.
\\end{abstract}

\\maketitle

\\section{Introduction}
Modern scientific writing demands robust real-time synchronization combined with strict data ownership.

\\section{Implementation}
Our system leverages Monaco editor with Yjs document buffers and local LaTeX daemon compilation.

\\end{document}
`,
    },
  },
  'article-simple': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{geometry}
\\geometry{margin=1in}
\\usepackage{hyperref}

\\title{\\textbf{Collaborative Research Paper Template}}
\\author{Author One \\and Author Two \\and Author Three}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This is a clean, modern academic article template powered by GitLeaf. Edit in real-time, invite unlimited co-authors, and compile locally.
\\end{abstract}

\\section{Introduction}
Welcome to GitLeaf! You can write standard LaTeX here, add formulas like $E = mc^2$ or multiline derivations:

\\begin{equation}
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
\\end{equation}

\\section{Methods and Materials}
Add your sections, tables, figures, and references.

\\section{Discussion}
All changes are saved directly to your local machine and synced across all invited team members in real-time.

\\end{document}
`,
    },
  },
  'blank': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass{article}
\\usepackage[utf8]{inputenc}

\\title{My LaTeX Document}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Start typing your paper here...

\\end{document}
`,
    },
  },
};
