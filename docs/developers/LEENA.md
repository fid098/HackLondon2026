# TruthGuard — Leena's Developer Guide
## Area: Landing Page + UI/UX (Design System)

Welcome Leena! This guide covers the landing page and the shared design system used across the whole app.

---

## What you own

| File | What it does |
|------|-------------|
| `apps/frontend/src/pages/Landing.jsx` | The full landing page (hero, feature cards, pipeline, disclaimer) |
| `apps/frontend/src/index.css` | The ENTIRE design system — colours, buttons, animations, typography |
| `apps/frontend/src/components/Navbar.jsx` | Top navigation bar (logo + nav links + auth buttons) |
| `apps/frontend/src/App.jsx` | Root layout: wraps Navbar + current page + auth modal |
| `apps/frontend/src/components/AuthModal.jsx` | Login / Register modal overlay |

---

## How to run locally

```bash
cd apps/frontend
npm install
npm run dev
# Open http://localhost:5173
```

> You do NOT need the backend running to work on the UI.
> The frontend falls back to mock data automatically when the API is unavailable.

Hot-reload is enabled — save a file and the browser updates instantly.

---

## Design system overview

Everything visual lives in `src/index.css`. Here are the classes you'll use most:

### Colours (CSS variables)

```css
--bg-base:    #04040a    /* Near-black page background */
--accent:     #10b981    /* Emerald green — primary brand colour */
--accent-dim: rgba(16,185,129,0.12)  /* Translucent green for backgrounds */
--border:     rgba(255,255,255,0.07) /* Subtle white border */
--border-h:   rgba(255,255,255,0.13) /* Hover state border */
```

### Key utility classes

| Class | What it looks like |
|-------|--------------------|
| `.btn-primary` | Solid green gradient button (main CTAs) |
| `.btn-secondary` | Translucent dark button (secondary actions) |
| `.input-field` | Dark input box with green focus glow |
| `.glass` | Glassmorphism card with blur effect |
| `.glass-card` | Like `.glass` but with padding + hover lift |
| `.gradient-text` | Emerald gradient text (used in hero heading) |
| `.gradient-text-violet` | Indigo/violet gradient text |
| `.tab` / `.tab.active` | Navigation tab pill buttons |
| `.spinner` | Rotating loading circle |
| `.page-enter` | Fade-in + slide-up page transition animation |
| `.section-divider` | Horizontal fading line between page sections |
| `.dot-grid` | Subtle dot pattern background texture |

### Verdict badge classes

Applied to verdict labels (TRUE, FALSE, etc.):
```
.verdict-true        → green
.verdict-false       → red
.verdict-misleading  → amber
.verdict-unverified  → slate/grey
.verdict-satire      → violet
```

### Animated background orbs

The glowing coloured orbs in the background are `.orb` elements:
```jsx
<div className="orb orb-green"  style={{ width: 700, height: 700, top: '-15%', left: '-15%', opacity: 0.12 }} />
<div className="orb orb-violet" style={{ width: 600, height: 600, top: '40%',  right: '-20%', opacity: 0.10 }} />
<div className="orb orb-blue"   style={{ width: 500, height: 500, bottom: '-10%', left: '30%', opacity: 0.08 }} />
```
Adjust `width`, `height`, `top/left/right/bottom`, and `opacity` to reposition.
Available colours: `orb-green`, `orb-violet`, `orb-blue`, `orb-amber`.

---

## Landing page structure (`Landing.jsx`)

The page is divided into 4 sections:

```
┌─────────────────────────────────────┐
│  HERO                               │  min-h-[90vh], centred flex column
│  - Badge ("Built for HackLondon")   │
│  - H1 gradient heading              │
│  - Subheadline                      │
│  - CTA buttons                      │
│  - Tech pills                       │
│  - Scroll indicator                 │
├─────────────────────────────────────┤
│  FEATURE CARDS (grid, 3 columns)    │  pb-24
│  - AI Analysis Suite                │  → navigates to 'analyze'
│  - Live Heatmap                     │  → navigates to 'heatmap'
│  - Report Archive                   │  → navigates to 'reports'
├─────────────────────────────────────┤
│  PIPELINE (how it works)            │  pb-24
│  - 4 numbered steps                 │
│  - 3 model detail cards             │
├─────────────────────────────────────┤
│  DISCLAIMER                         │  pb-16
└─────────────────────────────────────┘
```

### Editing the feature cards

The 3 cards are defined at the top of the file in the `FEATURES` array:

```jsx
const FEATURES = [
  {
    icon:        '🤖',
    title:       'AI Analysis Suite',
    description: 'One tab for everything...',
    accent:      { color: '#10b981', dim: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' },
    tag:         'Core Feature',
    page:        'analyze',  // clicking the card navigates here
  },
  // ...
]
```

To change a card's colour, update the `accent` object (use an rgba colour).

