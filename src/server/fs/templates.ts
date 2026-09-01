export const TEMPLATES: Record<string, { mainFile: string; files: Record<string, string> }> = {
  'blank': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass{article}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Your Paper Title}
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
  'article-simple': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass[11pt,a4paper]{article}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Your Paper Title}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract goes here. Briefly describe the background, methodology, and key findings of your paper.
\\end{abstract}

\\section{Introduction}
Start writing your paper here. You can add formulas, sections, figures, and references.

\\begin{equation}
E = mc^2
\\end{equation}

\\section{Methodology}
Describe your approach and experimental setup.

\\section{Conclusion}
Summarize your results and future work.

\\end{document}
`,
    },
  },
  'ieee-conference': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass[conference]{IEEEtran}
\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{hyperref}

\\begin{document}

\\title{Your Paper Title}
\\author{\\IEEEauthorblockN{Your Name}
\\IEEEauthorblockA{Your Institution \\\\
your@email.edu}}

\\maketitle

\\begin{abstract}
Your abstract goes here.
\\end{abstract}

\\section{Introduction}
Start writing your paper here.

\\section{Methodology}
Describe your methodology and system architecture.

\\section{Conclusion}
Summarize your findings.

\\begin{thebibliography}{00}
\\bibitem{b1} Author, "Title," \\textit{Journal}, year.
\\end{thebibliography}

\\end{document}
`,
      'references.bib': `@article{example2024,
  title={Example Reference},
  author={Author, First},
  journal={Journal Name},
  year={2024}
}`,
    },
  },
  'acm-sigconf': {
    mainFile: 'main.tex',
    files: {
      'main.tex': `\\documentclass[sigconf]{acmart}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\begin{document}

\\title{Your Paper Title}
\\author{Your Name}
\\affiliation{Your Institution}
\\email{your@email.edu}

\\begin{abstract}
Your abstract goes here.
\\end{abstract}

\\maketitle

\\section{Introduction}
Start writing your paper here.

\\section{Conclusion}
Summarize your conclusions.

\\end{document}
`,
    },
  },
};
