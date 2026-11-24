import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Exercises. Everything Brandon may want to change lives in this one list:
// names, taglines, colors, and the breathing pattern (seconds per step).
// Timings are placeholders until Brandon confirms his own patterns.
// ---------------------------------------------------------------------------
type Step = { label: string; seconds: number; move: 'grow' | 'shrink' | 'stay' };
type Exercise = {
  id: string;
  name: string;
  tagline: string;
  pattern: string;
  color: string;
  steps: Step[];
  maxSeconds?: number; // longest session offered
  startSeconds?: number; // session length picked by default
  note?: string;
  voice?: Voice;
};

// Short voice clips. They are separate so the voice stays in step with the circle
// at any session length. leadIn = seconds of "get ready" while the opening line plays.
type VoiceClip = 'intro' | 'in' | 'out' | 'hold' | 'mid' | 'close';
type Voice = { leadIn: number; intro: number; close: number; introGain: number; closeGain: number };

// Cues every exercise shares.
const CUES = {
  in: require('./assets/voice/in.mp3'),
  out: require('./assets/voice/out.mp3'),
  hold: require('./assets/voice/hold.mp3'),
  mid: require('./assets/voice/mid.mp3'),
};
// Every clip is turned down to the level of the quiet "Breathe in" cue, so no line
// jumps out louder than another. Gains come from measuring each recording.
const CUE_GAIN = { in: 0.94, out: 1, hold: 0.65, mid: 0.61 };

const QUICK_RESET: Exercise = {
  id: 'blb',
  name: 'Big League Breath',
  tagline: 'Slow · Quiet · Gentle · Through the nose',
  pattern: 'In 4 · Out 6',
  color: '#E5484D',
  voice: {
    leadIn: 8.5,
    intro: require('./assets/voice/blb-intro.mp3'),
    close: require('./assets/voice/blb-close.mp3'),
    introGain: 0.57,
    closeGain: 0.33,
  },
  steps: [
    { label: 'Breathe in', seconds: 4, move: 'grow' },
    { label: 'Breathe out', seconds: 6, move: 'shrink' },
  ],
};