### Editing the pipeline steps

```jsx
const PIPELINE_STEPS = [
  { num: '01', label: 'Submit',  sub: 'URL, text, media' },
  { num: '02', label: 'Extract', sub: 'Claims identified' },
  { num: '03', label: 'Debate',  sub: 'Pro vs Con agents' },
  { num: '04', label: 'Verdict', sub: 'Judge synthesizes' },
]
```

---

## Navigation system

TruthGuard uses **state-based navigation** (no React Router). There are no URLs — just a page state string.

How it works in `App.jsx`:
```jsx
const PAGES = {
  home:    Landing,    // default
  analyze: Analyze,
  heatmap: Heatmap,
  reports: Reports,
}

const [page, setPage] = useState('home')  // current page name
const navigate = (newPage) => setPage(newPage)

// To navigate from any component:
<button onClick={() => onNavigate('analyze')}>Start Analysing</button>
```

The `onNavigate` prop is passed down from `App.jsx` to every page component.
`Navbar.jsx` also receives it and calls it when a nav link is clicked.

### Nav items (in Navbar.jsx)

```jsx
const NAV_ITEMS = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'reports', label: 'Reports' },
]
```

To add a new page: add an entry to `NAV_ITEMS` here AND to `PAGES` in `App.jsx`.

---

## Authentication UI

The `AuthModal.jsx` is an overlay (not a separate page) that slides in over the current page.
It has two modes: `'login'` and `'register'`.

Triggered from:
- Navbar → "Sign In" / "Sign Up" buttons
- Any page that calls `onLogin()` / `onRegister()`

The modal calls `login()` or `register()` from `lib/api.js` and on success calls
`onSuccess(userObj)` which sets `user` state in `App.jsx`.

---

## Your next tasks

### Task 1 — Make the landing page hero more impactful
- Try increasing the heading font size on desktop (`lg:text-[100px]`)
- Add a subtle animated counter showing "X claims verified"
- Add a demo GIF or screenshot of the analysis in action

### Task 2 — Add a dark/light mode toggle
Add a toggle button to the Navbar that applies a CSS class to `<html>` and
override the CSS variables for a lighter theme:
```css
html.light-mode {
  --bg-base: #f8fafc;
}
```

### Task 3 — Improve mobile responsiveness
Check the landing page at 375px width. The hero heading might overflow.
Fix with responsive Tailwind classes:
```jsx
className="text-4xl md:text-6xl lg:text-[88px]"
```

### Task 4 — Add a testimonials / social proof section
Between the pipeline section and disclaimer, add a row of mock quote cards:
```jsx
const TESTIMONIALS = [
  { quote: "Caught a phishing email before I clicked.", name: "Sarah T." },
  // ...
]
```

### Task 5 — Animate the feature cards on scroll
Use the Intersection Observer API to add a `.visible` class when each card scrolls
into view, triggering a fade-in animation. This is purely CSS + a small useEffect.

---

## Running tests

```bash
cd apps/frontend
npm run test

# Run only Landing page tests
npm run test -- Landing

# Watch mode (re-runs on file save)
npm run test -- --watch
```

The Landing tests are in `src/pages/__tests__/Landing.test.jsx`.

---

## Key files reference

```
apps/frontend/
  src/pages/Landing.jsx                  ← YOUR MAIN FILE (landing page)
  src/index.css                          ← YOUR DESIGN SYSTEM (all shared CSS)
  src/components/Navbar.jsx              ← Top navigation bar
  src/components/AuthModal.jsx           ← Login/register modal
  src/App.jsx                            ← Root layout + navigation + auth state
  src/pages/__tests__/Landing.test.jsx   ← Landing page tests
  src/components/__tests__/Navbar.test.jsx ← Navbar tests
  tailwind.config.js                     ← Tailwind config (extend theme here)
  index.html                             ← Root HTML (change page title/favicon here)
```

---

## Common questions

**Q: How do I change the page title?**
Edit `apps/frontend/index.html`:
```html
<title>TruthGuard — Detect Misinformation Before It Spreads</title>
```

**Q: How do I add a new CSS animation?**
Add it to `src/index.css`:
```css
@keyframes myAnimation {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.my-animated-element {
  animation: myAnimation 0.5s ease-out both;
}
```

**Q: What is `backdrop-filter: blur(14px)`?**
This creates the glassmorphism (frosted glass) effect on cards.
It blurs whatever is rendered behind the element. Used on the feature cards and navbar.

**Q: How do TailwindCSS and the custom CSS classes coexist?**
Tailwind utilities (`rounded-2xl`, `flex`, `text-white`) handle layout and spacing.
Custom CSS classes (`.btn-primary`, `.glass-card`) handle brand-specific styling.
Use both freely — they don't conflict.

**Q: Where does the font come from?**
Inter font is loaded via Google Fonts in `index.html`. Change it there if needed.
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
```
