import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { createAudioPlayer, preload, type AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPRITE, SPRITE_SRC } from './voiceSprite';

// Fetch the voice file as soon as the app opens so it is ready by the first tap.
Promise.resolve(preload(SPRITE_SRC)).catch(() => {});

// Soft background music. Its low level is set in the file itself (scripts/build_music.py).
const MUSIC_SRC = require('./assets/voice/music.m4a');
const MUSIC_KEY = 'breathgym.music';

// ---------------------------------------------------------------------------
// Exercises. Everything Brandon may want to change lives in this one list:
// names, taglines, colors, and the breathing pattern (seconds per step).
// Timings are placeholders until Brandon confirms his own patterns.
// ---------------------------------------------------------------------------
type Step = { label: string; seconds: number; move: 'grow' | 'shrink' | 'stay' };
type IconName = 'target' | 'wave' | 'bolt' | 'battery' | 'refresh' | 'moon' | 'sliders';
// Seconds for each part of one breath: in, hold, out, hold. 0 means that part is skipped.
type Counts = { in: number; hold1: number; out: number; hold2: number };
type Exercise = {
  id: string;
  name: string;
  tagline: string; // when to use it
  icon: IconName;
  pattern: string;
  color: string;
  steps: Step[];
  maxSeconds?: number; // longest session offered
  startSeconds?: number; // session length picked by default
  note?: string;
};

function stepsOf(c: Counts): Step[] {
  const steps: Step[] = [{ label: 'Breathe in', seconds: c.in, move: 'grow' }];
  if (c.hold1 > 0) steps.push({ label: 'Hold', seconds: c.hold1, move: 'stay' });
  steps.push({ label: 'Breathe out', seconds: c.out, move: 'shrink' });
  if (c.hold2 > 0) steps.push({ label: 'Hold', seconds: c.hold2, move: 'stay' });
  return steps;
}
function patternOf(c: Counts) {
  const parts = [`In ${c.in}`];
  if (c.hold1 > 0) parts.push(`Hold ${c.hold1}`);
  parts.push(`Out ${c.out}`);
  if (c.hold2 > 0) parts.push(`Hold ${c.hold2}`);
  return parts.join(' · ');
}
type Preset = Omit<Exercise, 'steps' | 'pattern'> & { counts: [number, number, number, number] };
const make = (p: Preset): Exercise => {
  const c: Counts = { in: p.counts[0], hold1: p.counts[1], out: p.counts[2], hold2: p.counts[3] };
  return { ...p, steps: stepsOf(c), pattern: patternOf(c) };
};

// counts = [in, hold, out, hold] in seconds, from Brandon (2026-11-26).
const EXERCISES: Exercise[] = [
  make({ id: 'focused', name: 'Focused', tagline: 'Lock in before a big moment', icon: 'target', color: '#4DA3FF', counts: [4, 4, 4, 4] }),
  make({ id: 'calm', name: 'Calm', tagline: 'Settle your nerves under pressure', icon: 'wave', color: '#3DD6C3', counts: [4, 2, 6, 0] }),
  make({
    id: 'energized',
    name: 'Energized',
    tagline: 'Wake up before you compete',
    icon: 'bolt',
    color: '#FF8A3D',
    counts: [3, 1, 3, 0],
    // Kept short on purpose: no fast breathing and no long holds for young athletes.
    maxSeconds: 60,
    startSeconds: 30,
    note: 'Sit tall. Stop if you feel dizzy.',
  }),
  make({ id: 'recovered', name: 'Recovered', tagline: 'Wind down after a game', icon: 'battery', color: '#9B8CFF', counts: [5, 0, 5, 1] }),
  make({ id: 'reset', name: 'Reset', tagline: 'Let go after a mistake', icon: 'refresh', color: '#F472B6', counts: [3, 2, 6, 0] }),
  // Brandon's table has 4-7-8. The hold is shortened to 4 for young athletes; change the
  // second number to 7 for the full version.
  make({ id: 'rested', name: 'Rested', tagline: 'Slow down before bed', icon: 'moon', color: '#F5C451', counts: [4, 4, 8, 0] }),
];

