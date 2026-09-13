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
const GIF_RE = /\.gif(\?.*)?$/i;

function TwoFrameAnimation({
  frame0,
  height,
  accessibilityLabel,
}: {
  frame0: string;
  height: number;
  accessibilityLabel?: string;
}) {
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
    <View
      style={[styles.media, { height, overflow: 'hidden' }]}
      accessibilityLabel={accessibilityLabel}
    >
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

export type ExerciseMediaProps = {
  /** Preferred rich media (GIF). */
  gifUrl?: string | null;
  /** Fallback still / two-frame source. */
  imageUrl?: string | null;
  /** List-friendly small image. */
  thumbnailUrl?: string | null;
  /** Legacy single-uri prop (user media or detail). */
  uri?: string | null;
  /** Optional video — only loaded when allowVideo is true (detail screens). */
  videoUrl?: string | null;
  allowVideo?: boolean;
  height?: number;
  /** When true, prefer thumbnail over GIF (list rows). */
  compact?: boolean;
  /** Accessibility label, e.g. "Execução de agachamento". */
  accessibilityLabel?: string;
};

/**
 * Renders exercise media with preference:
 *   GIF → two-frame stills → static image → (optional) video
 * Lists should pass compact + thumbnailUrl and never allowVideo.
 */
export function ExerciseMedia({
  uri,
  gifUrl,
  imageUrl,
  thumbnailUrl,
  videoUrl,
  allowVideo = false,
  height = 220,
  compact = false,
  accessibilityLabel = 'Demonstração do exercício',
}: ExerciseMediaProps) {
  const still = compact
    ? (thumbnailUrl || imageUrl || uri || gifUrl || '')
    : (gifUrl || imageUrl || thumbnailUrl || uri || '');

  const useVideo = allowVideo && !!videoUrl && isVideoUri(videoUrl);
  const player = useVideoPlayer(useVideo ? videoUrl! : null, p => {
    if (p) { p.loop = true; }
  });

  if (useVideo) {
    return (
      <VideoView
        style={[styles.media, { height }]}
        player={player}
        allowsFullscreen
        nativeControls
        contentFit="contain"
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  if (!still) {
    return (
      <View
        style={[styles.media, { height, backgroundColor: '#00000011' }]}
        accessibilityLabel={`${accessibilityLabel} (sem media)`}
      />
    );
  }

  if (!compact && GIF_RE.test(still)) {
    return (
      <Image
        source={{ uri: still }}
        style={[styles.media, { height }]}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  if (!compact && FRAME0_RE.test(still)) {
    return <TwoFrameAnimation frame0={still} height={height} accessibilityLabel={accessibilityLabel} />;
  }

  return (
    <Image
      source={{ uri: still }}
      style={[styles.media, { height }]}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  media: { width: '100%', borderRadius: 12, backgroundColor: '#00000022' },
  layer: { position: 'absolute', top: 0, left: 0, width: '100%' },
});
