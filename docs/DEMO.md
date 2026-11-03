# Doodle Class: 3-Minute Judge Demo Script

> **The Pitch:** "A teacher for every child in Bharat: in their language, from their own textbook, in a voice they trust."
>
> **Live URL:** https://doodle-class.vercel.app  
> **Target Duration:** Exactly 3 minutes (180 seconds).  
> **Pre-demo prep:** Visit `/profile`, click **"Load demo data"** at the bottom so the 6-day streak, 12 lessons, 32 stars, and "Nani" family voice are loaded.

---

## Demo Timeline (0:00 – 3:00)

```
0:00 ─── 0:15 ── Pitch & Setup (Home)
0:15 ─── 0:45 ── Step 1: Learn from my book (Class 10 Science, Hindi voice + English board)
0:45 ─── 1:05 ── Step 2: Circle what you don't understand (Handwriting pen)
1:05 ─── 1:30 ── Step 3: Snap a Hindi textbook page (Sarvam Vision OCR)
1:30 ─── 1:55 ── Step 4: Family voice ("Nani" via Instant Voice Cloning)
1:55 ─── 2:20 ── Step 5: Teach it back (Misconception detection)
2:20 ─── 2:40 ── Step 6: Study notebook audio overview (Conversational podcast)
2:40 ─── 2:50 ── Step 7: Classroom live quiz (Zero-login QR code)
2:50 ─── 3:00 ── Step 8: Parent voice report (WhatsApp voice note in Marathi)
```

---

### 0:00 – 0:15 | The Pitch & Home Screen
- **Spoken:**  
  *"Millions of students in India study in vernacular mediums or navigate English-medium books without an English-speaking adult at home. Doodle Class gives every child a personalized cartoon teacher that hand-writes lessons on a whiteboard, speaks their mother tongue, and grounds everything directly in their own NCERT textbook."*
- **On Screen:**  
  Show the home page (`/`) with the sketchbook paper texture, marigold toran, and the 4 cartoon teachers: Tara (Maths owl), Chintu (Science robot), Mishri (English cat), and Gajju (History elephant).
- **Action:** Click **"Browse NCERT Books"** or navigate to `/study`.

---

### 0:15 – 0:45 | Step 1: Learn From My Book (NCERT Deep Engine)
- **Spoken:**  
  *"Instead of generic AI chat, we ground lessons in official NCERT books. Let's pick Class 10 Science, Chapter 1 'Chemical Reactions and Equations', Section 1.2 'Types of Chemical Reactions'. We select Hindi narration with an English board — the exact bilingual reality of millions of Indian classrooms."*
- **Action:**  
  Select **Class 10 → Science → Chemical Reactions → 1.2 Types of Chemical Reactions**. Set voice to **Hindi (`hi-IN`)** and medium to **English**.
- **What happens on screen:**  
  1. The textbook coverage outline appears instantly on the left with every sub-concept and worked activity.
  2. The teacher starts speaking in natural Hindi (`Bulbul v4`) while sketching step 1 on the whiteboard with clean KaTeX chemical equations and rough.js doodles.
  3. The outline checklist items tick off in real time as the teacher covers each point.
- **Backup Plan (if network is slow):**  
  Cached chapters start in under 1 ms from the edge store. If the connection drops completely, click the **"Use Sample Lesson"** fallback pill which immediately renders pre-cached whiteboard steps.

---

### 0:45 – 1:05 | Step 2: Circle What You Don't Understand
- **Spoken:**  
  *"Kids don't type prompts. When something is confusing, they just pick up the pen and circle it on the board."*
- **Action:**  
  Click the whiteboard **Pen** tool. Draw a quick rough circle around a reaction formula on the board (e.g. `2H2 + O2 -> 2H2O`).
- **What happens on screen:**  
  The board detects the circled region. The teacher pauses narration, highlights the equation with a marker scribble, and explains the balancing principle with a fresh chalk diagram.
- **Backup Plan (if network is slow):**  
  Click the **"I have a doubt"** hand-raise button and tap the pre-filled doubt chip *"Why do we need 2 molecules of water?"* to insert the remedial step locally.

---

### 1:05 – 1:30 | Step 3: Snap a Page (Sarvam Vision OCR)
- **Spoken:**  
  *"What if the student has a physical textbook in Hindi? We just snap a picture."*
- **Action:**  
  Navigate to `/snap`. Click the sample card **"Class 10 Hindi Textbook Page"** (or upload a page photo).
- **What happens on screen:**  
  `Sarvam Vision` extracts the Devanagari Hindi text, balances the chemical reaction in the photo, and converts the page into a multi-step animated whiteboard lesson in under 3 seconds.
- **Backup Plan (if network is slow):**  
  Use the pre-extracted sample button on `/snap` which loads the cached Vision OCR JSON instantly without re-uploading the image.

---

