import { createHash, randomUUID } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const MAX_CONTENT = 128 * 1024;
type InventoryFile = { id: string; category: string; name: string; bytes: number; revision: string; modifiedAt: string; editable?: boolean };
type CleanupRoot = { id: string; path: string; owner: string };

export class WorkbenchResources {
  private mutation: Promise<unknown> = Promise.resolve();
  private async serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(fn, fn);
    this.mutation = result.catch(() => undefined);
    return result;
  }
  private async assertRoot(root: string) {
    const resolved = path.resolve(root);
    let current = path.parse(resolved).root;
    for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try { if ((await lstat(current)).isSymbolicLink()) throw Error('Symbolic resource directories are not allowed.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  private previews = new Map<string, { expires: number; files: InventoryFile[] }>();
  readonly memoryRoot: string;
  readonly cleanupRoots: CleanupRoot[];
  readonly inventoryRoots: CleanupRoot[];
  constructor(memoryRoot: string, cleanupRoots: CleanupRoot[], inventoryRoots: CleanupRoot[] = []) {
    this.memoryRoot = memoryRoot; this.cleanupRoots = cleanupRoots; this.inventoryRoots = inventoryRoots;
  }

  private async files(root: string, category: string, notesOnly = false): Promise<InventoryFile[]> {
    await this.assertRoot(root);
    if (!existsSync(root)) return [];
    if ((await lstat(root)).isSymbolicLink()) throw new Error('Resource root must not be a symbolic link.');
    const result: InventoryFile[] = [];
    const walk = async (directory: string, depth: number) => {
      if (depth > 6) return;
      await this.assertRoot(directory);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (result.length >= 2000) throw new Error('Inventory exceeds the supported limit; narrow the owner inventory.');
        if (entry.isSymbolicLink()) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) { await walk(file, depth + 1); continue; }
        if (!entry.isFile()) continue;
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (category === 'memory' && (!relative.endsWith('.md') || (notesOnly && !relative.startsWith('extensions/ad_hoc/notes/')))) continue;
        const stat = await lstat(file);
        const revision = hash(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`);
        result.push({ id: `${category}:${Buffer.from(relative).toString('base64url')}`, category, name: relative, bytes: stat.size, revision, modifiedAt: stat.mtime.toISOString(), ...(category === 'memory' ? { editable: relative.startsWith('extensions/ad_hoc/notes/') } : {}) });
      }
    };
    await walk(root, 0);
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async resolve(id: string, category: string, root: string) {
    if (!id.startsWith(`${category}:`)) throw new Error('Resource owner does not match.');
    const relative = Buffer.from(id.slice(category.length + 1), 'base64url').toString('utf8');
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(x => x === '..' || x === '.' || !x)) throw new Error('Invalid resource reference.');
    const file = path.join(root, relative);
    await this.assertRoot(path.dirname(file));
    const canonicalRoot = await realpath(root);
    if (await realpath(file) !== path.join(canonicalRoot, relative)) throw new Error('Symbolic links are not allowed.');
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Resource is not a regular file.');
    return { file, relative, revision: hash(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`) };
  }

  async memoryList() { return { status: 'available', owner: 'Codex memory', scope: 'existing_codex_home', items: await this.files(this.memoryRoot, 'memory'), writePolicy: 'correction_notes_only' }; }

  async memoryRead(id: string) {
    if (!Buffer.from(id.slice('memory:'.length), 'base64url').toString('utf8').endsWith('.md')) throw Error('Only memory Markdown references are readable.');
    const target = await this.resolve(id, 'memory', this.memoryRoot);
    const handle = await open(target.file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if ((await handle.stat()).size > MAX_CONTENT) throw new Error('Memory file is too large for inline editing.');
      return { id, revision: target.revision, content: await handle.readFile('utf8'), editable: target.relative.startsWith('extensions/ad_hoc/notes/') };
    } finally { await handle.close(); }
  }

  async memoryCorrect(input: Record<string, unknown>, dryRun: boolean) {
    if (typeof input.content !== 'string' || !input.content.trim() || Buffer.byteLength(input.content) > MAX_CONTENT) throw new Error('Provide a correction of at most 128 KiB.');
    if (input.source_id) await this.resolve(String(input.source_id), 'memory', this.memoryRoot);
    await this.assertRoot(this.memoryRoot);
    const directory = path.join(this.memoryRoot, 'extensions/ad_hoc/notes');
    if (dryRun) return { status: 'preview', owner: 'Codex memory', summary: 'Create a user correction note for the memory owner. Canonical memory is preserved; processing happens later.' };
    // Reject symlinks in existing parents before creating the note directory.
    let parent = this.memoryRoot;
    for (const part of ['extensions', 'ad_hoc', 'notes']) {
      if (existsSync(parent) && (await lstat(parent)).isSymbolicLink()) throw new Error('Symbolic memory roots are not allowed.');
      parent = path.join(parent, part);
    }
    if (existsSync(directory) && (await lstat(directory)).isSymbolicLink()) throw new Error('Symbolic memory roots are not allowed.');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.md`;
    const content = `# User correction\n\n${input.source_id ? `Source reference: ${String(input.source_id)}\n\n` : ''}${input.content}\n`;
    await writeFile(path.join(directory, name), content, { flag: 'wx', mode: 0o600 });
    return { status: 'executed', summary: 'Correction note submitted. Canonical memory has not been rewritten.', effect: 'correction_note_created', id: `memory:${Buffer.from(`extensions/ad_hoc/notes/${name}`).toString('base64url')}` };
  }

  async memoryNote(input: Record<string, unknown>, remove: boolean, dryRun: boolean) {
    return this.serialized(() => this.updateMemoryNote(input, remove, dryRun));
  }
  private async updateMemoryNote(input: Record<string, unknown>, remove: boolean, dryRun: boolean) {
    const target = await this.resolve(String(input.id), 'memory', this.memoryRoot);
    if (!target.relative.startsWith('extensions/ad_hoc/notes/') || !target.relative.endsWith('.md')) throw new Error('Canonical memory is read-only; submit a correction note.');
    if (input.revision !== target.revision) throw new Error('Memory changed; reload before editing.');
    if (!remove && (typeof input.content !== 'string' || Buffer.byteLength(input.content) > MAX_CONTENT)) throw new Error('Invalid memory note content.');
    if (dryRun) return { status: 'preview', effect: remove ? 'delete_user_note' : 'update_user_note', id: input.id };
    if (remove) { if ((await this.resolve(String(input.id), 'memory', this.memoryRoot)).revision !== target.revision) throw Error('Memory changed; reload.'); await unlink(target.file); }
    else {
      const temporary = `${target.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, String(input.content), { flag: 'wx', mode: 0o600 });
      try {
        if ((await this.resolve(String(input.id), 'memory', this.memoryRoot)).revision !== target.revision) throw new Error('Memory changed; reload before editing.');
        await rename(temporary, target.file);
      } finally { await unlink(temporary).catch(() => undefined); }
    }
    return { status: 'executed', id: input.id };
  }

  private async summarize(root: CleanupRoot) {
    let bytes = 0; let count = 0; let truncated = false;
    const walk = async (directory: string, depth: number) => {
      if (depth > 6 || count >= 6000) { truncated = true; return; }
      await this.assertRoot(directory);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (count >= 6000) { truncated = true; break; }
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), depth + 1);
        else if (entry.isFile()) { const stat = await lstat(path.join(directory, entry.name)); if (!stat.isSymbolicLink()) { bytes += stat.size; count++; } }
      }
    };
    try {
      if (!existsSync(root.path)) return { id: root.id, owner: root.owner, status: 'not_configured', bytes: null, cleanupAllowed: false };
      await walk(root.path, 0);
      return { id: root.id, owner: root.owner, status: truncated ? 'partial' : 'available', bytes, fileCount: count, cleanupAllowed: false, truncated };
    } catch { return { id: root.id, owner: root.owner, status: 'read_error', bytes: null, cleanupAllowed: false }; }
  }

  async inventory() {
    const categories = await Promise.all(this.cleanupRoots.map(async root => {
      const files = await this.files(root.path, root.id);
      // Active files are kept. Only owner-declared logs/cache roots are admitted.
      const reclaimable = files.filter(file => Date.parse(file.modifiedAt) < Date.now() - 86400000);
      return { id: root.id, owner: root.owner, bytes: files.reduce((n, f) => n + f.bytes, 0), reclaimableBytes: reclaimable.reduce((n, f) => n + f.bytes, 0), files: reclaimable };
    }));
    return { status: 'available', categories, protectedCategories: await Promise.all(this.inventoryRoots.map(root => this.summarize(root))), exclusions: ['workspace', 'artifacts', 'credentials', 'sessions', 'memory', 'active_files', 'symbolic_links'] };
  }

  async cleanupPreview(ids: string[]) {
    if (!Array.isArray(ids) || ids.length > 2000 || !ids.length) throw new Error('Select files from the owner inventory.');
    const inventory = await this.inventory();
    const eligible = new Map(inventory.categories.flatMap(c => c.files).map(f => [f.id, f]));
    const files = [...new Set(ids)].map(id => { const file = eligible.get(id); if (!file) throw new Error('Selected file is no longer reclaimable.'); return file; });
    for (const [key, value] of this.previews) if (value.expires < Date.now()) this.previews.delete(key);
    if (this.previews.size > 100) throw new Error('Too many pending previews.');
    const token = randomUUID();
    this.previews.set(token, { files, expires: Date.now() + 300000 });
    return { status: 'preview', token, files, owner: 'Codex / App log owners', affected_categories: [...new Set(files.map(f => f.category))], summary: `${files.length} files, ${files.reduce((n, f) => n + f.bytes, 0)} bytes; only inactive owner-declared logs.`, next_visible_step: 'Confirm within 5 minutes. Changed files require a new preview.', bytes: files.reduce((n, f) => n + f.bytes, 0), expiresInSeconds: 300 };
  }

  async cleanupExecute(token: string, confirmed: boolean) {
    return this.serialized(() => this.executeCleanup(token, confirmed));
  }
  private async executeCleanup(token: string, confirmed: boolean) {
    const preview = this.previews.get(token);
    if (!confirmed || !preview || preview.expires < Date.now()) throw new Error('A current preview and explicit confirmation are required.');
    this.previews.delete(token);
    const targets = await Promise.all(preview.files.map(async file => {
      const root = this.cleanupRoots.find(r => r.id === file.category);
      if (!root) throw new Error('Unknown data owner.');
      const target = await this.resolve(file.id, root.id, root.path);
      if (target.revision !== file.revision) throw new Error('Inventory changed; preview again before cleaning.');
      return { file, root, target };
    }));
    const removed: string[] = [];
    for (const { file, root, target } of targets) {
      try {
        if ((await this.resolve(file.id, root.id, root.path)).revision !== file.revision) throw new Error('Inventory changed.');
        await unlink(target.file); removed.push(file.id);
      } catch { return { status: 'partial', removed, summary: `${removed.length} files removed before an error. Inspect the remaining inventory and preview again.`, reason: 'Inventory changed or a file could not be removed; inspect and preview again.' }; }
    }
    return { status: 'executed', removed, summary: `${removed.length} inactive log files removed. Protected data was retained.`, owner: 'declared_log_cache_owners' };
  }
}
