import { useEffect, useRef, useState } from "react";

const DANGER_REPEAT_MS = 2000;

const TONES = {
  danger: { frequency: 880, durationS: 0.35 },
  warning: { frequency: 660, durationS: 0.25 },

  // Higher and shorter, so it doesn't sound like a warning
  clear: { frequency: 1046, durationS: 0.15 },
};

/**
 * Beeps for an alert: repeatedly for danger, once for a warning or when the
 * road is clear again.
 * Browsers block audio until the user has interacted with the page,
 * so the first click or tap anywhere unlocks it. Returns whether
 * sound is unlocked, so the screen can ask for that first tap.
 */
export function useAlertSound(level, enabled) {
  const audioRef = useRef(null);

  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    function unlockAudio() {
      audioRef.current ??= new AudioContext();
      audioRef.current.resume();
      setUnlocked(true);
    }

    document.addEventListener("pointerdown", unlockAudio);

    return () => {
      document.removeEventListener("pointerdown", unlockAudio);
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const tone = TONES[level];

    if (!enabled || !unlocked || !tone) {
      return;
    }

    function beep() {
      const audio = audioRef.current;

      if (audio?.state !== "running") {
        return;
      }

      const oscillator = audio.createOscillator();
      oscillator.frequency.value = tone.frequency;
      oscillator.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + tone.durationS);
    }

    beep();

    if (level !== "danger") {
      return;
    }

    const interval = setInterval(beep, DANGER_REPEAT_MS);

    return () => clearInterval(interval);
  }, [level, enabled, unlocked]);

  return unlocked;
}
