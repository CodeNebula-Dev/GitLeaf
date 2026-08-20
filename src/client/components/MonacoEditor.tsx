import React, { useRef, useEffect, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { CompilerDiagnostic } from '../../shared/types.js';
import { UserProfile } from '../hooks/useUser.js';
import { Users, Wifi, WifiOff } from 'lucide-react';

interface MonacoEditorProps {
  projectId?: string;
  remoteHost?: string;
  filePath: string;
  content: string;
  onChange: (value: string) => void;
  user: UserProfile | null;
  onCompile: () => void;
  onCursorChange: (pos: { line: number; column: number }) => void;
  targetJumpLine: number | null;
  onJumpComplete: () => void;
  diagnostics?: CompilerDiagnostic[];
}

interface PeerUser {
  id: number;
  name: string;
  color: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  projectId,
  remoteHost,
  filePath,
  content,
  onChange,
  user,
  onCompile,
  onCursorChange,
  targetJumpLine,
  onJumpComplete,
  diagnostics = [],
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [activePeers, setActivePeers] = useState<PeerUser[]>([]);

  const bindingRef = useRef<MonacoBinding | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const globalProviderRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register LaTeX language if not already defined
    if (!monaco.languages.getLanguages().some((l: any) => l.id === 'latex')) {
      monaco.languages.register({ id: 'latex' });
    }

    // Set Custom Rich Monarch Tokenizer for LaTeX syntax highlighting
    monaco.languages.setMonarchTokensProvider('latex', {
      defaultToken: '',
      tokenPostfix: '.latex',

      keywords: [
        '\\documentclass',
        '\\usepackage',
        '\\begin',
        '\\end',
        '\\section',
        '\\subsection',
        '\\subsubsection',
        '\\paragraph',
        '\\title',
        '\\author',
        '\\date',
        '\\maketitle',
        '\\abstract',
        '\\IEEEoverridecommandlockouts',
        '\\IEEEauthorblockN',
        '\\IEEEauthorblockA',
        '\\IEEEkeywords',
        '\\cite',
        '\\ref',
        '\\label',
        '\\caption',
        '\\includegraphics',
        '\\textbf',
        '\\textit',
        '\\emph',
        '\\underline',
        '\\centering',
        '\\item',
        '\\bibliography',
        '\\bibliographystyle',
        '\\bibitem',
        '\\newcommand',
        '\\renewcommand',
        '\\input',
        '\\include',
      ],

      tokenizer: {
        root: [
          // Comments
          [/%.*$/, 'comment'],

          // Inline Math ($...$)
          [/\$([^$]+)\$/, 'string.math'],

          // Display Math ($$...$$ or \[...\])
          [/\$\$[^$]+\$\$/, 'string.math.display'],
          [/\\\[([\s\S]*?)\\\]/, 'string.math.display'],

          // Citation Keys e.g. \cite{shapiro2011}
          [/(\\cite(?:author|title|year)?)\s*\{([^}]+)\}/, ['keyword', 'type.identifier']],

          // Label and Ref Keys e.g. \label{sec:intro} \ref{sec:intro}
          [/(\\(?:ref|label|pageref|eqref))\s*\{([^}]+)\}/, ['keyword', 'tag']],

          // Environments e.g. \begin{equation} ... \end{equation}
          [/(\\begin|\\end)\s*\{([^}]+)\}/, ['keyword', 'type.class']],

          // LaTeX Commands & Macros \command
          [/\\[a-zA-Z@]+/, {
            cases: {
              '@keywords': 'keyword',
              '@default': 'type',
            },
          }],

          // Special TeX Symbols
          [/\\\S/, 'keyword'],

          // Brackets and Delimiters
          [/[{}()\[\]]/, 'delimiter'],

          // Numbers
          [/\b\d+\b/, 'number'],
        ],
      },
    });

    // Define Custom GitLeaf Dark High-Contrast Theme
    monaco.editor.defineTheme('gitleaf-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
        { token: 'keyword', foreground: '34D399', fontStyle: 'bold' }, // Vibrant Leaf Green
        { token: 'type', foreground: '38BDF8' }, // Sky Blue commands
        { token: 'type.class', foreground: 'A78BFA', fontStyle: 'bold' }, // Violet environments
        { token: 'type.identifier', foreground: 'F472B6' }, // Pink citations
        { token: 'tag', foreground: 'FBBF24' }, // Amber labels & refs
        { token: 'string.math', foreground: 'FB923C' }, // Git Orange math mode
        { token: 'string.math.display', foreground: 'F97316', fontStyle: 'bold' },
        { token: 'delimiter', foreground: 'CBD5E1' },
        { token: 'number', foreground: 'FCD34D' },
      ],
      colors: {
        'editor.background': '#0A0D12',
        'editor.foreground': '#E2E8F0',
        'editor.lineHighlightBackground': '#161C28',
        'editorLineNumber.foreground': '#334155',
        'editorLineNumber.activeForeground': '#34D399',
        'editorCursor.foreground': '#34D399',
        'editor.selectionBackground': '#10B98133',
        'editorGutter.background': '#0A0D12',
      },
    });

    monaco.editor.setTheme('gitleaf-dark');

    // Register LaTeX Autocompletions and Snippets
    monaco.languages.registerCompletionItemProvider('latex', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          {
            label: '\\begin{equation}',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: ['\\begin{equation}', '\t${1:E = mc^2}', '\\end{equation}'].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Numbered mathematical equation environment',
            range,
          },
          {
            label: '\\begin{figure}',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: [
              '\\begin{figure}[htbp]',
              '\t\\centering',
              '\t\\includegraphics[width=0.8\\linewidth]{${1:image.png}}',
              '\t\\caption{${2:Figure Caption}}',
              '\t\\label{fig:${3:label}}',
              '\\end{figure}',
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Centered figure with caption and label',
            range,
          },
          {
            label: '\\section',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '\\section{${1:Section Title}}\n\\label{sec:${2:label}}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Numbered section header',
            range,
          },
          {
            label: '\\subsection',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '\\subsection{${1:Subsection Title}}\n\\label{subsec:${2:label}}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Numbered subsection header',
            range,
          },
          {
            label: '\\cite',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '\\cite{${1:key}}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Citation reference',
            range,
          },
          {
            label: '\\ref',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '\\ref{${1:fig:label}}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Cross-reference',
            range,
          },
        ];

        return { suggestions };
      },
    });

    // Keyboard shortcut: Cmd/Ctrl + Enter to Compile
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onCompile();
    });

    // Track Cursor Position
    editor.onDidChangeCursorPosition((e: any) => {
      onCursorChange({ line: e.position.lineNumber, column: e.position.column });
    });
  };

  // Real-Time Yjs WebSocket Collaboration Setup
  useEffect(() => {
    if (!editorRef.current || !projectId || !filePath) return;

    // Clean up previous instance
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let targetHost = window.location.host;
    if (remoteHost) {
      const cleanHost = remoteHost.split(':')[0];
      targetHost = `${cleanHost}:4411`;
    }
    const wsUrl = `${protocol}//${targetHost}/ws`;
    const roomName = `${projectId}:${filePath}`;

    // 1. Local/LAN WebSocket Provider (persists edits to local filesystem)
    const provider = new WebsocketProvider(wsUrl, roomName, ydoc, { connect: true });
    providerRef.current = provider;

    // 2. Global Cloud Signaling Mesh (enables cross-laptop live sync across any network/firewall)
    let globalProvider: WebsocketProvider | null = null;
    try {
      const globalRoom = `gitleaf-${projectId}:${filePath}`;
      globalProvider = new WebsocketProvider('wss://demos.yjs.dev/ws', globalRoom, ydoc, { connect: true });
      globalProviderRef.current = globalProvider;

      globalProvider.awareness.setLocalStateField('user', {
        name: user?.name || 'Co-Author',
        color: user?.color || '#10B981',
      });
    } catch {}

    provider.on('status', (event: { status: 'connected' | 'connecting' | 'disconnected' }) => {
      setSyncStatus(event.status);
    });

    if (globalProvider) {
      globalProvider.on('status', (event: { status: 'connected' | 'connecting' | 'disconnected' }) => {
        if (event.status === 'connected') {
          setSyncStatus('connected');
        }
      });
    }

    // Configure user awareness for live collaborator cursors
    provider.awareness.setLocalStateField('user', {
      name: user?.name || 'Co-Author',
      color: user?.color || '#10B981',
    });

    const updatePeers = () => {
      const states = provider.awareness.getStates();
      const globalStates = globalProvider ? globalProvider.awareness.getStates() : new Map();
      const peers: PeerUser[] = [];
      const seen = new Set<number>();

      states.forEach((state: any, clientID: number) => {
        if (state.user && clientID !== ydoc.clientID && !seen.has(clientID)) {
          seen.add(clientID);
          peers.push({
            id: clientID,
            name: state.user.name || 'Co-Author',
            color: state.user.color || '#3B82F6',
          });
        }
      });

      globalStates.forEach((state: any, clientID: number) => {
        if (state.user && clientID !== ydoc.clientID && !seen.has(clientID)) {
          seen.add(clientID);
          peers.push({
            id: clientID,
            name: state.user.name || 'Co-Author',
            color: state.user.color || '#3B82F6',
          });
        }
      });

      setActivePeers(peers);
    };

    provider.awareness.on('change', updatePeers);
    if (globalProvider) {
      globalProvider.awareness.on('change', updatePeers);
    }

    const yText = ydoc.getText('monaco');
    const initialText = content || '';

    // Seed content if yText is empty
    if (initialText && yText.length === 0) {
      yText.insert(0, initialText);
    }

    const model = editorRef.current.getModel();

    if (model) {
      const binding = new MonacoBinding(
        yText,
        model,
        new Set([editorRef.current]),
        globalProvider ? globalProvider.awareness : provider.awareness
      );
      bindingRef.current = binding;

      // Sync changes back to React state and parent
      yText.observe(() => {
        const text = yText.toString();
        if (text) {
          onChange(text);
        }
      });
    }

    provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        const text = yText.toString();
        if (text) {
          onChange(text);
        } else if (initialText) {
          yText.insert(0, initialText);
        }
      }
    });

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (globalProviderRef.current) {
        globalProviderRef.current.destroy();
        globalProviderRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }
    };
  }, [projectId, filePath, user?.name, user?.color]);

  // Jump to Line when targetJumpLine is set
  useEffect(() => {
    if (editorRef.current && targetJumpLine) {
      editorRef.current.revealLineInCenter(targetJumpLine);
      editorRef.current.setPosition({ lineNumber: targetJumpLine, column: 1 });
      editorRef.current.focus();
      onJumpComplete();
    }
  }, [targetJumpLine, onJumpComplete]);

  // Set Error Markers in Monaco Gutter
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const markers = diagnostics
          .filter((d) => d.file === filePath || !d.file)
          .map((d) => ({
            startLineNumber: d.line || 1,
            startColumn: 1,
            endLineNumber: d.line || 1,
            endColumn: 100,
            message: d.message,
            severity:
              d.type === 'error'
                ? monacoRef.current.MarkerSeverity.Error
                : monacoRef.current.MarkerSeverity.Warning,
          }));
        monacoRef.current.editor.setModelMarkers(model, 'latex', markers);
      }
    }
  }, [diagnostics, filePath]);

  const getLanguage = (path: string) => {
    if (path.endsWith('.bib')) return 'bibtex';
    if (path.endsWith('.md')) return 'markdown';
    return 'latex';
  };

  return (
    <div className="h-full w-full flex flex-col bg-dark-bg">
      {/* Editor Header Bar with Live Mesh Sync & Peer Badges */}
      <div className="h-9 bg-dark-surface border-b border-dark-border px-4 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono font-medium text-leaf-400">{filePath}</span>
          <span className="text-dark-border">•</span>
          {syncStatus === 'connected' ? (
            <div className="flex items-center space-x-1 text-[11px] font-mono text-leaf-400">
              <Wifi className="w-3 h-3 text-leaf-400" />
              <span>Live Synced</span>
            </div>
          ) : syncStatus === 'connecting' ? (
            <div className="flex items-center space-x-1 text-[11px] font-mono text-amber-400">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Connecting Mesh...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 text-[11px] font-mono text-dark-muted">
              <WifiOff className="w-3 h-3 text-dark-muted" />
              <span>Offline Mode</span>
            </div>
          )}
        </div>

        {/* Co-Authors Active in this File */}
        <div className="flex items-center space-x-3">
          {activePeers.length > 0 && (
            <div className="flex items-center space-x-1.5 bg-dark-bg/60 border border-dark-border/80 px-2 py-0.5 rounded-full text-[11px] font-mono">
              <Users className="w-3 h-3 text-leaf-400" />
              <div className="flex items-center -space-x-1">
                {activePeers.map((p) => (
                  <div
                    key={p.id}
                    style={{ backgroundColor: p.color }}
                    className="w-4 h-4 rounded-full border border-dark-surface flex items-center justify-center text-[9px] font-bold text-white"
                    title={p.name}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-leaf-300 ml-1 font-semibold">{activePeers.length} editing</span>
            </div>
          )}
          <div className="text-[11px] font-mono text-dark-muted hidden sm:block">
            LaTeX Mode • UTF-8
          </div>
        </div>
      </div>

      {/* Editor Main Canvas */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={getLanguage(filePath)}
          value={content}
          onChange={(val) => onChange(val || '')}
          onMount={handleEditorDidMount}
          theme="gitleaf-dark"
          options={{
            fontFamily: "'Fira Code', ui-monospace, Menlo, monospace",
            fontSize: 13.5,
            lineHeight: 22,
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            lineNumbersMinChars: 3,
            renderLineHighlight: 'all',
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
};
