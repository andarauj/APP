import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { documentDirectory, copyAsync, makeDirectoryAsync, getInfoAsync, deleteAsync } from 'expo-file-system/legacy';

// Kept in its own directory (separate from exercise-media) since these are
// personal progress photos, not exercise reference material — makes it
// straightforward to include/exclude them distinctly when exporting/backing
// up, and keeps them out of anything that lists exercise attachments.
const BODY_PHOTOS_DIR = `${documentDirectory}body-photos/`;

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(BODY_PHOTOS_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(BODY_PHOTOS_DIR, { intermediates: true });
  }
}

export async function pickBodyPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permissão necessária', 'Permite o acesso à galeria para adicionares uma foto de progresso.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistAsset(result.assets[0].uri);
}

export async function captureBodyPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permissão necessária', 'Permite o acesso à câmara para tirares uma foto de progresso.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistAsset(result.assets[0].uri);
}

async function persistAsset(sourceUri: string): Promise<string | null> {
  try {
    await ensureDir();
    const ext = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
    const dest = `${BODY_PHOTOS_DIR}body_${Date.now()}.${ext}`;
    await copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch (e) {
    console.error('Failed to save body photo:', e);
    Alert.alert('Erro', 'Não foi possível guardar a foto.');
    return null;
  }
}

export async function removeBodyPhoto(uri: string): Promise<void> {
  try {
    if (uri.startsWith(BODY_PHOTOS_DIR)) {
      await deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Non-fatal: the DB reference is cleared regardless.
  }
}

export { BODY_PHOTOS_DIR };
