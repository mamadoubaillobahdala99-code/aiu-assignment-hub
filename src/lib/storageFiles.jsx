import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

// Files of the site (audio, images, Speaking documents) are shown through
// SIGNED links: a link that works for 3 hours only, and that the storage
// gives only to someone allowed to read the file (the rule
// "readers read the files of what they can read", sql/23).
//
// What the database keeps does not change: it is still the file's
// "public" address, used here only as the file's NAME. Every place that
// shows a file turns it into a signed link first, through this module.
//
// Anything that is not a file of our own storage (a "blob:" preview in
// the importer, a link to another site) is passed through untouched.

export const FILES_BUCKET = "assignment-files";
export const SIGNED_LINK_SECONDS = 3 * 60 * 60; // 3 hours
const RENEW_BEFORE_MS = 10 * 60 * 1000; // a link with less than 10 min left is renewed
const FOLDERS = ["images", "audio", "speaking"];

function bucket() {
  return supabase.storage.from(FILES_BUCKET);
}

// ".../storage/v1/object/public/assignment-files/"
function publicPrefix() {
  return bucket().getPublicUrl("").data.publicUrl.replace(/\/*$/, "/");
}
// ".../storage/v1/object/sign/assignment-files/"
function signedPrefix() {
  return publicPrefix().replace("/object/public/", "/object/sign/");
}

// The value saved in the database for a file just uploaded to `path`.
// It is the file's name, not a working link: display always goes
// through signedUrl() / useSignedUrl().
export function fileRef(path) {
  return bucket().getPublicUrl(path).data.publicUrl;
}

// The storage path ("audio/<teacher>/x.mp3") of one of our files, from a
// saved value (a public address, an old signed address, or a bare path).
// null when the value is not one of our files.
export function storagePath(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  let rest = null;
  for (const prefix of [publicPrefix(), signedPrefix()]) {
    if (s.startsWith(prefix)) {
      rest = s.slice(prefix.length);
      break;
    }
  }
  if (rest === null && /^[a-z]+\//.test(s) && !s.includes("://")) rest = s;
  if (rest === null) return null;
  rest = rest.split(/[?#]/)[0];
  try {
    rest = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (!rest || rest.startsWith("/") || rest.includes("..") || rest.includes("\\")) return null;
  if (!FOLDERS.includes(rest.split("/")[0])) return null;
  return rest;
}

// path -> { url, expiresAt } or { promise }
const cache = new Map();

// Links belong to the person who asked for them: forget them all when
// someone signs out or another account signs in on this browser.
let lastUserId;
supabase.auth.onAuthStateChange((_event, session) => {
  const id = session?.user?.id || null;
  if (lastUserId !== undefined && id !== lastUserId) cache.clear();
  lastUserId = id;
});

function cachedUrl(path) {
  const entry = cache.get(path);
  if (entry?.url && entry.expiresAt - Date.now() > RENEW_BEFORE_MS) return entry.url;
  return null;
}

// Returns the link to put in src / href. force: ask for a new one even if
// the one we have still looks valid (used after the browser failed to
// load it).
export async function signedUrl(value, { force = false } = {}) {
  const path = storagePath(value);
  if (!path) return value || "";
  if (!force) {
    const hit = cachedUrl(path);
    if (hit) return hit;
    const pending = cache.get(path)?.promise;
    if (pending) return pending;
  }
  const promise = bucket()
    .createSignedUrl(path, SIGNED_LINK_SECONDS)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        cache.delete(path);
        // Not allowed, or no connection. While the storage is still public
        // the old address keeps things working; once it is private this
        // address simply shows nothing — which is right for someone who
        // may not read the file.
        return fileRef(path);
      }
      cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_LINK_SECONDS * 1000 });
      return data.signedUrl;
    })
    .catch(() => {
      cache.delete(path);
      return fileRef(path);
    });
  cache.set(path, { promise });
  return promise;
}

// What can be shown right now, before any network call: a link we
// already hold, or the value itself when it is not one of our files.
function immediate(value) {
  const path = storagePath(value);
  if (!path) return value || "";
  return cachedUrl(path) || "";
}

// React: [link, renew]. link is "" while the signed link is on its way.
// renew() asks for a fresh link (call it when the browser could not load
// the current one — typically because it expired).
export function useSignedUrl(value) {
  const [state, setState] = useState(() => ({ value, url: immediate(value) }));

  useEffect(() => {
    let alive = true;
    const now = immediate(value);
    setState((s) => (s.value === value && s.url === now ? s : { value, url: now }));
    if (storagePath(value) && !now) {
      signedUrl(value).then((url) => {
        if (alive) setState({ value, url });
      });
    }
    return () => {
      alive = false;
    };
  }, [value]);

  const renew = useCallback(
    () =>
      signedUrl(value, { force: true }).then((url) => {
        setState({ value, url });
        return url;
      }),
    [value]
  );

  const url = state.value === value ? state.url : immediate(value);
  return [url, renew];
}

// <img> for a stored picture. If the link fails (expired), a fresh one is
// asked for once; after that the browser's own broken-image is shown.
export function StoredImg({ src, onError, ...rest }) {
  const [url, renew] = useSignedUrl(src);
  const retried = useRef(false);
  useEffect(() => {
    retried.current = false;
  }, [src]);
  if (!url) return null;
  return (
    <img
      {...rest}
      src={url}
      onError={(e) => {
        if (!retried.current && storagePath(src)) {
          retried.current = true;
          renew();
        }
        onError?.(e);
      }}
    />
  );
}

// For <audio>: when the link stops working in the middle of a listening
// (it expired), get a new one and carry on from the same second.
// Returns { src, onError, onLoadedMetadata } to spread on the <audio>;
// pass your own onLoadedMetadata as `then`.
export function useStoredAudio(value, audioRef, then) {
  const [url, renew] = useSignedUrl(value);
  const resumeRef = useRef(null);
  const retriesRef = useRef(0);
  useEffect(() => {
    retriesRef.current = 0;
    resumeRef.current = null;
  }, [value]);

  const onError = useCallback(() => {
    const el = audioRef.current;
    if (!el || !storagePath(value) || retriesRef.current >= 2) return;
    retriesRef.current += 1;
    resumeRef.current = { time: el.currentTime || 0, play: !el.paused };
    renew();
  }, [value, audioRef, renew]);

  const onLoadedMetadata = useCallback(
    (e) => {
      const el = e.target;
      const resume = resumeRef.current;
      resumeRef.current = null;
      if (resume) {
        if (resume.time > 0) el.currentTime = Math.min(resume.time, (el.duration || resume.time) - 0.1);
        if (resume.play) el.play().catch(() => {});
      } else {
        retriesRef.current = 0;
      }
      then?.(e);
    },
    [then]
  );

  return { src: url || undefined, onError, onLoadedMetadata };
}

// <a> towards a stored file (open / download). The link is signed at the
// moment it is shown; it stays valid 3 hours.
export function StoredLink({ href, children, ...rest }) {
  const [url] = useSignedUrl(href);
  return (
    <a {...rest} href={url || undefined} aria-disabled={url ? undefined : "true"}>
      {children}
    </a>
  );
}
