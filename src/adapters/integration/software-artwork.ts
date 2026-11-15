import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const artworkRoot = new URL('../../../contracts/opl-framework/software-artwork/', import.meta.url);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Display-only assets for identities already admitted by their software owner.
 * This directory never supplies catalog membership, versions, or install routes.
 * Inline PNGs also work offline and never request private repository URLs.
 */
export function softwareArtworkDataUrl(softwareId: string): string | null {
  const component = '[A-Za-z0-9][A-Za-z0-9._-]*';
  const native = new RegExp(`^github:(${component})/(${component})$`).exec(softwareId);
  const relative = native ? `github/${native[1]}/${native[2]}.png`
    : new RegExp(`^${component}$`).test(softwareId) ? `packages/${softwareId}.png` : null;
  if (!relative) return null;
  try {
    const file = new URL(relative, artworkRoot);
    const root = fs.realpathSync(fileURLToPath(artworkRoot));
    if (!fs.realpathSync(file).startsWith(`${root}/`) || fs.statSync(file).size > 131072) return null;
    const bytes = fs.readFileSync(file);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)
      || bytes.toString('ascii', 12, 16) !== 'IHDR'
      || bytes.readUInt32BE(16) < 1 || bytes.readUInt32BE(16) > 256
      || bytes.readUInt32BE(20) !== bytes.readUInt32BE(16)) return null;
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch { return null; }
}