// "Pick your own": the athlete sets the count for each part of the breath.
const DEFAULT_COUNTS: Counts = { in: 4, hold1: 0, out: 6, hold2: 0 };
const CUSTOM_COLOR = '#E5484D';
function customExercise(c: Counts): Exercise {
  return {
    id: 'custom',
    name: 'Your breath',
    tagline: 'Set your own breath count',
    icon: 'sliders',
    pattern: patternOf(c),
    color: CUSTOM_COLOR,
    steps: stepsOf(c),
  };
}

// Simple line icons, drawn in the tile's own color.
function Icon({ name, color, size = 22 }: { name: IconName; color: string; size?: number }) {
  const line = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'target' && (
        <>
          <Circle cx={12} cy={12} r={10} {...line} />
          <Circle cx={12} cy={12} r={6} {...line} />
          <Circle cx={12} cy={12} r={2} {...line} />
        </>
      )}
      {name === 'wave' && (
        <>
          <Path d="M2 9c2.5-4 5-4 7.5 0s5 4 7.5 0 3.5-3 5-2" {...line} />
          <Path d="M2 16c2.5-4 5-4 7.5 0s5 4 7.5 0 3.5-3 5-2" {...line} />
        </>
      )}
      {name === 'bolt' && <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" {...line} />}
      {name === 'battery' && (
        <>
          <Rect x={1} y={6} width={18} height={12} rx={2} ry={2} {...line} />
          <Line x1={23} y1={11} x2={23} y2={13} {...line} />
          <Line x1={5} y1={10} x2={5} y2={14} {...line} />
          <Line x1={9} y1={10} x2={9} y2={14} {...line} />
          <Line x1={13} y1={10} x2={13} y2={14} {...line} />
        </>
      )}
      {name === 'refresh' && (
        <>
          <Polyline points="23 4 23 10 17 10" {...line} />
          <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" {...line} />
        </>
      )}
      {name === 'moon' && <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...line} />}
      {name === 'sliders' && (
        <>
          <Line x1={4} y1={7} x2={20} y2={7} {...line} />
          <Line x1={4} y1={17} x2={20} y2={17} {...line} />
          <Circle cx={9} cy={7} r={2.5} {...line} fill={BG} />
          <Circle cx={15} cy={17} r={2.5} {...line} fill={BG} />
        </>
      )}
    </Svg>
  );
}

const DURATIONS = [
  { label: '30 sec', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
];

const BG = '#070F24';
const CARD = '#101B3A';
const TEXT = '#FFFFFF';
const MUTED = '#8E9BB8';
const SMALL = 0.6;
const ON = '#34C759'; // switch on: green
const OFF = '#E5484D'; // switch off: red

const STAGE = 300;
const RING_R = 138;
const RING_STROKE = 6;
const RING_LEN = 2 * Math.PI * RING_R;

// ---------------------------------------------------------------------------
// Streak: days in a row with at least one finished session. Saved on this
// device for the beta; the real app will save it to the member's account.
// ---------------------------------------------------------------------------
type Streak = { count: number; lastDay: string };
const STREAK_KEY = 'breathgym.streak';
const COUNTS_KEY = 'breathgym.custom';
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dayKey(new Date());
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
};
// A streak only counts if the last session was today or yesterday.
const liveCount = (s: Streak | null) =>
  s && (s.lastDay === today() || s.lastDay === yesterday()) ? s.count : 0;
async function loadStreak(): Promise<Streak | null> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    return raw ? (JSON.parse(raw) as Streak) : null;
  } catch {
    return null;
  }
}
async function recordSession(): Promise<Streak> {
  const prev = await loadStreak();
  let next: Streak;
  if (prev && prev.lastDay === today()) next = prev;
  else if (prev && prev.lastDay === yesterday()) next = { count: prev.count + 1, lastDay: today() };
  else next = { count: 1, lastDay: today() };
  try {
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(next));
  } catch {
    // Saving can fail in private windows; the session still counts on screen.
  }
  return next;
}
const streakLine = (n: number) =>
  n <= 0 ? 'Start your streak today' : n === 1 ? '1 day in a row. Keep it going.' : `${n} days in a row. Keep it going.`;

