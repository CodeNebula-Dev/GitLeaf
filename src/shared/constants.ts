export const DEFAULT_SERVER_PORT = 4411;
export const DEFAULT_CLIENT_PORT = 5173;

export const AUTHOR_COLORS = [
  '#10B981', // emerald
  '#F05032', // git orange
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#14B8A6', // teal
];

export const SUPPORTED_EXTENSIONS = {
  latex: ['.tex', '.cls', '.sty', '.bib', '.bst'],
  images: ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg'],
  text: ['.txt', '.md', '.markdown'],
};

export const LATEX_TEMPLATES = [
  {
    id: 'ieee-conference',
    name: 'IEEE Conference Paper',
    description: 'Standard two-column IEEE conference proceedings format',
    category: 'Conference',
  },
  {
    id: 'acm-sigconf',
    name: 'ACM Conference Proceedings',
    description: 'Modern ACM Master Article Template for computer science research',
    category: 'Conference',
  },
  {
    id: 'springer-nature',
    name: 'Springer Nature Journal',
    description: 'Single and double column format for Springer LNCS and journals',
    category: 'Journal',
  },
  {
    id: 'article-simple',
    name: 'Clean Academic Article',
    description: 'Clean, elegant generic article template for papers & preprints',
    category: 'General',
  },
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Empty minimal starter LaTeX document',
    category: 'Basic',
  },
];
