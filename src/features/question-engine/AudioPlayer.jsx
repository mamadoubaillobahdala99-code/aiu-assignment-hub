import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Headphones, GripHorizontal } from "lucide-react";

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// KNOWN LIMITATION, stated honestly, same spirit as the exam timer: the
// "times listened" counter below is visual only, kept in React state. A
// page refresh currently resets it — it isn't backed by a server-side
// record yet. Fine for this first working version of Listening.
export function AudioPlayer({ url, filename, maxPlays }) {
  const audioRef = useRef(null);
  const panelRef = useRef(null);
  const [playsUsed, setPlaysUsed] = useState(0);
  const [active, setActive] = useState(false); // true only while a play session is in progress
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // null = use the default CSS position (top-right). Once the student
  // drags it, we switch to explicit pixel coordinates so it stays put.
  const [pos, setPos] = useState(null);
  const dragRef = useRef(null);

  const isLimited = maxPlays != null;
  const playsRemaining = isLimited ? Math.max(0, maxPlays - playsUsed) : null;
  const exhausted = isLimited && playsRemaining === 0 && !playing;
  // Locked for the whole duration of each play on a limited Part — a real
  // exam tape never lets you pause or rewind, not just on the first listen.
  const locked = isLimited && active;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  // --- Dragging, with the panel always kept fully inside the viewport ---
  function clamp(x, y) {
    const el = panelRef.current;
    const w = el ? el.offsetWidth : 300;
    const h = el ? el.offsetHeight : 160;
    const maxX = Math.max(0, window.innerWidth - w - 8);
    const maxY = Math.max(0, window.innerHeight - h - 8);
    return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) };
  }

  function handleDragStart(e) {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
  }
  function handleDragMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clamp(dragRef.current.origX + dx, dragRef.current.origY + dy));
  }
  function handleDragEnd() {
    dragRef.current = null;
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
  }
  // If the window is resized after a drag, keep the panel on-screen
  // instead of letting it get stranded off the visible area.
  useEffect(() => {
    function onResize() {
      setPos((prev) => (prev ? clamp(prev.x, prev.y) : prev));
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, []);

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isLimited && exhausted) return; // no more plays left on a limited Part
    if (!playing) {
      // A fresh listen — every time playback starts from a stopped state,
      // not only the very first time.
      setPlaysUsed((n) => n + 1);
      if (isLimited) setActive(true);
    }
    audio.play();
  }

  function handlePauseClick() {
    const audio = audioRef.current;
    if (!audio) return;
    if (locked) return; // no manual pause once a limited Part has started
    audio.pause();
  }

  // If the browser fires a pause on a locked track before it actually
  // ended (a stray click, a keyboard shortcut, losing focus), resume
  // right away — same technique already proven in the old Listening
  // player, just applied to this custom UI instead of native controls.
  function handleNativePause() {
    const audio = audioRef.current;
    if (locked && audio && !audio.ended) audio.play();
  }

  function handleSeekAttempt(e) {
    if (locked) e.preventDefault();
  }

  const style = pos ? { top: pos.y, left: pos.x, right: "auto" } : undefined;

  return (
    <div className="qe-audio-player" ref={panelRef} style={style}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); handleNativePause(); }}
        onEnded={() => { setPlaying(false); setActive(false); }}
      />

      <div className="qe-audio-drag-handle" onMouseDown={handleDragStart}>
        <GripHorizontal size={14} />
        <Headphones size={16} />
        <span className="qe-audio-filename">{filename || "Audio"}</span>
      </div>

      {isLimited && (
        <div className="qe-audio-plays-count">Times listened: {playsUsed} / {maxPlays}</div>
      )}

      <div className="qe-audio-controls">
        <button
          type="button"
          className="qe-audio-play-btn"
          onClick={playing ? handlePauseClick : handlePlay}
          disabled={exhausted}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <input
          type="range"
          className="qe-audio-seek"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(e) => {
            if (locked) return;
            const audio = audioRef.current;
            if (audio) audio.currentTime = Number(e.target.value);
          }}
          onMouseDown={handleSeekAttempt}
          onKeyDown={handleSeekAttempt}
        />

        <span className="qe-audio-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>

      <div className="qe-audio-volume">
        <Volume2 size={14} />
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </div>

      {locked && (
        <p className="qe-audio-locked-note">Playing straight through — no pausing or rewinding, just like the real test.</p>
      )}
      {exhausted && (
        <p className="qe-audio-locked-note">You've used all your plays for this part.</p>
      )}
    </div>
  );
}
