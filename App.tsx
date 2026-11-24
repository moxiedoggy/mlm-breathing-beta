import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';

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
};

const QUICK_RESET: Exercise = {
  id: 'blb',
  name: 'Big League Breath',
  tagline: 'Slow · Quiet · Gentle · Through the nose',
  pattern: 'In 4 · Out 6',
  color: '#E5484D',
  steps: [
    { label: 'Breathe in', seconds: 4, move: 'grow' },
    { label: 'Breathe out', seconds: 6, move: 'shrink' },
  ],
};

const EXERCISES: Exercise[] = [
  {
    id: 'focused',
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

function clock(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Home: pick how you want to feel.
// ---------------------------------------------------------------------------
function Home({ onPick }: { onPick: (e: Exercise) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.homeScroll}>
      <View style={styles.column}>
        <Text style={styles.brand}>MAJOR LEAGUE MINDSET+</Text>
        <Text style={styles.h1}>The Breath Gym</Text>
        <Text style={styles.sub}>Train your breath. Own your state.</Text>

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
        <Text style={styles.beta}>Beta · timings are placeholders</Text>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Session: the breathing circle.
// ---------------------------------------------------------------------------
function Session({ exercise, onBack }: { exercise: Exercise; onBack: () => void }) {
  const [duration, setDuration] = useState(exercise.startSeconds ?? 60);
  const [status, setStatus] = useState<'ready' | 'running' | 'done'>('ready');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const lastStep = useRef(-1);
  const size = useRef(new Animated.Value(SMALL)).current;

  const cycle = exercise.steps.reduce((sum, s) => sum + s.seconds, 0);

  // Where are we in the pattern right now?
  let stepIndex = 0;
  let stepLeft = exercise.steps[0].seconds;
  {
    let pos = elapsed % cycle;
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
    if (status !== 'running') return;
    if (lastStep.current === stepIndex) return;
    lastStep.current = stepIndex;
    if (step.move === 'stay') return;
    Animated.timing(size, {
      toValue: step.move === 'grow' ? 1 : SMALL,
      duration: stepLeft * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [status, stepIndex]);

  const rest = () => {
    size.stopAnimation();
    Animated.timing(size, { toValue: SMALL, duration: 500, useNativeDriver: false }).start();
  };

  useEffect(() => {
    if (status === 'done') rest();
  }, [status]);

  const start = () => {
    startedAt.current = Date.now();
    lastStep.current = -1;
    setElapsed(0);
    setStatus('running');
  };

  const stop = () => {
    setStatus('ready');
    setElapsed(0);
    rest();
  };

  const progress = status === 'ready' ? 0 : Math.min(1, elapsed / duration);
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const breaths = Math.floor(elapsed / cycle);

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
        <Text style={styles.time}>{clock(duration - (status === 'ready' ? 0 : elapsed))}</Text>

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
            {status === 'running' && (
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
            {status === 'running' && (
              <>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={styles.count}>{Math.ceil(stepLeft)}</Text>
              </>
            )}
            {status === 'done' && (
              <>
                <Text style={styles.stepLabel}>Nice work</Text>
                <Text style={styles.doneSub}>{breaths} {breaths === 1 ? 'breath' : 'breaths'}</Text>
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
            {status === 'running' ? 'Stop' : status === 'done' ? 'Go again' : 'Start'}
          </Text>
        </Pressable>

        <Text style={styles.soon}>Brandon's voice and background sound come next</Text>
      </View>
    </View>
  );
}

export default function App() {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  return (
    <View style={styles.app}>
      {exercise ? (
        <Session key={exercise.id} exercise={exercise} onBack={() => setExercise(null)} />
      ) : (
        <Home onPick={setExercise} />
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
  soon: { color: MUTED, fontSize: 12, marginTop: 18, opacity: 0.7 },
});
