# Elemental Frontend

React + TypeScript + Vite UI for Elemental, with:

- Auth via Supabase
- Protected tabbed dashboard routes
- Tailwind CSS styling
- Mock-first data repository with easy source switching

## Run

```bash
npm install
npm run dev
```

## Environment

Create `.env` in `frontend/` (or copy from `.env.example`) and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DATA_SOURCE` (`mock` or `supabase`)

## Data source switching

- `VITE_DATA_SOURCE=mock`: Uses visual mock datasets for dashboard tabs.
- `VITE_DATA_SOURCE=supabase`: Uses Supabase-backed repository entry points.

The repository factory is in `src/lib/data/createRepository.ts`.
