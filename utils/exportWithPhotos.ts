import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { documentDirectory, writeAsStringAsync, readAsStringAsync, EncodingType, deleteAsync } from 'expo-file-system/legacy';
import { getBodyMetricsWithPhotos } from '@/db/bodyMetricsDao';
import { exportTrainingReport } from './xmlExport';
import { formatDate } from './format';

/**
 * Bundles the training report together with every progress photo into a
 * single .zip — the report alone can't carry binary images, and sharing
 * dozens of individual photos through the OS share sheet is unwieldy. jszip
 * is pure JavaScript (no native module), so it works in this Expo managed
 * app without a custom dev client; the zip is built and written to disk as
 * base64, then handed to the normal share sheet like everything else here.
 */
export async function exportTrainingReportWithPhotos(): Promise<{ path: string; photoCount: number }> {
  const [report, photoEntries] = await Promise.all([
    exportTrainingReport(),
    getBodyMetricsWithPhotos(),
  ]);

  const zip = new JSZip();
  zip.file('relatorio.md', report);

  const photosFolder = zip.folder('fotos-progresso');
  let photoCount = 0;
  for (const entry of photoEntries) {
    if (!entry.photo_uri) continue;
    try {
      const base64 = await readAsStringAsync(entry.photo_uri, { encoding: EncodingType.Base64 });
      const ext = entry.photo_uri.split('.').pop()?.split('?')[0] || 'jpg';
      const dateLabel = formatDate(entry.date).replace(/\//g, '-');
      photosFolder?.file(`${dateLabel}_${entry.id}.${ext}`, base64, { base64: true });
      photoCount++;
    } catch (err) {
      // A single unreadable photo (e.g. removed from disk outside the app)
      // shouldn't fail the whole export — skip it and keep going.
      console.error('Failed to include photo in export:', entry.id, err);
    }
  }

  const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const filename = `Changes_Relatorio_${new Date().toISOString().split('T')[0]}.zip`;
  const filePath = `${documentDirectory}${filename}`;
  await writeAsStringAsync(filePath, zipBase64, { encoding: EncodingType.Base64 });

  return { path: filePath, photoCount };
}

export async function shareZipFile(filePath: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filePath, { mimeType: 'application/zip', dialogTitle: 'Partilhar relatório e fotos' });
  }
  // Clean up the generated zip after sharing so it doesn't accumulate in
  // app storage across repeated exports.
  await deleteAsync(filePath, { idempotent: true }).catch(() => {});
}
