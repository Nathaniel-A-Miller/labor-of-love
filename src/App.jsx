import { useState, useEffect, useRef, useCallback } from "react";

const PALETTE = {
  bg: "#1F1B2E",
  bgSoft: "#2A2440",
  card: "#282139",
  coral: "#F6A192",
  amber: "#E8B872",
  mint: "#8FD9A8",
  rose: "#E3849B",
  cream: "#F5EFE6",
  lavender: "#9C93B2",
  danger: "#E58C7C",
};

const STAGES = [
  {
    key: "early", label: "Early Labor", from: 0, to: 3,
    contractionBase: 3200, contractionVar: 600, restBase: 4200, restVar: 900,
    weights: { mild: 0.6, moderate: 0.3, strong: 0.1, peak: 0 },
  },
  {
    key: "active", label: "Active Labor", from: 3, to: 6,
    contractionBase: 2500, contractionVar: 500, restBase: 2400, restVar: 600,
    weights: { mild: 0.25, moderate: 0.45, strong: 0.25, peak: 0.05 },
  },
  {
    key: "transition", label: "Transition", from: 6, to: 10,
    contractionBase: 2000, contractionVar: 400, restBase: 1200, restVar: 400,
    weights: { mild: 0.05, moderate: 0.15, strong: 0.4, peak: 0.4 },
  },
];

const WINDOW_BASE = { mild: 0.5, moderate: 0.38, strong: 0.28, peak: 0.2 };
const COST_BASE = { mild: 4, moderate: 6, strong: 9, peak: 13 };
const INTENSITY_LABEL = { mild: "manageable", moderate: "solid", strong: "intense", peak: "overwhelming" };

const PARTNER_LINES = [
  "\u201cYou're doing this. I'm right here,\u201d your partner says, low and steady.",
  "Your partner presses a cool cloth to your forehead without a word.",
  "\u201cOne wave at a time,\u201d your partner reminds you. \u201cThat's all this is.\u201d",
  "Your partner's hand finds yours before you even reach for it.",
];

const CHOICE_EVENTS = [
  {
    id: "harder-than-expected",
    prompt: "That last wave hit harder than you were ready for.",
    options: [
      { label: "Breathe slow and low", energy: -3, coping: 8, dilation: 0.1, flavor: "You slow your breath down, and the room slows with it." },
      { label: "Change position", energy: -6, coping: 4, dilation: 0.3, flavor: "You shift, and something in your body seems to agree with the choice." },
      { label: "Squeeze your partner's hand", energy: -1, coping: 10, dilation: 0.1, flavor: "You hold on tighter than you meant to. Nobody minds." },
      { label: "Grab the dinosaur from your bag", energy: -1, coping: 9, dilation: 0.1, flavor: "You dig it out and hold it against your chest. It smells like home." },
    ],
  },
  {
    id: "exhausted-between-waves",
    prompt: "In the quiet between contractions, exhaustion catches up to you.",
    options: [
      { label: "Sip water, close your eyes", energy: 10, coping: 2, dilation: 0, flavor: "A few seconds of stillness. It's not much. It's something." },
      { label: "Try to doze for a moment", energy: 14, coping: -3, dilation: 0, flavor: "You almost drift off before the next wave calls you back." },
      { label: "Keep moving, don't stop now", energy: -8, coping: 1, dilation: 0.4, flavor: "You keep pacing. It hurts more, but it also feels like progress." },
    ],
  },
  {
    id: "pain-is-a-lot",
    prompt: "The pain has climbed to somewhere you didn't expect to be.",
    options: [
      { label: "Ask about the epidural", energy: 8, coping: 22, dilation: 0, flavor: "Relief spreads through you \u2014 and with it, a strange distance from what your body is doing.", epidural: 4 },
      { label: "Stay with your breathing", energy: -4, coping: 6, dilation: 0.3, flavor: "You stay inside your own rhythm. It's hard-won, but it's yours." },
      { label: "Get into the shower", energy: -2, coping: 10, dilation: 0.1, flavor: "Warm water runs over your back. For a moment, that's the whole world." },
    ],
  },
  {
    id: "doubt",
    prompt: "A thought surfaces, uninvited: I don't know if I can do this.",
    options: [
      { label: "One contraction at a time", energy: 0, coping: 12, dilation: 0, flavor: "You let go of the hours ahead and just meet the one wave in front of you." },
      { label: "Let your partner talk you through it", energy: 2, coping: 14, dilation: 0, flavor: "Their voice gives you something to hold onto that isn't pain." },
      { label: "Just keep breathing", energy: -2, coping: 6, dilation: 0.1, flavor: "You don't have an answer. You just keep going, which turns out to be enough." },
    ],
  },
  {
    id: "transition-hardest",
    prompt: "Everyone said this part would be the hardest. They weren't wrong.",
    options: [
      { label: "Grit through it", energy: -10, coping: -2, dilation: 0.6, flavor: "You find a strength you didn't know was still in there." },
      { label: "Ask for reassurance", energy: 3, coping: 16, dilation: 0.1, flavor: "\u201cYou're almost there,\u201d someone says. You choose to believe them." },
      { label: "Change position again", energy: -5, coping: 6, dilation: 0.4, flavor: "Nothing about this is comfortable. This is just slightly less unbearable." },
    ],
  },
];