### 1:30 – 1:55 | Step 4: Family Voice ("Nani")
- **Spoken:**  
  *"Children learn best from a voice they love and trust. With Sarvam's Instant Voice Cloning, any family member can narrate the lessons."*
- **Action:**  
  Navigate to `/family-voice`. Show **"Nani"** (grandmother) in the saved voices list. Tap **"Listen sample"** (plays a 10s clip), then click **"Set as Active Voice"**. Return to the lesson.
- **What happens on screen:**  
  The cartoon teacher now speaks with Nani's exact voice, explaining scientific concepts warmly in Hindi!
- **Backup Plan (if network is slow):**  
  The demo data pre-seeds a cached cloned audio snippet. If the live cloning API takes >5s, click the demo playback button in the voice card.

---

### 1:55 – 2:20 | Step 5: Teach It Back (Misconception Detection)
- **Spoken:**  
  *"True mastery happens when the child teaches the concept back. The teacher listens via Saaras speech-to-text and checks for conceptual bugs."*
- **Action:**  
  At the end of the lesson, click **"Teach it back"**. Click the microphone icon or the sample explanation:  
  *"To balance the equation, I just change H2O to H3O because I need 3 oxygens."*
- **What happens on screen:**  
  1. `Saaras v4` transcribes the voice input with Indian code-mixing support.
  2. `sarvam-105b` diagnoses the subtle error: *Changing molecular subscripts instead of stoichiometric coefficients*.
  3. The teacher draws a corrective doodle on the whiteboard showing that H3O changes the molecule into hydronium instead of water, and logs this misconception into the student's personal memory coach.
- **Backup Plan (if network is slow):**  
  Click the pre-set chip *"Changed the subscript"* to run the teach-back handler with pre-cached diagnostic feedback.

---

### 2:20 – 2:40 | Step 6: Study Notebook & Audio Overview
- **Spoken:**  
  *"For revision, our Study Notebook organizes all textbook sources with cited Q&A and a conversational audio overview."*
- **Action:**  
  Navigate to `/notebooks` → open **"Chemical Reactions"**. Tap **"Audio Overview"**.
- **What happens on screen:**  
  A two-host conversational podcast (in the style of NotebookLM, powered by Sarvam Bulbul and 105b) starts playing, discussing how rust forms and why balancing equations obeys the Law of Conservation of Mass.
- **Backup Plan (if network is slow):**  
  The notebook stores pre-generated audio chunks in the local browser IndexedDB; playback begins instantly offline.

---

### 2:40 – 2:50 | Step 7: Classroom Live Quiz (Zero-Login QR)
- **Spoken:**  
  *"In a government school classroom, a single phone or projector can run a live interactive quiz for the whole room."*
- **Action:**  
  Navigate to `/class`. Click **"Start Live Room"**.
- **What happens on screen:**  
  A giant hand-drawn QR code appears on the whiteboard. Tell the judge: *"Scan this QR code on your phone right now!"* When scanned, it opens `/join/:code` with zero authentication, allowing students to submit answers and see their names on the live whiteboard podium.
- **Backup Plan (if network is slow):**  
  The room page features a **"Simulate 3 Students"** toggle that immediately populates the live leaderboard with realistic student responses.

---

### 2:50 – 3:00 | Step 8: Parent Voice Report
- **Spoken:**  
  *"Finally, parents receive a weekly voice note in the language they speak at home — no literacy barrier."*
- **Action:**  
  Navigate to `/parent`. Select **Marathi (`mr-IN`)**. Tap **Play**.
- **What happens on screen:**  
  A friendly voice note plays:  
  *"Namaskar! Asha has finished 12 lessons and maintained a 6-day streak. She mastered chemical equations today..."*  
  A green **"Share on WhatsApp"** button allows one-tap sharing of the audio note directly to parents' family groups.
- **Backup Plan (if network is slow):**  
  Click **"See an example"** to play the bundled pre-recorded parent voice memo.

---

## Quick Judge Summary Sheet

| Feature | Sarvam Model Used | Latency / Metric |
|---|---|---|
| **Whiteboard Lesson Streaming** | `sarvam-105b` | ~2.4s TTFT, ~1ms cached |
| **Teacher & Parent Speech** | `Bulbul v4-flash` / `Bulbul v3` | Sentence-pipelined MP3 |
| **Voice Doubts & Teach-back** | `Saaras v4` | Code-mixed Indian STT |
| **Textbook Page OCR** | `Sarvam Vision` | Multi-script Hindi/English OCR |
| **English-Medium Mode** | `Mayura` / `Sarvam-Translate` | 11 language pairs |
| **Family Voice ("Nani")** | `Instant Voice Cloning` | 8–15s voice sample |
| **Script Orthography** | `Transliterate` | Accurate regional scripts |
| **Kid Safety Moderation** | `Sarvam Safety Guardrails` | 26/26 syllabus topics verified |