const EXERCISES: Exercise[] = [
  {
    id: 'focused',
    voice: {
      leadIn: 9.5,
      intro: require('./assets/voice/focused-intro.mp3'),
      close: require('./assets/voice/focused-close.mp3'),
      introGain: 0.51,
      closeGain: 0.51,
    },
    name: 'Focused',
    tagline: 'Lock into the present',
    pattern: 'Box breathing · 4-4-4-4',
    color: '#4DA3FF',
    steps: [
      { label: 'Breathe in', seconds: 4, move: 'grow' },
      { label: 'Hold', seconds: 4, move: 'stay' },
      { label: 'Breathe out', seconds: 4, move: 'shrink' },
      { label: 'Hold', seconds: 4, move: 'stay' },
    ],
  },
  {
    id: 'calm',
    voice: {
      leadIn: 7,
      intro: require('./assets/voice/calm-intro.mp3'),
      close: require('./assets/voice/calm-close.mp3'),
      introGain: 0.52,
      closeGain: 0.71,
    },
    name: 'Calm',
    tagline: 'Reset under pressure',
    pattern: 'Long exhale · In 4 · Out 6',
    color: '#3DD6C3',
    steps: [
      { label: 'Breathe in', seconds: 4, move: 'grow' },
      { label: 'Breathe out', seconds: 6, move: 'shrink' },
    ],
  },
  {
    id: 'energized',
    voice: {
      leadIn: 8,
      intro: require('./assets/voice/energized-intro.mp3'),
      close: require('./assets/voice/energized-close.mp3'),
      introGain: 0.5,
      closeGain: 0.42,
    },
    name: 'Energized',
    tagline: 'Get ready to compete',
    pattern: 'Quick rhythm · In 3 · Out 3',
    color: '#FF8A3D',
    // Kept short and gentle on purpose: no fast breathing and no holds for young athletes.
    maxSeconds: 60,
    startSeconds: 30,
    note: 'Sit tall. Stop if you feel dizzy.',
    steps: [
      { label: 'Breathe in', seconds: 3, move: 'grow' },
      { label: 'Breathe out', seconds: 3, move: 'shrink' },
    ],
  },
  {
    id: 'recovered',
    voice: {
      leadIn: 6,
      intro: require('./assets/voice/recovered-intro.mp3'),
      close: require('./assets/voice/recovered-close.mp3'),
      introGain: 0.44,
      closeGain: 0.71,
    },
    name: 'Recovered',
    tagline: 'Wind down and recharge',
    pattern: 'Slow breath · In 5 · Out 5',
    color: '#9B8CFF',
    steps: [
      { label: 'Breathe in', seconds: 5, move: 'grow' },
      { label: 'Breathe out', seconds: 5, move: 'shrink' },
    ],
  },
];

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
// Home: pick how you want to feel.
// ---------------------------------------------------------------------------
function Home({ onPick, streak }: { onPick: (e: Exercise) => void; streak: number }) {
  return (
    <ScrollView contentContainerStyle={styles.homeScroll}>
      <View style={styles.column}>
        <Text style={styles.brand}>MAJOR LEAGUE MINDSET+</Text>
        <Text style={styles.h1}>The Breath Gym</Text>
        <Text style={styles.sub}>Train your breath. Own your state.</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakNum}>{streak}</Text>
          <Text style={styles.streakText}>{streakLine(streak)}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[styles.quick, { backgroundColor: QUICK_RESET.color }]}
          onPress={() => onPick(QUICK_RESET)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.quickKicker}>QUICK RESET · 60 SEC</Text>
            <Text style={styles.quickName}>{QUICK_RESET.name}</Text>
            <Text style={styles.quickTag}>{QUICK_RESET.tagline}</Text>
          </View>
          <Text style={styles.quickGo}>›</Text>
        </Pressable>

        <Text style={styles.question}>How do you want to feel?</Text>
        <View style={styles.grid}>
          {EXERCISES.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              style={styles.card}
              onPress={() => onPick(e)}
            >
              <View style={[styles.dot, { backgroundColor: e.color }]} />
              <Text style={styles.cardName}>{e.name}</Text>
              <Text style={styles.cardTag}>{e.tagline}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.beta}>Beta · timings are placeholders · streak saves on this device</Text>
      </View>
    </ScrollView>
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

  // Voice: one small player per clip, loaded when the screen opens.
  const [voiceOn, setVoiceOn] = useState(true);
  const players = useRef<Partial<Record<VoiceClip, AudioPlayer>>>({});
  const saidMid = useRef(false);
  useEffect(() => {
    if (!exercise.voice) return;
    const made: Partial<Record<VoiceClip, AudioPlayer>> = {};
    const sources: Record<VoiceClip, number> = {
      ...CUES,
      intro: exercise.voice.intro,
      close: exercise.voice.close,
    };
    (Object.keys(sources) as VoiceClip[]).forEach((k) => {
      made[k] = createAudioPlayer(sources[k]);
    });
    players.current = made;
    return () => {
      Object.values(made).forEach((pl) => pl?.remove());
      players.current = {};
    };
  }, [exercise]);
  const hasVoice = !!exercise.voice && voiceOn;
  const say = (clip: VoiceClip) => {
    const pl = players.current[clip];
    if (!pl || !hasVoice) return;
    pl.volume =
      clip === 'intro'
        ? exercise.voice!.introGain
        : clip === 'close'
          ? exercise.voice!.closeGain
          : CUE_GAIN[clip];
    pl.seekTo(0);
    pl.play();
  };
  const hush = () => Object.values(players.current).forEach((pl) => pl?.pause());

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

  // Grow or shrink the circle each time a new step begins.
  useEffect(() => {
    if (status !== 'running' || gettingReady) return;
    if (lastStep.current === stepIndex) return;
    lastStep.current = stepIndex;
    if (duration - elapsed > 2) {
      if (!saidMid.current && elapsed >= duration / 2 && step.move !== 'stay') {
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

  const rest = () => {
    size.stopAnimation();
    Animated.timing(size, { toValue: SMALL, duration: 500, useNativeDriver: false }).start();
  };

  useEffect(() => {
    if (status === 'done') {
      rest();
      say('close');
      onComplete();
    }
  }, [status]);

  const start = () => {
    // The opening line plays first; the breathing clock starts after it.
    const lead = hasVoice ? exercise.voice!.leadIn : 0;
    startedAt.current = Date.now() + lead * 1000;
    lastStep.current = -1;
    saidMid.current = false;
    if (hasVoice) {
      // Phones only allow sound that begins with a tap, so wake every clip now.
      (Object.keys(players.current) as VoiceClip[]).forEach((k) => {
        const pl = players.current[k];
        if (!pl || k === 'intro') return;
        pl.volume = 0;
        pl.play();
        setTimeout(() => {
          pl.pause();
          pl.seekTo(0);
        }, 80);
      });
      say('intro');
    }
    setElapsed(-lead);
    setStatus('running');
  };

  const stop = () => {
    setStatus('ready');
    setElapsed(0);
    hush();
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
            onPress={onBack}
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
            {gettingReady && <Text style={styles.stepLabel}>Get ready</Text>}
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

        {exercise.voice ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceOn }}
            disabled={status === 'running'}
            style={styles.voiceToggle}
            onPress={() => setVoiceOn((v) => !v)}
          >
            <Text style={styles.voiceText}>Brandon's voice: {voiceOn ? 'On' : 'Off'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.soon}> </Text>
        )}
      </View>
    </View>
  );
}

