import { useState, useEffect, useRef, useCallback } from "react";

const PALETTE = {
  bg: "#1F1B2E",
  bgSoft: "#2A2440",
  card: "#282139",
  coral: "#F6A192",
  coralDim: "#7A5850",
  mint: "#8FD9A8",
  mintDim: "#3E5A48",
  cream: "#F5EFE6",
  lavender: "#9C93B2",
  danger: "#E58C7C",
};

const STAGES = [
  { key: "early", label: "Early Labor", from: 0, to: 3, contraction: 3200, rest: 3600, window: 0.42 },
  { key: "active", label: "Active Labor", from: 3, to: 6, contraction: 2600, rest: 2400, window: 0.34 },
  { key: "transition", label: "Transition", from: 6, to: 10, contraction: 2200, rest: 1500, window: 0.26 },
];

function stageFor(cm) {
  return STAGES.find((s) => cm >= s.from && cm < s.to) || STAGES[STAGES.length - 1];
}

export default function LaborGame() {
  const [phase, setPhase] = useState("intro"); // intro | labor | pushing | complete
  const [dilation, setDilation] = useState(0);
  const [tension, setTension] = useState(30); // 0-100, lower is calmer
  const [inContraction, setInContraction] = useState(false);
  const [waveProgress, setWaveProgress] = useState(0); // 0-1 through current phase segment
  const [feedback, setFeedback] = useState(null); // {text, good}
  const [hitThisContraction, setHitThisContraction] = useState(false);
  const [breathCount, setBreathCount] = useState(0);
  const [pushCount, setPushCount] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const segmentStart = useRef(null);
  const segmentDuration = useRef(null);
  const rafRef = useRef(null);
  const feedbackTimeout = useRef(null);

  const stage = stageFor(dilation);

  // Main animation loop driving the contraction/rest wave
  useEffect(() => {
    if (phase !== "labor" && phase !== "pushing") return;

    function tick(now) {
      if (segmentStart.current === null) {
        segmentStart.current = now;
        segmentDuration.current = inContraction ? stage.contraction : stage.rest;
      }
      const elapsedSeg = now - segmentStart.current;
      const prog = Math.min(1, elapsedSeg / segmentDuration.current);
      setWaveProgress(prog);

      if (prog >= 1) {
        if (inContraction) {
          // contraction ending
          if (!hitThisContraction) {
            setTension((t) => Math.min(100, t + 10));
          }
          setInContraction(false);
          setHitThisContraction(false);
        } else {
          // rest ending -> new contraction begins
          setInContraction(true);
        }
        // force full recompute (start + duration) on the next tick
        segmentStart.current = null;
        segmentDuration.current = null;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, inContraction, stage.key]);

  // timer
  useEffect(() => {
    if (phase === "intro" || phase === "complete") return;
    const id = setInterval(() => {
      if (startTime) setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [phase, startTime]);

  // Advance dilation to pushing stage
  useEffect(() => {
    if (dilation >= 10 && phase === "labor") {
      setPhase("pushing");
      setTension(20);
    }
  }, [dilation, phase]);

  const showFeedback = useCallback((text, good) => {
    setFeedback({ text, good });
    clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 700);
  }, []);

  function handleBreathe() {
    if (phase !== "labor" || !inContraction || hitThisContraction) return;
    const dist = Math.abs(waveProgress - 0.55);
    const win = stage.window;
    if (dist <= win) {
      const goodness = 1 - dist / win;
      setTension((t) => Math.max(0, t - 8 - goodness * 10));
      setDilation((d) => Math.min(10, d + 0.55 + goodness * 0.4));
      setBreathCount((c) => c + 1);
      setHitThisContraction(true);
      showFeedback(goodness > 0.7 ? "Steady breath ✓" : "Breathing through it", true);
    } else {
      setTension((t) => Math.min(100, t + 6));
      showFeedback("Try to time your breath", false);
    }
  }

  function handlePush() {
    if (phase !== "pushing" || !inContraction || hitThisContraction) return;
    const dist = Math.abs(waveProgress - 0.55);
    const win = stage.window;
    if (dist <= win) {
      const goodness = 1 - dist / win;
      setTension((t) => Math.max(0, t - 6 - goodness * 8));
      setPushCount((c) => c + 1);
      setHitThisContraction(true);
      const needed = 5;
      if (pushCount + 1 >= needed) {
        setTimeout(() => setPhase("complete"), 500);
      }
      showFeedback(goodness > 0.7 ? "Strong push ✓" : "Good push", true);
    } else {
      setTension((t) => Math.min(100, t + 8));
      showFeedback("Wait for the peak", false);
    }
  }

  function begin() {
    setPhase("labor");
    setDilation(0);
    setTension(30);
    setInContraction(false);
    setWaveProgress(0);
    setBreathCount(0);
    setPushCount(0);
    setStartTime(Date.now());
    setElapsed(0);
    segmentStart.current = null;
  }

  function restart() {
    setPhase("intro");
  }

  useEffect(() => {
    function onKey(e) {
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "labor") handleBreathe();
        if (phase === "pushing") handlePush();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const waveY = inContraction
    ? Math.sin(waveProgress * Math.PI) // rises then falls, 0->1->0
    : 0.08 + 0.04 * Math.sin(Date.now() / 600);

  const tensionColor =
    tension > 70 ? PALETTE.danger : tension > 40 ? PALETTE.coral : PALETTE.mint;

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-6"
      style={{ background: `radial-gradient(circle at 50% -10%, ${PALETTE.bgSoft}, ${PALETTE.bg})`, fontFamily: "Georgia, 'Iowan Old Style', serif" }}
    >
      <style>{`
        @keyframes riseIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: translateY(0);} }
        @keyframes glowPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        @keyframes drift { 0% { transform: translateY(0);} 50% { transform: translateY(-6px);} 100% { transform: translateY(0);} }
        .riseIn { animation: riseIn .5s ease-out; }
        .glowPulse { animation: glowPulse 2.4s ease-in-out infinite; }
        .drift { animation: drift 4s ease-in-out infinite; }
        button:focus-visible { outline: 2px solid ${PALETTE.mint}; outline-offset: 3px; }
      `}</style>

      <div
        className="w-full max-w-md rounded-3xl p-8 riseIn"
        style={{ background: PALETTE.card, boxShadow: "0 20px 60px rgba(0,0,0,0.45)", border: `1px solid ${PALETTE.bgSoft}` }}
      >
        {phase === "intro" && (
          <div className="text-center">
            <div className="text-5xl mb-4 drift">🌙</div>
            <h1 className="text-3xl mb-2" style={{ color: PALETTE.cream, letterSpacing: "0.02em" }}>
              Labor of Love
            </h1>
            <p className="text-sm mb-8" style={{ color: PALETTE.lavender, fontFamily: "Georgia, serif" }}>
              Breathe through each contraction at the right moment to stay calm and help
              labor progress. When it's time, push with the same steady timing.
            </p>
            <button
              onClick={begin}
              className="px-8 py-3 rounded-full text-base font-semibold"
              style={{ background: PALETTE.coral, color: PALETTE.bg }}
            >
              Begin
            </button>
            <p className="text-xs mt-4" style={{ color: PALETTE.lavender }}>
              Tap the button — or press space — right as the wave crests.
            </p>
          </div>
        )}

        {(phase === "labor" || phase === "pushing") && (
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm" style={{ color: PALETTE.coral }}>
                {phase === "pushing" ? "Pushing" : stage.label}
              </span>
              <span className="text-xs" style={{ color: PALETTE.lavender }}>
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </span>
            </div>

            {/* Dilation progress */}
            <div className="mb-5">
              <div className="flex justify-between text-xs mb-1" style={{ color: PALETTE.lavender }}>
                <span>Dilation</span>
                <span>{dilation.toFixed(1)} / 10 cm</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: PALETTE.bgSoft }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(dilation / 10) * 100}%`, background: PALETTE.mint, transition: "width .3s ease" }}
                />
              </div>
            </div>

            {/* Timing meter: cursor travels left to right, tap when it's inside the mint zone */}
            <div className="mb-5">
              <div className="text-center text-xs mb-2" style={{ color: PALETTE.lavender }}>
                {inContraction ? "Contraction — tap when the marker is in the zone" : "Resting… get ready"}
              </div>
              <div
                className="relative rounded-2xl overflow-hidden"
                style={{ height: 64, background: PALETTE.bgSoft }}
              >
                {/* target zone */}
                <div
                  className="absolute top-0 bottom-0 rounded-md"
                  style={{
                    left: `${(0.55 - stage.window) * 100}%`,
                    width: `${stage.window * 2 * 100}%`,
                    background: PALETTE.mint,
                    opacity: inContraction ? 0.28 : 0.1,
                    border: `1px solid ${PALETTE.mint}`,
                  }}
                />
                {/* center hit line for reference */}
                <div
                  className="absolute top-0 bottom-0"
                  style={{ left: "55%", width: 1, background: PALETTE.mint, opacity: 0.5 }}
                />
                {/* moving cursor */}
                <div
                  className={!inContraction ? "glowPulse absolute top-1 bottom-1 rounded-full" : "absolute top-1 bottom-1 rounded-full"}
                  style={{
                    left: `calc(${(inContraction ? waveProgress : 0.06) * 100}% - 6px)`,
                    width: 12,
                    background: inContraction ? PALETTE.coral : PALETTE.lavender,
                    boxShadow: inContraction ? `0 0 12px ${PALETTE.coral}` : "none",
                    transition: inContraction ? "none" : "left .4s ease",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] mt-1" style={{ color: PALETTE.lavender }}>
                <span>start</span>
                <span>peak</span>
                <span>end</span>
              </div>
            </div>

            {/* Tension meter */}
            <div className="mb-6">
              <div className="flex justify-between text-xs mb-1" style={{ color: PALETTE.lavender }}>
                <span>Tension</span>
                <span>{Math.round(tension)}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: PALETTE.bgSoft }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${tension}%`, background: tensionColor, transition: "width .3s ease, background .3s ease" }}
                />
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={phase === "pushing" ? handlePush : handleBreathe}
                className="w-full py-4 rounded-2xl text-lg font-semibold transition-transform active:scale-95"
                style={{
                  background: inContraction ? PALETTE.coral : PALETTE.bgSoft,
                  color: inContraction ? PALETTE.bg : PALETTE.lavender,
                }}
              >
                {phase === "pushing" ? "Push" : "Breathe"}
              </button>
              <div className="h-5 text-sm" style={{ color: feedback?.good ? PALETTE.mint : PALETTE.danger }}>
                {feedback?.text || " "}
              </div>
              {phase === "pushing" && (
                <div className="text-xs" style={{ color: PALETTE.lavender }}>
                  {pushCount} / 5 pushes
                </div>
              )}
            </div>

            {tension >= 100 && (
              <p className="text-xs text-center mt-4" style={{ color: PALETTE.danger }}>
                Tension is high — a missed breath just makes the next one matter more. Keep going.
              </p>
            )}
          </div>
        )}

        {phase === "complete" && (
          <div className="text-center riseIn">
            <div className="text-5xl mb-4">👶</div>
            <h1 className="text-2xl mb-2" style={{ color: PALETTE.cream }}>
              Welcome, little one
            </h1>
            <p className="text-sm mb-6" style={{ color: PALETTE.lavender }}>
              Born after {Math.floor(elapsed / 60)}m {elapsed % 60}s of labor.
            </p>
            <div className="flex justify-center gap-8 mb-8 text-sm" style={{ color: PALETTE.mint }}>
              <div>
                <div className="text-2xl">{breathCount}</div>
                <div style={{ color: PALETTE.lavender }}>breaths timed</div>
              </div>
              <div>
                <div className="text-2xl">{pushCount}</div>
                <div style={{ color: PALETTE.lavender }}>pushes</div>
              </div>
            </div>
            <button
              onClick={restart}
              className="px-8 py-3 rounded-full text-base font-semibold"
              style={{ background: PALETTE.coral, color: PALETTE.bg }}
            >
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}