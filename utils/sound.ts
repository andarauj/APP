import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Same "never crash, fire-and-forget" philosophy as utils/haptics.ts — a
// missing/broken audio device shouldn't interrupt a workout, it should just
// silently not play.

// BUGFIX (reported): playing the beep with no audio mode configured left
// expo-audio on its default session behavior, which requests EXCLUSIVE
// audio focus — this paused whatever music the person had playing
// (Spotify, etc.) and, crucially, never handed focus back afterward, so the
// music stayed paused until manually resumed. 'duckOthers' asks the system
// to briefly lower other apps' volume instead of stopping them, and restore
// it automatically once our beep is done — the standard behavior for a
// short overlay sound (interval timers, notifications) as opposed to
// something that should own playback (a podcast/audio-guide feature would
// want 'doNotMix' instead). Configured once, lazily, rather than before
// every beep — it's a session-wide setting, not a per-play one.
let audioModeConfigured = false;
async function ensureAudioMode() {
  if (audioModeConfigured) return;
  audioModeConfigured = true; // set before the await so concurrent calls don't all race to configure it
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      interruptionModeAndroid: 'duckOthers',
    });
  } catch {
    // If this fails, the beep still plays via the system default — just
    // possibly interrupting other audio. Not worth surfacing mid-workout.
  }
}

/**
 * Rest-timer-end beep — a synthesized tone (no external asset, so no
 * licensing question), short and unobtrusive rather than a jarring alarm.
 * A fresh player is created per call rather than reused: the countdown can
 * finish many times across a workout, and expo-audio players don't rewind
 * automatically after playing to completion.
 */
export async function playRestEndSound() {
  try {
    await ensureAudioMode();
    const player = createAudioPlayer(require('@/assets/sounds/timer-beep.wav'));
    player.play();
    // Release the native player a couple seconds after the (0.35s) beep
    // finishes — holding onto one per countdown completion for an entire
    // workout would otherwise leak native audio resources.
    setTimeout(() => {
      try { player.remove(); } catch {}
    }, 2000);
  } catch {
    // No-op — same reasoning as haptics: a sound failure is never worth
    // surfacing to the person mid-set.
  }
}
