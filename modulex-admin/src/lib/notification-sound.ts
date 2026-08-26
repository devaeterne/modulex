"use client";

let audioContext: AudioContext | null = null;
let pendingChime = false;
let listenersArmed = false;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
}

function synthesizeChime(context: AudioContext) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.085, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
  gain.connect(context.destination);

  const first = context.createOscillator();
  const second = context.createOscillator();
  first.type = "sine";
  second.type = "sine";
  first.frequency.setValueAtTime(640, now);
  second.frequency.setValueAtTime(820, now + 0.12);
  first.connect(gain);
  second.connect(gain);
  first.start(now);
  first.stop(now + 0.22);
  second.start(now + 0.12);
  second.stop(now + 0.42);
}

function disarmUnlockListeners() {
  if (typeof window === "undefined" || !listenersArmed) return;
  window.removeEventListener("pointerdown", unlockFromGesture);
  window.removeEventListener("keydown", unlockFromGesture);
  window.removeEventListener("touchstart", unlockFromGesture);
  listenersArmed = false;
}

async function unlockFromGesture() {
  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state !== "running") await context.resume();
  } catch {
    return;
  }

  if (context.state !== "running") return;
  disarmUnlockListeners();

  if (pendingChime) {
    pendingChime = false;
    synthesizeChime(context);
  }
}

export function armNotificationAudio() {
  if (typeof window === "undefined" || listenersArmed) return;
  listenersArmed = true;
  window.addEventListener("pointerdown", unlockFromGesture);
  window.addEventListener("keydown", unlockFromGesture);
  window.addEventListener("touchstart", unlockFromGesture, { passive: true });
}

export function queueNotificationChime() {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "running") {
    pendingChime = false;
    synthesizeChime(context);
    return;
  }

  pendingChime = true;
  armNotificationAudio();

  void context.resume().then(() => {
    if (context.state === "running" && pendingChime) {
      pendingChime = false;
      disarmUnlockListeners();
      synthesizeChime(context);
    }
  }).catch(() => undefined);
}

export async function previewNotificationChime() {
  const context = getAudioContext();
  if (!context) throw new Error("Audio is not available in this browser.");

  if (context.state !== "running") await context.resume();
  if (context.state !== "running") {
    throw new Error("Browser audio is blocked. Click anywhere on the page and try again.");
  }

  pendingChime = false;
  disarmUnlockListeners();
  synthesizeChime(context);
}
