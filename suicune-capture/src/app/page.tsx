"use client";

import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scene } from "../components/Scene";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../lib/firebase";
import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";


type Phase =
  | "intro"
  | "idle"
  | "throwing"
  | "shaking"
  | "captured"
  | "fled";

export default function Page() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [message, setMessage] = useState("A strange presence appears...");
  const [busy, setBusy] = useState(false);

  const functions = useMemo(() => getFunctions(firebaseApp), []);
  const attemptCapture = useMemo(
    () => httpsCallable(functions, "attemptCapture"),
    [functions]
  );

  const onIntroDone = useCallback(() => {
    setPhase("idle");
    setMessage("Suicune apparaît !");
  }, []);

  const onBallHit = useCallback(() => {
  // when the ball touches Suicune
  setPhase("shaking");
  setMessage("...!");
}, []);

  const throwBall = useCallback(async () => {
  if (busy || phase !== "idle") return;

  setBusy(true);
  setPhase("throwing");
  setMessage("Lancer une Poké Ball");

  // start API request immediately
  const successPromise = attemptCapture({ encounterId: "suicune_001" })
    .then((res) => Boolean((res.data as any)?.success))
    .catch(() => false);

  // wait until the ball hits (Scene will set phase -> "shaking")
  const waitHit = async () => {
    while (true) {
      await new Promise((r) => setTimeout(r, 50));
      // read latest phase by checking DOM state is tricky;
      // easiest: we know onBallHit sets phase to "shaking"
      // so we just wait a bit longer than the ball flight time
      return;
    }
  };

  // your ball flight time is ~0.6s–0.9s depending on speed
  await new Promise((r) => setTimeout(r, 800));

  const success = await successPromise;

  // shaking time
  await new Promise((r) => setTimeout(r, 1500));

  if (success) {
    setPhase("captured");
    setMessage("Bravo ! Suicune a été capturé !");
  } else {
    setPhase("fled");
    setMessage("Oh non ! Suicune s’est enfui !");
  }

  setBusy(false);
}, [attemptCapture, busy, phase]);

  const reset = useCallback(() => {
    setPhase("intro");
    setMessage("Une présence étrange apparaît...");
    setBusy(false);
  }, []);

  return (
    <div className="min-h-screen w-full bg-black text-white overflow-hidden">
      <div className="absolute inset-0">
        <Scene phase={phase} onIntroDone={onIntroDone} onBallHit={onBallHit} />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-end p-6 pointer-events-none">
        <div className="w-full max-w-xl rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-4 shadow-xl pointer-events-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-white/70">Rencontre</div>

              <AnimatePresence mode="popLayout">
                <motion.div
                  key={message}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="text-lg font-semibold"
                >
                  {message}
                </motion.div>
              </AnimatePresence>

              <div className="mt-1 text-xs text-white/50">
                Taux de capture: <span className="font-semibold">0.5%</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={throwBall}
                disabled={busy || phase !== "idle"}
                className="rounded-xl px-4 py-2 bg-white text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Tu lances une Poké Ball !
              </button>

              <button
                onClick={reset}
                className="rounded-xl px-3 py-2 bg-white/10 border border-white/15 text-white/90 hover:bg-white/15"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-white/60">
            Hasbi
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}