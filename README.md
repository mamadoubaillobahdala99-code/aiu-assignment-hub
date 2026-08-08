# AIU Assignment Hub

A single place for IELTS prep coursework at Albukhary International University — teachers post assignments (Reading, Listening, Writing, Speaking), students submit and get feedback, and timed tasks run like a real exam with an automatic countdown and auto-submit.

## Setup

1. Create a free project at [supabase.com](https://supabase.com)
2. In the Supabase SQL Editor, run `supabase-schema.sql` from this repo once
3. In `src/supabaseClient.js`, the project URL and publishable key are already set — replace them if you use a different Supabase project
4. Install and run locally:

```bash
npm install
npm run dev
```

## Deploy

Push this repo to GitHub, then import it on [vercel.com](https://vercel.com) — no extra configuration needed, Vercel auto-detects Vite.

## Features

- Real accounts (Supabase Auth) — teacher and student roles
- Teachers create classes with a join code, post assignments, and grade submissions with a band score + feedback
- Students join classes by code, submit work, and see feedback
- Optional **timed mode**: teacher sets a time limit in minutes; the countdown starts the moment the student opens the assignment and auto-submits when it reaches zero
