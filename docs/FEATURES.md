# Feature checklist

Tick with `[x]` and save, then tell Claude "go". Claude turns each ticked item into a work order for Antigravity (gemini-3.8-flash-high) and checks the result. Items without a tick are skipped.

Effort per item: **S** = under 30 min, **M** = 30–90 min, **L** = over 90 min. ⚠ = risky for the demo.

## A. Fix what we already have (known issues)
- [ ] A1 S: Pen toolbar covers the top-right of the board on phones. Move it to a corner tab.
- [ ] A2 S: While pen mode is on, one finger can't scroll the board. Add two-finger scroll, or auto-exit after a circle.
- [ ] A3 S: Remove the "Hello friends" greetings that appear mid-way through deep lessons (filter them on the server).
- [ ] A4 S: Short bold words on the board sometimes translate wrongly (e.g. chlorophyll became "green vegetable"). Translate whole lines and re-apply the bold afterwards.
- [ ] A5 S: Leader lines still cross the drawing in the atom, tooth and water-cycle diagrams. Fix their anchor positions.
- [ ] A6 S: Teach-back sometimes answers in Roman-script Hindi instead of Devanagari. Run a script check, then transliterate with Sarvam.
- [ ] A7 S: A brand-new quiz takes about 19 s. Show a fun "Tara is writing your quiz…" loader with progress.
- [ ] A8 S: The first step of a deep lesson takes about 11 s. Show "Reading your book… (page doodles)" with the outline appearing as soon as it's planned.
- [ ] A9 S: Talk mode cuts in on the teacher's own voice through laptop speakers. Add an echo-safe threshold and a headphones hint.
- [ ] A10 S: Hindi "और" leaks into English board lines in English-medium mode. Clean up board text on the server.

## B. Learn deeply (NCERT)
- [ ] B1 M: "Continue where I left off": remember the chapter, section and step for each child.
- [ ] B2 M: Chapter progress map: each section shows not started, learning, or mastered, with stars.
- [ ] B3 M: Book page viewer: an "Open this page in the NCERT PDF" button opens the original page side by side.
- [ ] B4 M: End-of-section "Exercises" mode: the teacher works through the book's own exercise questions with hints.
- [ ] B5 M: Activity mode: a guided home experiment from the book, with a materials checklist and a safety note.
- [ ] B6 S: Speed control (0.75× / 1× / 1.25×) and a "Skip to examples" button for revision.
- [ ] B7 M: Revision notes: a one-page summary of the section in the board language that you can download or print as a PDF.
- [ ] B8 M: Flashcards made from the outline, fed into the existing spaced repetition.
- [ ] B9 L: Hindi-medium NCERT books in the catalogue (the "h" codes), with their own text.
- [ ] B10 M: Board-exam mode for classes 9–10: past-paper style questions grounded in the chapter.

## C. Tests and practice
- [ ] C1 M: Chapter test: 10 questions across all sections, with a per-section score breakdown.
- [ ] C2 M: Adaptive practice: wrong answers lead to easier follow-ups, right answers to harder ones.
- [ ] C3 M: Show your working: the kid writes a maths solution with the pen, Sarvam Vision reads it, and the teacher checks each line. ⚠
- [ ] C4 S: A timer challenge mode for quick revision.
- [ ] C5 M: "Explain your answer" voice questions graded by AI (teach-back inside quizzes).
- [ ] C6 S: A results page that lists weak topics with "Re-learn this" links.

## D. Voice and languages
- [ ] D1 M: Fully hands-free voice lesson: say "next", "repeat", "slower" or "explain again".
- [ ] D2 S: Read-along: highlight each word in the speech bubble as it's spoken.
- [ ] D3 M: Dictation practice for English and Hindi spelling: the teacher speaks and the kid writes with the pen. ⚠
- [ ] D4 S: Pronunciation practice: the kid repeats a word and Saaras scores the match.
- [ ] D5 S: Per-lesson voice choice (male or female, older or younger) using the Bulbul v4 personas.
- [ ] D6 M: Sanskrit and Urdu lessons (Saaras supports them; check Bulbul support first).

## E. Board and visuals
- [ ] E1 M: About 20 more diagrams: eye, ear, flower parts, the nervous system, the human skeleton, a lens or mirror ray diagram, a pulley, a seed, an insect, the food pyramid.
- [ ] E2 M: Geometry tools: protractor angles, a coordinate grid with plotted points, a labelled polygon.
- [ ] E3 M: Animated visuals: water flowing through the water cycle, planets orbiting, a fraction pie filling in.
- [ ] E4 S: A "zoom in" button on any visual.
- [ ] E5 M: Board export: save the whole board as an image or PDF of notes.
- [ ] E6 L: A chemistry visual that balances equations by drawing atoms. ⚠

## F. Gamification and motivation
- [ ] F1 M: Daily streak, with a gentle reminder card on Home.
- [ ] F2 M: Avatar shop: spend stars on hats and colours for your chosen teacher.
- [ ] F3 S: Achievement badges for finishing a chapter, explaining it back, first exercise.
- [ ] F4 M: A weekly goal ("3 sections this week") with a progress ring.
- [ ] F5 S: Confetti and a teacher dance when a chapter is complete.

## G. Classroom and teachers
- [ ] G1 M: The teacher picks an NCERT chapter for the class quiz (reuses /study).
- [ ] G2 M: Teacher dashboard after the quiz: per-question accuracy and the commonest wrong answer.
- [ ] G3 M: Assign homework: a share link to a section lesson plus a quiz, with the results returned to the teacher's room.
- [ ] G4 M: Projector lesson mode: a big board, with students answering "thumbs up or down" on their phones mid-lesson.

## H. Parents
- [ ] H1 S: Weekly parent voice note covering NCERT chapters done (extend /parent).
- [ ] H2 M: Parent tips: "how to help with this chapter at home" in the parent's language.
- [ ] H3 S: Screen-time and safety settings page (time limit, topics on or off).

## I. Accessibility and reach
- [ ] I1 S: Dyslexia-friendly font toggle, larger text, high-contrast board.
- [ ] I2 M: Low-bandwidth mode: text-only board and browser speech, no images.
- [ ] I3 M: Offline packs: download a chapter (lesson + audio) for school-bus or no-internet use.
- [ ] I4 S: Keyboard and screen-reader pass on all pages.

## J. Demo, pitch and docs (needed for the finals)
- [ ] J1 S: README rewrite covering every feature, the architecture diagram and the Sarvam APIs used.
- [ ] J2 S: A 3-minute demo script (docs/DEMO.md) built around the best moments.
- [ ] J3 S: An impact and metrics page (/about): 11 languages, NCERT classes 1–10, latency numbers, safety results.
- [ ] J4 S: An "About Sarvam" panel showing which Sarvam model powers each feature.
- [ ] J5 M: A pitch deck (slides) for the judges.
- [ ] J6 S: Seed demo data (progress, a streak, a family voice placeholder) so the profile and parent pages look alive.

## K. Ship
- [ ] K1 S: Provision Upstash Redis (you accept the terms in the browser once).
- [ ] K2 S: Deploy to Vercel production and pre-warm the demo lessons and chapters.
- [ ] K3 S: Push the commits to GitHub so they show on your profile.
- [ ] K4 S: Smoke-test production on a phone and a laptop.
