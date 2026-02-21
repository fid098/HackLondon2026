# TruthGuard Web App

React + TypeScript + Vite frontend for the TruthGuard platform.

## Local development

```bash
npm install
npm run dev
# → http://localhost:5173
```

Set `VITE_API_URL` in `.env.local` if the API runs on a different port:
```
VITE_API_URL=http://localhost:8000
```

## Available scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server with hot-reload |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run test` | Run tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |

## Running tests

```bash
npm run test
```

Tests use Vitest + React Testing Library. No browser or API needed.

Expected output: all tests green.

## Project structure

```
src/
├── main.tsx              # Entry point
├── App.tsx               # Router + route definitions
├── index.css             # Tailwind directives + global styles
├── vite-env.d.ts         # Env var type declarations
├── lib/
│   └── api.ts            # Axios client + typed API functions
├── components/
│   ├── Layout.tsx        # Shared Navbar + main container
│   ├── Navbar.tsx        # Top navigation
│   └── __tests__/
│       └── Navbar.test.tsx
└── pages/
    ├── Home.tsx          # Landing page
    └── __tests__/
        └── Home.test.tsx
```

## Adding a new page (example)

1. Create `src/pages/MyPage.tsx`
2. Add a route in `App.tsx`
3. Add a nav item in `Navbar.tsx`'s `NAV_ITEMS` array
