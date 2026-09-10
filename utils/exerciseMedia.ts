import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { documentDirectory, copyAsync, makeDirectoryAsync, getInfoAsync, deleteAsync } from 'expo-file-system/legacy';

const MEDIA_DIR = `${documentDirectory}exercise-media/`;

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(MEDIA_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  }
}

/**
 * Lets the user attach their own photo or short video to an exercise — their
 * gym's specific machine, or their own form to compare over time. The file is
 * copied into the app's own directory, because the picker's cache URI is
 * temporary and would break once Android cleans it up.
 */
export async function pickExerciseMedia(exerciseId: number): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permissao necessaria', 'Permite o acesso a galeria para adicionar imagens aos exercicios.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
    videoMaxDuration: 30,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  return persistAsset(result.assets[0].uri, exerciseId);
}

export async function captureExerciseMedia(exerciseId: number): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permissao necessaria', 'Permite o acesso a camara para filmar ou fotografar o exercicio.');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
    videoMaxDuration: 30,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  return persistAsset(result.assets[0].uri, exerciseId);
}

async function persistAsset(sourceUri: string, exerciseId: number): Promise<string | null> {
  try {
    await ensureDir();
    const ext = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
    const dest = `${MEDIA_DIR}ex_${exerciseId}_${Date.now()}.${ext}`;
    await copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch (e) {
    console.error('Failed to save exercise media:', e);
    Alert.alert('Erro', 'Nao foi possivel guardar o ficheiro.');
    return null;
  }
}

export async function removeExerciseMedia(uri: string): Promise<void> {
  try {
    if (uri.startsWith(MEDIA_DIR)) {
      await deleteAsync(uri, { idempotent: true });
    }
  } catch {
    // Non-fatal: the DB reference is cleared regardless.
  }
}

export function isVideoUri(uri: string): boolean {
  return /\.(mp4|mov|m4v|3gp|avi|mkv)$/i.test(uri);
}
