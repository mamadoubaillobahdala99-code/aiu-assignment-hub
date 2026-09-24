import React, { useState, useEffect, useRef, useCallback } from "react";
import { Headphones, Play, Pause, Volume2, Lock } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useStoredAudio } from "../../lib/storageFiles";

// One audio for the whole Listening test, like the real IELTS.
//
// The moment the student presses "I'm ready" is written ONCE by the
// database (listening_audio_status), with the server clock. The playing
// position is then always computed from that time, so refreshing the
// page, reopening the test or changing the computer's clock can never
// restart the recording from the beginning.
//
// Exam mode: plays straight through — no pause, no rewind.
// Practice mode: normal controls, the student may pause and replay.

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// status: "loading" | "ready" | "playing" | "checking" | "over" | "error"
export function useListeningAudio(assignmentId, enabled) {
  const [info, setInfo] = useState(null); // { startedAt, offsetMs, examMode, checkMinutes }
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((data) => {
    const serverNow = data?.server_now ? new Date(data.server_now).getTime() : Date.now();
    setNow(Date.now());
    setInfo({
      startedAt: data?.audio_started_at ? new Date(data.audio_started_at).getTime() : null,
      offsetMs: serverNow - Date.now(),
      examMode: Boolean(data?.exam_mode),
      checkMinutes: data?.check_minutes ?? 2,
    });
  }, []);

  useEffect(() => {
    if (!enabled || !assignmentId) return;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.rpc("listening_audio_status", { p_assignment_id: assignmentId, p_start: false });
      if (cancelled) return;
      if (e) setError(e.message);
      else apply(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, enabled, apply]);

  const start = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("listening_audio_status", { p_assignment_id: assignmentId, p_start: true });
    if (e) {
      setError(e.message);
      return false;
    }
    apply(data);
    return true;
  }, [assignmentId, apply]);

  const running = Boolean(info?.startedAt);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  // Seconds since the recording was started, from the server clock.
  const elapsedSec = info?.startedAt ? Math.max(0, (now + info.offsetMs - info.startedAt) / 1000) : 0;

  return {
    loading: !info && !error,
    error,
    startedAt: info?.startedAt || null,
    examMode: info?.examMode ?? false,
    checkMinutes: info?.checkMinutes ?? 2,
    elapsedSec,
    start,
  };
}

const DRIFT_SEC = 2.5;