export default function App() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    loadStreak().then((s) => setStreak(liveCount(s)));
  }, []);
  const onComplete = () => recordSession().then((s) => setStreak(s.count));
  return (
    <View style={styles.app}>
      {exercise ? (
        <Session
          key={exercise.id}
          exercise={exercise}
          onBack={() => setExercise(null)}
          streak={streak}
          onComplete={onComplete}
        />
      ) : (
        <Home onPick={setExercise} streak={streak} />
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

  quick: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    marginTop: 24,
  },
  quickKicker: { color: TEXT, opacity: 0.85, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  quickName: { color: TEXT, fontSize: 22, fontWeight: '800', marginTop: 4 },
  quickTag: { color: TEXT, opacity: 0.9, fontSize: 13, marginTop: 4 },
  quickGo: { color: TEXT, fontSize: 36, fontWeight: '300', marginLeft: 12 },

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
    minHeight: 116,
  },
  dot: { width: 14, height: 14, borderRadius: 7, marginBottom: 14 },
  cardName: { color: TEXT, fontSize: 18, fontWeight: '800' },
  cardTag: { color: MUTED, fontSize: 13, marginTop: 4 },
  beta: { color: MUTED, fontSize: 12, marginTop: 24, opacity: 0.7 },

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
  center: { alignItems: 'center' },
  stepLabel: { color: TEXT, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  count: { color: TEXT, fontSize: 40, fontWeight: '800', marginTop: 2 },
  doneSub: { color: TEXT, fontSize: 15, marginTop: 4, opacity: 0.9 },

  doneStreak: { color: TEXT, fontSize: 13, fontWeight: '700', marginTop: 6 },

  pattern: { color: MUTED, fontSize: 14, marginTop: 20 },

  note: { color: MUTED, fontSize: 13, marginTop: 6 },

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
  voiceToggle: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 16 },
  voiceText: { color: MUTED, fontSize: 14, fontWeight: '600' },
  soon: { color: MUTED, fontSize: 12, marginTop: 18, opacity: 0.7 },
});
