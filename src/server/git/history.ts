import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import * as diff from 'diff';
import { GitSnapshot } from '../../shared/types.js';

export interface SnapshotDetail extends GitSnapshot {
  fileContents: Record<string, string>;
}

export class HistoryTracker {
  private historyDir(projectRoot: string): string {
    const dir = path.join(projectRoot, '.gitleaf_history');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public createSnapshot(
    projectRoot: string,
    message: string,
    author: string = 'You',
    files: Record<string, string>
  ): GitSnapshot {
    const dir = this.historyDir(projectRoot);
    const id = nanoid(7);
    const timestamp = Date.now();

    const detail: SnapshotDetail = {
      id,
      message,
      author,
      timestamp,
      files: Object.entries(files).map(([p, c]) => ({ path: p, size: Buffer.byteLength(c, 'utf-8') })),
      fileContents: files,
    };

    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(detail, null, 2), 'utf-8');

    return {
      id,
      message,
      author,
      timestamp,
      files: detail.files,
    };
  }

  public listSnapshots(projectRoot: string): GitSnapshot[] {
    const dir = this.historyDir(projectRoot);
    const files = fs.readdirSync(dir);
    const list: GitSnapshot[] = [];

    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
          const detail = JSON.parse(raw) as SnapshotDetail;
          list.push({
            id: detail.id,
            message: detail.message,
            author: detail.author,
            timestamp: detail.timestamp,
            files: detail.files,
          });
        } catch {}
      }
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getSnapshot(projectRoot: string, id: string): SnapshotDetail | null {
    const filePath = path.join(this.historyDir(projectRoot), `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  public computeDiff(oldContent: string, newContent: string) {
    return diff.createPatch('document.tex', oldContent, newContent, 'Previous', 'Current');
  }
}