function stageFor(cm) {
  return STAGES.find((s) => cm >= s.from && cm < s.to) || STAGES[STAGES.length - 1];
}

function weightedIntensity(weights) {
  const r = Math.random();
  let acc = 0;
  for (const k of ["mild", "moderate", "strong", "peak"]) {
    acc += weights[k];
    if (r <= acc) return k;
  }
  return "moderate";
}

function fatigueFactor(energy) {
  return Math.max(0.55, Math.min(1, 0.55 + energy / 230));
}

function formatClock(totalMinutes) {
  const m = Math.floor(totalMinutes) % (24 * 60);
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

export default function LaborGame() {
  const [phase, setPhase] = useState("intro"); // intro | labor | pushing | complete
  const [dilation, setDilation] = useState(0);
  const [energy, setEnergy] = useState(100);
  const [coping, setCoping] = useState(55);
  const [inContraction, setInContraction] = useState(false);
  const [waveProgress, setWaveProgress] = useState(0);
  const [intensity, setIntensity] = useState("mild");
  const [windowSize, setWindowSize] = useState(0.4);
  const [feedback, setFeedback] = useState(null);
  const [pushHits, setPushHits] = useState(0);
  const [journal, setJournal] = useState([]);
  const [choiceEvent, setChoiceEvent] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const contractionActive = useRef(false);
  const segmentStart = useRef(null);
  const segmentDuration = useRef(null);
  const hitRef = useRef(false);
  const dilationRef = useRef(0);
  const energyRef = useRef(100);
  const contractionCounter = useRef(0);
  const usedEvents = useRef([]);
  const choicePending = useRef(false);
  const epiduralBuff = useRef(0);
  const startClockBase = useRef(23 * 60 + Math.floor(Math.random() * 90));
  const startTime = useRef(null);
  const prevStageKey = useRef("early");
  const feedbackTimeout = useRef(null);

  useEffect(() => { dilationRef.current = dilation; }, [dilation]);
  useEffect(() => { energyRef.current = energy; }, [energy]);

  const storyMinutes = startClockBase.current + elapsed * 1.5;

  const addLog = useCallback((text) => {
    setJournal((j) => [...j, { time: formatClock(startClockBase.current + elapsed * 1.5), text }]);
  }, [elapsed]);

  function generateContraction(stage) {
    const w = weightedIntensity(stage.weights);
    const duration = stage.contractionBase + (Math.random() * 2 - 1) * stage.contractionVar;
    const fatigue = fatigueFactor(energyRef.current);
    const buffed = epiduralBuff.current > 0;
    const window = Math.min(0.9, WINDOW_BASE[w] * fatigue + (buffed ? 0.15 : 0));
    const cost = COST_BASE[w] * (buffed ? 0.5 : 1);
    return { duration, intensity: w, window, cost };
  }

  function generateRest(stage) {
    const buffed = epiduralBuff.current > 0;
    return stage.restBase + (Math.random() * 2 - 1) * stage.restVar + (buffed ? 400 : 0);
  }

  function generatePush() {
    const fatigue = fatigueFactor(energyRef.current);
    const duration = 1500 + Math.random() * 400;
    const window = Math.min(0.85, WINDOW_BASE.peak * fatigue + 0.05);
    return { duration, intensity: "peak", window, cost: COST_BASE.peak * 0.6 };
  }

  const contractionParams = useRef(null);

  const startSegment = useCallback((isContraction) => {
    const stage = stageFor(dilationRef.current);
    if (isContraction) {
      const c = phase === "pushing" ? generatePush() : generateContraction(stage);
      contractionParams.current = c;
      segmentDuration.current = c.duration;
      setIntensity(c.intensity);
      setWindowSize(c.window);
      hitRef.current = false;
    } else {
      segmentDuration.current = phase === "pushing" ? 1300 + Math.random() * 300 : generateRest(stage);
    }
    segmentStart.current = Date.now();
    contractionActive.current = isContraction;
    setInContraction(isContraction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const showFeedback = useCallback((text, good) => {
    setFeedback({ text, good });
    clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 750);
  }, []);

  const triggerChoiceEvent = useCallback(() => {
    const pool = CHOICE_EVENTS.filter((e) => !usedEvents.current.includes(e.id));
    const source = pool.length ? pool : CHOICE_EVENTS;
    const evt = source[Math.floor(Math.random() * source.length)];
    usedEvents.current.push(evt.id);
    if (usedEvents.current.length >= CHOICE_EVENTS.length) usedEvents.current = [];
    choicePending.current = true;
    setChoiceEvent(evt);
  }, []);

  // engine tick
  useEffect(() => {
    if (phase !== "labor" && phase !== "pushing") return;
    const id = setInterval(() => {
      if (choicePending.current) return;
      if (segmentStart.current === null) {
        startSegment(!contractionActive.current);
        return;
      }
      const now = Date.now();
      const elapsedSeg = now - segmentStart.current;
      const prog = Math.min(1, elapsedSeg / segmentDuration.current);
      setWaveProgress(prog);

      if (prog >= 1) {
        if (contractionActive.current) {
          const c = contractionParams.current;
          if (!hitRef.current) {
            setEnergy((e) => Math.max(0, e - (c?.cost || 6)));
            setCoping((t) => Math.max(0, t - 8));
            setDilation((d) => Math.min(10, d + (phase === "pushing" ? 0 : 0.1)));
          }
          if (epiduralBuff.current > 0) epiduralBuff.current -= 1;
          contractionCounter.current += 1;

          if (phase === "labor") {
            if (Math.random() < 0.22) addLog(PARTNER_LINES[Math.floor(Math.random() * PARTNER_LINES.length)]);
            if (contractionCounter.current % 3 === 0) {
              triggerChoiceEvent();
              contractionActive.current = false;
              segmentStart.current = null;
              return;
            }
          }
        } else {
          setEnergy((e) => Math.min(100, e + 3));
          setCoping((t) => (t < 50 ? Math.min(100, t + 1) : t));
        }
        contractionActive.current = false;
        segmentStart.current = null;
      }
    }, 40);
    return () => clearInterval(id);
  }, [phase, startSegment, addLog, triggerChoiceEvent]);

  // timer
  useEffect(() => {
    if (phase === "intro" || phase === "complete") return;
    const id = setInterval(() => {
      if (startTime.current) setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  // stage transition logging + push handoff
  useEffect(() => {
    if (phase !== "labor") return;
    const stage = stageFor(dilation);
    if (stage.key !== prevStageKey.current) {
      prevStageKey.current = stage.key;
      addLog(`${stage.label} begins.`);
    }
    if (dilation >= 10) {
      addLog("The urge to push takes over everything else.");
      setPhase("pushing");
      segmentStart.current = null;
      contractionActive.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dilation, phase]);

  useEffect(() => {
    if (phase === "pushing" && pushHits >= 6) {
      addLog("And then, all at once \u2014 your baby is here.");
      setTimeout(() => setPhase("complete"), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushHits, phase]);

  function handleTap() {
    if (!inContraction || hitRef.current || choicePending.current) return;
    const c = contractionParams.current;
    if (!c) return;
    const dist = Math.abs(waveProgress - 0.55);
    if (dist <= c.window) {
      const goodness = 1 - dist / c.window;
      hitRef.current = true;
      setEnergy((e) => Math.max(0, e - c.cost * 0.5));
      setCoping((t) => Math.min(100, t + 6 + goodness * 8));
      if (phase === "pushing") {
        setPushHits((n) => n + 1);
        showFeedback(goodness > 0.7 ? "Strong push" : "Good push", true);
      } else {
        setDilation((d) => Math.min(10, d + 0.35 + goodness * 0.35));
        showFeedback(goodness > 0.7 ? "Steady through it" : "Breathing through it", true);
      }
    } else {
      setEnergy((e) => Math.max(0, e - 4));
      setCoping((t) => Math.max(0, t - 5));
      showFeedback("Off rhythm", false);
    }
  }

  function resolveChoice(opt) {
    setEnergy((e) => Math.max(0, Math.min(100, e + opt.energy)));
    setCoping((t) => Math.max(0, Math.min(100, t + opt.coping)));
    if (opt.dilation) setDilation((d) => Math.min(10, d + opt.dilation));
    if (opt.epidural) epiduralBuff.current = opt.epidural;
    addLog(opt.flavor);
    setChoiceEvent(null);
    choicePending.current = false;
    segmentStart.current = null;
    contractionActive.current = false;
  }

  function begin() {
    setPhase("labor");
    setDilation(0);
    setEnergy(100);
    setCoping(55);
    setInContraction(false);
    setWaveProgress(0);
    setPushHits(0);
    setJournal([]);
    setElapsed(0);
    contractionActive.current = false;
    segmentStart.current = null;
    contractionCounter.current = 0;
    prevStageKey.current = "early";
    epiduralBuff.current = 0;
    usedEvents.current = [];
    startTime.current = Date.now();
    setTimeout(() => addLog("Contractions begin. Nothing to do yet but breathe."), 50);
  }

  function restart() {
    setPhase("intro");
  }

  useEffect(() => {
    function onKey(e) {
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "labor" || phase === "pushing") handleTap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const stage = stageFor(dilation);
  const copingColor = coping < 30 ? PALETTE.danger : coping < 60 ? PALETTE.amber : PALETTE.mint;
  const energyColor = energy < 25 ? PALETTE.danger : energy < 55 ? PALETTE.amber : PALETTE.mint;

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-4"
      style={{ background: `radial-gradient(circle at 50% -10%, ${PALETTE.bgSoft}, ${PALETTE.bg})`, fontFamily: "Georgia, 'Iowan Old Style', serif" }}
    >
      <style>{`
        @keyframes riseIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: translateY(0);} }
        @keyframes glowPulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        @keyframes drift { 0% { transform: translateY(0);} 50% { transform: translateY(-6px);} 100% { transform: translateY(0);} }
        .riseIn { animation: riseIn .45s ease-out; }
        .glowPulse { animation: glowPulse 2.2s ease-in-out infinite; }
        .drift { animation: drift 4s ease-in-out infinite; }
        button:focus-visible { outline: 2px solid ${PALETTE.mint}; outline-offset: 3px; }
        .journal::-webkit-scrollbar { width: 5px; }
        .journal::-webkit-scrollbar-thumb { background: ${PALETTE.bgSoft}; border-radius: 4px; }
      `}</style>

      <div className="w-full max-w-3xl grid gap-4" style={{ gridTemplateColumns: phase === "intro" || phase === "complete" ? "1fr" : "1.3fr 1fr" }}>
        <div
          className="rounded-3xl p-7 riseIn"
          style={{ background: PALETTE.card, boxShadow: "0 20px 60px rgba(0,0,0,0.45)", border: `1px solid ${PALETTE.bgSoft}` }}
        >
          {phase === "intro" && (
            <div className="text-center">
              <div className="text-5xl mb-4 drift">🦖</div>
              <h1 className="text-3xl mb-2" style={{ color: PALETTE.cream }}>Labor of Love</h1>
              <p className="text-sm mb-4" style={{ color: PALETTE.lavender }}>
                Somewhere in your hospital bag is a small stuffed dinosaur, soft and a little
                lopsided, the one you've had since you were a kid. It's coming with you.
                Contractions here don't come on a steady beat — some are mild, some knock the wind
                out of you, and the gaps between them shrink as labor goes on. As you tire, staying
                on rhythm gets harder, the same way it does in the room, not just on the page.
                Along the way you'll hit moments with no clean right answer: rest or keep moving,
                grit it out or ask for relief. There's no way to lose this — it always ends the same way.
              </p>
              <button onClick={begin} className="px-8 py-3 rounded-full text-base font-semibold" style={{ background: PALETTE.coral, color: PALETTE.bg }}>
                Begin
              </button>
              <p className="text-xs mt-4" style={{ color: PALETTE.lavender }}>Tap the button — or press space — right as the marker crosses the zone.</p>
            </div>
          )}

          {(phase === "labor" || phase === "pushing") && (
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm" style={{ color: PALETTE.coral }}>{phase === "pushing" ? "Pushing" : stage.label}</span>
                <span className="flex items-center gap-2 text-xs" style={{ color: PALETTE.lavender }}>
                  <span aria-hidden="true">🦖</span>
                  {formatClock(storyMinutes)}
                </span>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1" style={{ color: PALETTE.lavender }}>
                  <span>Dilation</span><span>{dilation.toFixed(1)} / 10 cm</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: PALETTE.bgSoft }}>
                  <div className="h-full rounded-full" style={{ width: `${(dilation / 10) * 100}%`, background: PALETTE.mint, transition: "width .3s ease" }} />
                </div>
              </div>

              {choiceEvent ? (
                <div className="rounded-2xl p-5" style={{ background: PALETTE.bgSoft, border: `1px solid ${PALETTE.amber}` }}>
                  <p className="text-sm mb-4" style={{ color: PALETTE.cream }}>{choiceEvent.prompt}</p>
                  <div className="flex flex-col gap-2">
                    {choiceEvent.options.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => resolveChoice(opt)}
                        className="text-left px-4 py-3 rounded-xl text-sm"
                        style={{ background: PALETTE.card, color: PALETTE.cream, border: `1px solid ${PALETTE.bgSoft}` }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 text-center text-xs" style={{ color: PALETTE.lavender }}>
                    {inContraction ? `Contraction \u2014 ${INTENSITY_LABEL[intensity]}` : "Resting\u2026 get ready"}
                  </div>
                  <div className="relative rounded-2xl overflow-hidden mb-4" style={{ height: 64, background: PALETTE.bgSoft }}>
                    <div
                      className="absolute top-0 bottom-0 rounded-md"
                      style={{ left: `${(0.55 - windowSize) * 100}%`, width: `${windowSize * 2 * 100}%`, background: PALETTE.mint, opacity: inContraction ? 0.28 : 0.08, border: `1px solid ${PALETTE.mint}` }}
                    />
                    <div className="absolute top-0 bottom-0" style={{ left: "55%", width: 1, background: PALETTE.mint, opacity: 0.5 }} />
                    <div
                      className={!inContraction ? "glowPulse absolute top-1 bottom-1 rounded-full" : "absolute top-1 bottom-1 rounded-full"}
                      style={{
                        left: `calc(${(inContraction ? waveProgress : 0.06) * 100}% - 6px)`,
                        width: 12,
                        background: inContraction ? (intensity === "peak" ? PALETTE.rose : PALETTE.coral) : PALETTE.lavender,
                        boxShadow: inContraction ? `0 0 12px ${intensity === "peak" ? PALETTE.rose : PALETTE.coral}` : "none",
                        transition: inContraction ? "none" : "left .4s ease",
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1" style={{ color: PALETTE.lavender }}><span>Energy</span><span>{Math.round(energy)}%</span></div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: PALETTE.bgSoft }}>
                        <div className="h-full rounded-full" style={{ width: `${energy}%`, background: energyColor, transition: "width .3s ease" }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1" style={{ color: PALETTE.lavender }}><span>Coping</span><span>{Math.round(coping)}%</span></div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: PALETTE.bgSoft }}>
                        <div className="h-full rounded-full" style={{ width: `${coping}%`, background: copingColor, transition: "width .3s ease" }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleTap}
                      className="w-full py-4 rounded-2xl text-lg font-semibold transition-transform active:scale-95"
                      style={{ background: inContraction ? (intensity === "peak" ? PALETTE.rose : PALETTE.coral) : PALETTE.bgSoft, color: inContraction ? PALETTE.bg : PALETTE.lavender }}
                    >
                      {phase === "pushing" ? "Push" : "Breathe"}
                    </button>
                    <div className="h-5 text-sm" style={{ color: feedback?.good ? PALETTE.mint : PALETTE.danger }}>{feedback?.text || " "}</div>
                    {phase === "pushing" && <div className="text-xs" style={{ color: PALETTE.lavender }}>{pushHits} / 6 pushes</div>}
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "complete" && (
            <div className="text-center riseIn">
              <div className="text-5xl mb-2">👶 🦖</div>
              <h1 className="text-2xl mb-2" style={{ color: PALETTE.cream }}>Welcome, little one</h1>
              <p className="text-xs mb-2" style={{ color: PALETTE.lavender }}>The dinosaur made it too — a little worse for wear, still tucked under your arm.</p>
              <p className="text-sm mb-4" style={{ color: PALETTE.lavender }}>
                {Math.floor(elapsed / 60)}m {elapsed % 60}s of real time — representing hours of labor,
                the way it always does.
              </p>
              <p className="text-xs mb-6" style={{ color: PALETTE.lavender }}>
                Every labor moves differently — in length, intensity, and what helps. This was one version of it.
              </p>
              <div className="text-left mb-6 rounded-2xl p-4 max-h-48 overflow-y-auto journal" style={{ background: PALETTE.bgSoft }}>
                {journal.map((entry, i) => (
                  <div key={i} className="text-xs mb-2">
                    <span style={{ color: PALETTE.lavender }}>{entry.time} — </span>
                    <span style={{ color: PALETTE.cream }}>{entry.text}</span>
                  </div>
                ))}
              </div>
              <button onClick={restart} className="px-8 py-3 rounded-full text-base font-semibold" style={{ background: PALETTE.coral, color: PALETTE.bg }}>
                Play again
              </button>
            </div>
          )}
        </div>

        {(phase === "labor" || phase === "pushing") && (
          <div className="rounded-3xl p-5 riseIn" style={{ background: PALETTE.card, border: `1px solid ${PALETTE.bgSoft}` }}>
            <div className="text-xs mb-3 uppercase tracking-wide" style={{ color: PALETTE.lavender, letterSpacing: "0.08em" }}>Journal</div>
            <div className="journal overflow-y-auto pr-1" style={{ maxHeight: 420 }}>
              {journal.length === 0 && <div className="text-xs" style={{ color: PALETTE.lavender }}>Nothing recorded yet.</div>}
              {[...journal].reverse().map((entry, i) => (
                <div key={i} className="text-xs mb-3">
                  <div style={{ color: PALETTE.lavender }}>{entry.time}</div>
                  <div style={{ color: PALETTE.cream }}>{entry.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}