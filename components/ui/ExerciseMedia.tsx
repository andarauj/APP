import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { isVideoUri } from '@/utils/exerciseMedia';

/**
 * The vendored free-exercise-db JSON only kept frame 0 of each demo, but the
 * source repo has a matching `.../<name>/1.jpg` — the end position of the
 * movement. When we recognise that URL shape we load both frames and
 * cross-fade between them (~1.2s cycle) so a static photo reads as a
 * two-frame animation. If `1.jpg` 404s we quietly fall back to the still.
 */
const FRAME0_RE = /\/0\.(jpe?g|png|webp)(\?.*)?$/i;

function TwoFrameAnimation({ frame0, height }: { frame0: string; height: number }) {
  const frame1 = useMemo(() => frame0.replace(FRAME0_RE, '/1.$1$2'), [frame0]);
  const [hasSecond, setHasSecond] = useState(true);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasSecond) return;
    let shown = false;
    const tick = () => {
      shown = !shown;
      Animated.timing(opacity, {
        toValue: shown ? 1 : 0,
        duration: 380,
        useNativeDriver: true,
      }).start();
    };
    const timer = setInterval(tick, 1100);
    return () => clearInterval(timer);
  }, [hasSecond, opacity]);

  return (
    <View style={[styles.media, { height, overflow: 'hidden' }]}>
      <Image source={{ uri: frame0 }} style={[styles.layer, { height }]} resizeMode="contain" />
      {hasSecond && (
        <Animated.Image
          source={{ uri: frame1 }}
          style={[styles.layer, { height, opacity }]}
          resizeMode="contain"
          onError={() => setHasSecond(false)}
        />
      )}
    </View>
  );
}

/** Renders a user-attached photo or video for an exercise, or an animated
 *  two-frame demo for free-exercise-db stills. */
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

  if (FRAME0_RE.test(uri)) {
    return <TwoFrameAnimation frame0={uri} height={height} />;
  }

  return <Image source={{ uri }} style={[styles.media, { height }]} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  media: { width: '100%', borderRadius: 12, backgroundColor: '#00000022' },
  layer: { position: 'absolute', top: 0, left: 0, width: '100%' },
});