export function ListeningAudioBar({ url, filename, audio, onTimeUp, disabled = false }) {
  const ref = useRef(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const timeUpRef = useRef(false);
  // Signed link (3 hours). If it ever stops working mid-recording, a new
  // one is fetched and the sound goes on from the same second (in exam
  // mode the server clock below puts it back in step anyway).
  const media = useStoredAudio(url, ref, (e) => setDuration(e.target.duration || 0));

  const { startedAt, examMode, checkMinutes, elapsedSec, start } = audio;
  const ended = duration > 0 && startedAt && elapsedSec >= duration;
  const checkSecLeft = ended ? Math.max(0, Math.ceil(checkMinutes * 60 - (elapsedSec - duration))) : null;

  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);

  // The recording was started earlier (refresh, other device): pick it up
  // where the server says it is, never at the beginning.
  useEffect(() => {
    const el = ref.current;
    if (!el || !startedAt || !duration || disabled) return;
    if (elapsedSec >= duration) {
      el.pause();
      return;
    }
    if (Math.abs(el.currentTime - elapsedSec) > DRIFT_SEC) el.currentTime = Math.min(elapsedSec, duration - 0.1);
    if (examMode && el.paused) el.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, duration, examMode, disabled]);

  // Exam mode: keep the sound in step with the server clock (a long
  // freeze, a sleeping computer… must not give extra listening time).
  useEffect(() => {
    if (!examMode || !startedAt || !duration || disabled) return;
    const el = ref.current;
    if (!el) return;
    if (elapsedSec >= duration) {
      if (!el.paused) el.pause();
      return;
    }
    if (Math.abs(el.currentTime - elapsedSec) > DRIFT_SEC) el.currentTime = Math.min(elapsedSec, duration - 0.1);
  }, [elapsedSec, examMode, startedAt, duration, disabled]);

  // End of the recording, then the checking time: answers go in on their own.
  useEffect(() => {
    if (!onTimeUp || timeUpRef.current || disabled) return;
    if (!ended || checkSecLeft === null) return;
    if (checkSecLeft <= 0) {
      timeUpRef.current = true;
      onTimeUp();
    }
  }, [ended, checkSecLeft, onTimeUp, disabled]);

  async function handleStart() {
    setStartError("");
    setStarting(true);
    const ok = await start();
    setStarting(false);
    if (!ok) {
      setStartError("The recording could not be started. Check your connection and try again.");
      return;
    }
    const el = ref.current;
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => setStartError("Your browser blocked the sound. Press play once to allow it."));
    }
  }

  function togglePlay() {
    const el = ref.current;
    if (!el || examMode) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  // In exam mode a pause that the student didn't ask for (a stray click,
  // the tab losing focus) is undone immediately.
  function handleNativePause() {
    const el = ref.current;
    if (examMode && startedAt && el && !el.ended && duration && elapsedSec < duration) el.play().catch(() => {});
  }

  return (
    <div className={`qe-lsa ${examMode ? "qe-lsa-exam" : ""}`}>
      <audio
        ref={ref}
        src={media.src}
        preload="auto"
        onError={media.onError}
        onLoadedMetadata={media.onLoadedMetadata}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          handleNativePause();
        }}
        onEnded={() => setPlaying(false)}
      />

      <div className="qe-lsa-head">
        <Headphones size={16} />
        <span className="qe-lsa-name">{filename || "Listening recording"}</span>
        {examMode && (
          <span className="qe-lsa-badge"><Lock size={12} /> One listening only</span>
        )}
      </div>

      {!startedAt ? (
        <div className="qe-lsa-startrow">
          <button type="button" className="btn-primary" disabled={starting || disabled || !media.src} onClick={handleStart}>
            {starting ? "Starting…" : "I'm ready — start the recording"}
          </button>
          <span className="qe-lsa-note">
            {examMode
              ? "The recording plays once, straight through. It cannot be paused or replayed, so start when you are ready."
              : "You can pause and replay this recording while you practise."}
          </span>
          {startError && <div className="field-error" style={{ width: "100%" }}>{startError}</div>}
        </div>
      ) : (
        <>
          <div className="qe-lsa-controls">
            <button type="button" className="qe-lsa-play" onClick={togglePlay} disabled={examMode || ended} title={examMode ? "The recording plays straight through" : playing ? "Pause" : "Play"}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>

            <input
              type="range"
              className="qe-lsa-seek"
              min={0}
              max={duration || 0}
              value={Math.min(examMode ? elapsedSec : currentTime, duration || 0)}
              onChange={(e) => {
                if (examMode) return;
                const el = ref.current;
                if (el) el.currentTime = Number(e.target.value);
              }}
              onMouseDown={(e) => examMode && e.preventDefault()}
              onKeyDown={(e) => examMode && e.preventDefault()}
              readOnly={examMode}
              aria-label="Position in the recording"
            />

            <span className="qe-lsa-time">{fmt(Math.min(examMode ? elapsedSec : currentTime, duration || 0))} / {fmt(duration)}</span>

            <span className="qe-lsa-volume">
              <Volume2 size={14} />
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
            </span>
          </div>

          {ended && checkMinutes > 0 && (
            <p className="qe-lsa-checknote">
              The recording has finished. You have <strong>{fmt(checkSecLeft)}</strong> to check your answers — they are then sent automatically.
            </p>
          )}
          {ended && checkMinutes === 0 && <p className="qe-lsa-checknote">The recording has finished.</p>}
        </>
      )}
    </div>
  );
}

