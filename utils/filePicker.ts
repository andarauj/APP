import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

export async function pickXmlFile(): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/xml',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const fileUri = result.assets[0].uri;
      const content = await readAsStringAsync(fileUri);
      return content;
    }
    return null;
  } catch {
    return null;
  }
}

/** Same idea as pickXmlFile, but for a binary .zip (the full backup now
 *  bundles referenced photos alongside the data, so it can't be plain
 *  text) — read as base64 rather than UTF-8.
 *
 *  Accepts .xml too and reports which one was picked, so restoring an
 *  older backup (made before backups were bundled as zips) still works —
 *  the caller routes to the matching restore function based on `kind`. */
export async function pickBackupFile(): Promise<{ kind: 'zip'; content: string } | { kind: 'xml'; content: string } | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'application/xml', 'text/xml'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0];
    const isZip = asset.name?.toLowerCase().endsWith('.zip') || asset.mimeType?.includes('zip');

    if (isZip) {
      const content = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
      return { kind: 'zip', content };
    }
    const content = await readAsStringAsync(asset.uri);
    return { kind: 'xml', content };
  } catch {
    return null;
  }
}
