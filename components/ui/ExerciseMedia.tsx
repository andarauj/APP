import { Image, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { isVideoUri } from '@/utils/exerciseMedia';

/** Renders a user-attached photo or video for an exercise. */
export function ExerciseMedia({ uri, height = 220 }: { uri: string; height?: number }) {
  const isVideo = isVideoUri(uri);
  const player = useVideoPlayer(isVideo ? uri : null, p => {
    if (p) { p.loop = true; }
  });

  if (isVideo) {
    return (
      <VideoView
        style={[styles.media, { height }]}
        player={player}
        allowsFullscreen
        nativeControls
        contentFit="contain"
      />
    );
  }
  return <Image source={{ uri }} style={[styles.media, { height }]} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  media: { width: '100%', borderRadius: 12, backgroundColor: '#00000022' },
});
