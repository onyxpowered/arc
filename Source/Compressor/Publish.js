// Arc

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

async function packageSingleFile(entryPath, fileBytes, manifest) {
  const gzipStream = new Blob([fileBytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressedBytes = new Uint8Array(await new Response(gzipStream).arrayBuffer());
  const index = {
    manifest: manifest || {},
    entries: [{ path: entryPath, offset: 0, length: compressedBytes.byteLength }],
  };
  const indexBytes = new TextEncoder().encode(JSON.stringify(index));
  const indexLengthHeader = new Uint8Array(4);
  new DataView(indexLengthHeader.buffer).setUint32(0, indexBytes.byteLength, true);
  const packageBlob = new Blob(['ARC1', indexLengthHeader, indexBytes, compressedBytes]);
  return Buffer.from(await packageBlob.arrayBuffer());
}

export async function publishDist({ sourceHtmlPath, catalog, distRoot }) {
  const sourceHtml = readFileSync(sourceHtmlPath, 'utf8');
  const sourceBytes = new TextEncoder().encode(sourceHtml);
  const stamp = String(Date.now());
  const sourcePackage = await packageSingleFile('Source.html', sourceBytes, { stamp });

  mkdirSync(distRoot + '/Source', { recursive: true });
  writeFileSync(distRoot + '/Source/Source.arc', sourcePackage);

  const catalogBody = catalog || { games: [] };
  const catalogBytes = new TextEncoder().encode(JSON.stringify(catalogBody));
  const catalogPackage = await packageSingleFile('Catalog.json', catalogBytes, {});

  mkdirSync(distRoot + '/Software', { recursive: true });
  writeFileSync(distRoot + '/Software/Software.arc', catalogPackage);

  mkdirSync(distRoot + '/Software/Seasons', { recursive: true });
  mkdirSync(distRoot + '/Styles', { recursive: true });

  return { stamp, gameCount: catalogBody.games.length };
}