function clock(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Home: pick how you want to feel, or set your own breath.
// ---------------------------------------------------------------------------
function Home({
  onPick,
  onCustom,
  streak,
}: {
  onPick: (e: Exercise) => void;
  onCustom: () => void;
  streak: number;
}) {
  return (
    <ScrollView contentContainerStyle={styles.homeScroll}>
      <View style={styles.column}>
        <Text style={styles.brand}>MAJOR LEAGUE MINDSET+</Text>
        <Text style={styles.h1}>Breathwork</Text>
        <Text style={styles.sub}>Train your breath. Own your state.</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakText}>{streakLine(streak)}</Text>
        </View>

        <Text style={styles.question}>How do you want to feel?</Text>
        <View style={styles.grid}>
          {EXERCISES.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              style={styles.card}
              onPress={() => onPick(e)}
            >
              <View style={[styles.iconChip, { backgroundColor: e.color + '26' }]}>
                <Icon name={e.icon} color={e.color} />
              </View>
              <Text style={styles.cardName}>{e.name}</Text>
              <Text style={styles.cardTag}>{e.tagline}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable accessibilityRole="button" style={styles.custom} onPress={onCustom}>
          <View style={[styles.iconChip, { backgroundColor: CUSTOM_COLOR + '26', marginBottom: 0 }]}>
            <Icon name="sliders" color={CUSTOM_COLOR} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>Pick your own</Text>
            <Text style={styles.cardTag}>Set your own breath count</Text>
          </View>
          <Text style={styles.customGo}>›</Text>
        </Pressable>

        <Text style={styles.beta}>Beta · your streak saves on this device</Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Pick your own: set the seconds for each part of the breath.
// ---------------------------------------------------------------------------
const COUNT_ROWS: { key: keyof Counts; label: string; min: number }[] = [
  { key: 'in', label: 'Breathe in', min: 2 },
  { key: 'hold1', label: 'Hold', min: 0 },
  { key: 'out', label: 'Breathe out', min: 2 },
  { key: 'hold2', label: 'Hold', min: 0 },
];
const MAX_COUNT = 10;
const BAR_PARTS: { key: keyof Counts; color: string }[] = [
  { key: 'in', color: '#4DA3FF' },
  { key: 'hold1', color: '#D9A441' },
  { key: 'out', color: '#3DBE9B' },
  { key: 'hold2', color: '#8E9BB8' },
];

function CustomSetup({
  counts,
  onChange,
  onBack,
  onStart,
}: {
  counts: Counts;
  onChange: (c: Counts) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <View style={styles.session}>
      <View style={styles.column}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.back} onPress={onBack}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.topTitle}>Pick your own</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.setupHelp}>Set the seconds for each part of your breath.</Text>

        {COUNT_ROWS.map((row) => {
          const value = counts[row.key];
          const set = (v: number) => onChange({ ...counts, [row.key]: v });
          return (
            <View key={row.key} style={styles.countRow}>
              <Text style={styles.countLabel}>{row.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Less ${row.label}`}
                disabled={value <= row.min}
                style={[styles.stepBtn, value <= row.min && styles.stepBtnOff]}
                onPress={() => set(value - 1)}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.countValue}>{value === 0 ? 'Off' : value}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`More ${row.label}`}
                disabled={value >= MAX_COUNT}
                style={[styles.stepBtn, value >= MAX_COUNT && styles.stepBtnOff]}
                onPress={() => set(value + 1)}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          );
        })}

        <View style={styles.bar}>
          {BAR_PARTS.filter((part) => counts[part.key] > 0).map((part) => (
            <View key={part.key} style={[styles.barPart, { flex: counts[part.key], backgroundColor: part.color }]}>
              <Text style={styles.barText}>{counts[part.key]}s</Text>
            </View>
          ))}
        </View>
        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>Your pattern</Text>
            <Text style={styles.summaryValue}>
              {counts.in}-{counts.hold1}-{counts.out}-{counts.hold2}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>One breath</Text>
            <Text style={styles.summaryValue}>{counts.in + counts.hold1 + counts.out + counts.hold2}s</Text>
          </View>
        </View>

        <Text style={styles.note}>Keep it comfortable. Stop if you feel dizzy.</Text>

        <Pressable
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: CUSTOM_COLOR }]}
          onPress={onStart}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Session: the breathing circle.
// ---------------------------------------------------------------------------
function Session({
  exercise,
  onBack,
  streak,
  onComplete,
}: {
  exercise: Exercise;
  onBack: () => void;
  streak: number;
  onComplete: () => void;
}) {
  const [duration, setDuration] = useState(exercise.startSeconds ?? 60);
  const [status, setStatus] = useState<'ready' | 'running' | 'done'>('ready');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const lastStep = useRef(-1);
  const size = useRef(new Animated.Value(SMALL)).current;

  // Voice. Every line lives in one audio file and one player plays one line at a time,
  // so two voices can never overlap. The Start tap is what lets a phone play it.
  const [voiceOn, setVoiceOn] = useState(true);
  const player = useRef<AudioPlayer | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saidMid = useRef(false);
  // The opening sequence: announcement, get-ready line, three tones, then the intro line.
  const schedule = useRef<{ at: number; clip: string }[]>([]);
  const [tonesAt, setTonesAt] = useState(0);
  useEffect(() => {
    const p = createAudioPlayer(SPRITE_SRC);
    player.current = p;
    return () => {
      clearTimeout(stopTimer.current);
      clearTimeout(checkTimer.current);
      p.remove();
      player.current = null;
    };
  }, []);
  // Background music: off unless the athlete turns it on. It has its own player so it
  // can run under the voice, and it starts from a tap like the voice does.
  const [musicOn, setMusicOn] = useState(false);
  const music = useRef<AudioPlayer | null>(null);
  const musicStop = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    AsyncStorage.getItem(MUSIC_KEY)
      .then((v) => v === 'on' && setMusicOn(true))
      .catch(() => {});
    return () => {
      clearTimeout(musicStop.current);
      music.current?.remove();
      music.current = null;
    };
  }, []);
  const playMusic = () => {
    clearTimeout(musicStop.current);
    if (!music.current) {
      music.current = createAudioPlayer(MUSIC_SRC);
      music.current.loop = true;
    }
    music.current.seekTo(0);
    music.current.play();
  };
  const stopMusic = (afterMs = 0) => {
    clearTimeout(musicStop.current);
    if (afterMs > 0) musicStop.current = setTimeout(() => music.current?.pause(), afterMs);
    else music.current?.pause();
  };
  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    AsyncStorage.setItem(MUSIC_KEY, next ? 'on' : 'off').catch(() => {});
    if (status === 'running') {
      if (next) playMusic();
      else stopMusic();
    }
  };

  const say = (key: string) => {
    const p = player.current;
    const clip = SPRITE[key];
    if (!p || !clip || !voiceOn) return;
    const [start, len] = clip;
    clearTimeout(stopTimer.current);
    clearTimeout(checkTimer.current);
    p.seekTo(start);
    p.play();
    // If the jump did not land (the file was still loading), jump again.
    checkTimer.current = setTimeout(() => {
      const at = p.currentTime - start;
      if (at < -0.5 || at > len) p.seekTo(start);
    }, 250);
    stopTimer.current = setTimeout(() => p.pause(), len * 1000 + 250);
  };
  const hush = () => {
    clearTimeout(stopTimer.current);
    clearTimeout(checkTimer.current);
    player.current?.pause();
  };
  const announceKey = exercise.id === 'custom' ? 'ann-custom' : `ann-${exercise.id}-${duration}`;
  const introKey = `${exercise.id}-intro`;
  const closeKey = `${exercise.id}-close`;

  const cycle = exercise.steps.reduce((sum, s) => sum + s.seconds, 0);

  // Where are we in the pattern right now?
  let stepIndex = 0;
  let stepLeft = exercise.steps[0].seconds;
  {
    let pos = Math.max(0, elapsed) % cycle;
    for (let i = 0; i < exercise.steps.length; i++) {
      if (pos < exercise.steps[i].seconds) {
        stepIndex = i;
        stepLeft = exercise.steps[i].seconds - pos;
        break;
      }
      pos -= exercise.steps[i].seconds;
    }
  }
  const step = exercise.steps[stepIndex];
  const gettingReady = status === 'running' && elapsed < 0;
  const tonesLen = SPRITE.tones[1];
  const toneCount =
    gettingReady && elapsed >= tonesAt && elapsed < tonesAt + tonesLen
      ? Math.ceil(tonesLen - (elapsed - tonesAt))
      : 0;

  // Play each part of the opening sequence when its moment arrives.
  useEffect(() => {
    if (status !== 'running') return;
    while (schedule.current.length && elapsed >= schedule.current[0].at) {
      say(schedule.current.shift()!.clip);
    }
  }, [status, elapsed]);

  // The clock runs off real time, so it stays accurate even if the browser slows timers.
  useEffect(() => {
    if (status !== 'running') return;
    const timer = setInterval(() => {
      const t = (Date.now() - startedAt.current) / 1000;
      if (t >= duration) {
        setElapsed(duration);
        setStatus('done');
      } else {
        setElapsed(t);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [status, duration]);

  // Grow or shrink the circle, and speak the cue, each time a new step begins.
  useEffect(() => {
    if (status !== 'running' || gettingReady) return;
    if (lastStep.current === stepIndex) return;
    lastStep.current = stepIndex;
    // Skip the cue when it would not finish before the step or the session ends.
    if (duration - elapsed > 2 && step.seconds >= 2) {
      if (!saidMid.current && elapsed >= duration / 2 && step.move !== 'stay' && step.seconds >= 3) {
        saidMid.current = true;
        say('mid');
      } else {
        say(step.move === 'grow' ? 'in' : step.move === 'shrink' ? 'out' : 'hold');
      }
    }
    if (step.move === 'stay') return;
    Animated.timing(size, {
      toValue: step.move === 'grow' ? 1 : SMALL,
      duration: stepLeft * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [status, stepIndex, gettingReady]);

  const rest = (to: number = SMALL) => {
    size.stopAnimation();
    Animated.timing(size, { toValue: to, duration: 500, useNativeDriver: false }).start();
  };

  useEffect(() => {
    if (status === 'done') {
      rest(1); // full-size circle so the finish text fits inside it
      say(closeKey);
      stopMusic(6000); // let the music carry through the closing line
      onComplete();
    }
  }, [status]);

  const start = () => {
    // Opening sequence (voice on): announcement, get-ready line, three tones, intro line.
    let lead = 0;
    schedule.current = [];
    rest(); // back to the small circle before the first breath in
    if (voiceOn) {
      const tSetup = (SPRITE[announceKey]?.[1] ?? 0) + 0.4;
      const tTones = tSetup + SPRITE.setup[1] + 0.3;
      const tIntro = tTones + tonesLen + 0.4;
      const intro = SPRITE[introKey];
      lead = tIntro + (intro ? intro[1] + 0.6 : 0);
      schedule.current = [
        { at: tSetup - lead, clip: 'setup' },
        { at: tTones - lead, clip: 'tones' },
      ];
      if (intro) schedule.current.push({ at: tIntro - lead, clip: introKey });
      setTonesAt(tTones - lead);
      say(announceKey); // played inside the tap, which is what unlocks sound on phones
    }
    if (musicOn) playMusic();
    startedAt.current = Date.now() + lead * 1000;
    lastStep.current = -1;
    saidMid.current = false;
    setElapsed(-lead);
    setStatus('running');
  };

  const stop = () => {
    setStatus('ready');
    setElapsed(0);
    hush();
    stopMusic();
    rest();
  };

  const progress = status === 'ready' ? 0 : Math.max(0, Math.min(1, elapsed / duration));
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const breaths = Math.floor(Math.max(0, elapsed) / cycle);

  return (
    <View style={styles.session}>
      <View style={styles.column}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
            onPress={() => {
              hush();
              stopMusic();
              onBack();
            }}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.topTitle}>{exercise.name}</Text>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.timeLabel}>{status === 'done' ? 'Session complete' : 'Time left'}</Text>
        <Text style={styles.time}>{clock(duration - (status === 'ready' ? 0 : Math.max(0, elapsed)))}</Text>

        <View style={styles.stage}>
          <Svg width={STAGE} height={STAGE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={STAGE / 2}
              cy={STAGE / 2}
              r={RING_R}
              stroke="#1C2A52"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={STAGE / 2}
              cy={STAGE / 2}
              r={RING_R}
              stroke={exercise.color}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${RING_LEN} ${RING_LEN}`}
              strokeDashoffset={RING_LEN * (1 - progress)}
              transform={`rotate(-90 ${STAGE / 2} ${STAGE / 2})`}
            />
            {status === 'running' && !gettingReady && (
              <Circle
                cx={STAGE / 2 + RING_R * Math.cos(angle)}
                cy={STAGE / 2 + RING_R * Math.sin(angle)}
                r={9}
                fill={TEXT}
                stroke={exercise.color}
                strokeWidth={4}
              />
            )}
          </Svg>
          <Animated.View
            style={[
              styles.circle,
              { backgroundColor: exercise.color, transform: [{ scale: size }] },
            ]}
          />
          <View style={styles.center}>
            {status === 'ready' && <Text style={styles.stepLabel}>Ready</Text>}
            {gettingReady && toneCount === 0 && <Text style={styles.stepLabel}>Get ready</Text>}
            {toneCount > 0 && <Text style={styles.count}>{toneCount}</Text>}
            {status === 'running' && !gettingReady && (
              <>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={styles.count}>{Math.ceil(stepLeft)}</Text>
              </>
            )}
            {status === 'done' && (
              <>
                <Text style={styles.stepLabel}>Nice work</Text>
                <Text style={styles.doneSub}>{breaths} {breaths === 1 ? 'breath' : 'breaths'}</Text>
                {streak > 0 && (
                  <Text style={styles.doneStreak}>
                    {streak === 1 ? 'Day 1 of your streak' : `Congrats, ${streak} days in a row`}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        <Text style={styles.pattern}>{exercise.pattern}</Text>
        {exercise.note && <Text style={styles.note}>{exercise.note}</Text>}

        {status !== 'running' && (
          <View style={styles.chips}>
            {DURATIONS.filter((d) => d.seconds <= (exercise.maxSeconds ?? 300)).map((d) => {
              const on = d.seconds === duration;
              return (
                <Pressable
                  key={d.seconds}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, on && { borderColor: exercise.color, backgroundColor: CARD }]}
                  onPress={() => {
                    setDuration(d.seconds);
                    if (status === 'done') setStatus('ready');
                  }}
                >
                  <Text style={[styles.chipText, on && { color: TEXT }]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: status === 'running' ? '#2A3760' : exercise.color }]}
          onPress={status === 'running' ? stop : start}
        >
          <Text style={styles.buttonText}>
            {status === 'running' ? 'Stop' : status === 'done' ? 'Repeat' : 'Start'}
          </Text>
        </Pressable>

        <View style={styles.toggles}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Brandon's voice</Text>
            <Text style={[styles.toggleState, { color: voiceOn ? ON : OFF }]}>{voiceOn ? 'On' : 'Off'}</Text>
            <Switch
              accessibilityLabel="Brandon's voice"
              value={voiceOn}
              disabled={status === 'running'}
              onValueChange={setVoiceOn}
              trackColor={{ false: OFF, true: ON }}
              ios_backgroundColor={OFF}
              thumbColor={TEXT}
              {...({ activeThumbColor: TEXT } as object)}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Background music</Text>
            <Text style={[styles.toggleState, { color: musicOn ? ON : OFF }]}>{musicOn ? 'On' : 'Off'}</Text>
            <Switch
              accessibilityLabel="Background music"
              value={musicOn}
              onValueChange={toggleMusic}
              trackColor={{ false: OFF, true: ON }}
              ios_backgroundColor={OFF}
              thumbColor={TEXT}
              {...({ activeThumbColor: TEXT } as object)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'custom' | 'session'>('home');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [counts, setCounts] = useState<Counts>(DEFAULT_COUNTS);
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    loadStreak().then((s) => setStreak(liveCount(s)));
    AsyncStorage.getItem(COUNTS_KEY)
      .then((raw) => raw && setCounts({ ...DEFAULT_COUNTS, ...JSON.parse(raw) }))
      .catch(() => {});
  }, []);
  const onComplete = () => recordSession().then((s) => setStreak(s.count));
  const fromCustom = exercise?.id === 'custom';

  return (
    <View style={styles.app}>
      {screen === 'home' && (
        <Home
          streak={streak}
          onPick={(e) => {
            setExercise(e);
            setScreen('session');
          }}
          onCustom={() => setScreen('custom')}
        />
      )}
      {screen === 'custom' && (
        <CustomSetup
          counts={counts}
          onChange={setCounts}
          onBack={() => setScreen('home')}
          onStart={() => {
            AsyncStorage.setItem(COUNTS_KEY, JSON.stringify(counts)).catch(() => {});
            setExercise(customExercise(counts));
            setScreen('session');
          }}
        />
      )}
      {screen === 'session' && exercise && (
        <Session
          key={exercise.id + exercise.pattern}
          exercise={exercise}
          onBack={() => setScreen(fromCustom ? 'custom' : 'home')}
          streak={streak}
          onComplete={onComplete}
        />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: BG },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center' },

  homeScroll: { padding: 20, paddingTop: 32, paddingBottom: 40 },
  brand: { color: MUTED, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  h1: { color: TEXT, fontSize: 32, fontWeight: '800', marginTop: 8 },
  sub: { color: MUTED, fontSize: 15, marginTop: 6 },

  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 16,
    marginTop: 16,
  },
  streakNum: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 30,
    textAlign: 'center',
    backgroundColor: '#E5484D',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  streakText: { color: TEXT, fontSize: 14, fontWeight: '600' },

  question: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginTop: 28,
    marginBottom: 12,
  },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    minHeight: 132,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardName: { color: TEXT, fontSize: 18, fontWeight: '800' },
  cardTag: { color: MUTED, fontSize: 13, marginTop: 4 },
  custom: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  customGo: { color: MUTED, fontSize: 30, fontWeight: '300' },
  beta: { color: MUTED, fontSize: 12, marginTop: 24, opacity: 0.7, textAlign: 'center' },

  setupHelp: { color: MUTED, fontSize: 15, marginTop: 28, marginBottom: 12, textAlign: 'center' },
  countRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  countLabel: { flex: 1, color: TEXT, fontSize: 17, fontWeight: '700' },
  countValue: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '800',
    width: 56,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#24325C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: { opacity: 0.35 },
  bar: { width: '100%', flexDirection: 'row', gap: 4, marginTop: 18, height: 40 },
  barPart: { borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 30 },
  barText: { color: '#06122B', fontSize: 14, fontWeight: '800' },
  summary: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  summaryLabel: { color: MUTED, fontSize: 12 },
  summaryValue: { color: TEXT, fontSize: 17, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  stepBtnText: { color: TEXT, fontSize: 24, fontWeight: '600', lineHeight: 28 },

  session: { flex: 1, padding: 20, paddingTop: 24 },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: TEXT, fontSize: 28, lineHeight: 30, marginTop: -2 },
  topTitle: { color: TEXT, fontSize: 17, fontWeight: '700' },

  timeLabel: { color: MUTED, fontSize: 14, marginTop: 28 },
  time: { color: TEXT, fontSize: 22, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },

  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  circle: { position: 'absolute', width: 224, height: 224, borderRadius: 112, opacity: 0.92 },
  center: { alignItems: 'center', maxWidth: 190 },
  stepLabel: { color: TEXT, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  count: { color: TEXT, fontSize: 40, fontWeight: '800', marginTop: 2 },
  doneSub: { color: TEXT, fontSize: 15, marginTop: 4, opacity: 0.9 },
  doneStreak: { color: TEXT, fontSize: 13, fontWeight: '700', marginTop: 6, textAlign: 'center' },

  pattern: { color: MUTED, fontSize: 14, marginTop: 20 },
  note: { color: MUTED, fontSize: 13, marginTop: 14, textAlign: 'center' },

  chips: { flexDirection: 'row', gap: 8, marginTop: 18 },
  chip: {
    borderWidth: 1.5,
    borderColor: '#24325C',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipText: { color: MUTED, fontSize: 14, fontWeight: '600' },

  button: {
    marginTop: 22,
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 999,
  },
  buttonText: { color: TEXT, fontSize: 18, fontWeight: '800' },
  toggles: { width: '100%', maxWidth: 320, marginTop: 18, gap: 10 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toggleLabel: { flex: 1, color: TEXT, fontSize: 15, fontWeight: '600' },
  toggleState: { fontSize: 13, fontWeight: '700', marginRight: 10 },
});
