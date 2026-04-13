# EvalMate

A modern assignment grading and evaluation platform for instructors and students.

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Database, Edge Functions)
- **AI Grading**: GeminiAPI

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Supabase account
- Google Gemini API key (free at aistudio.google.com)

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your Supabase credentials
4. Start the dev server:
   ```bash
   npm run dev
   ```

### Environment Variables

```
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_URL=https://your_project_id.supabase.co
```

### Supabase Edge Functions

Set these secrets in your Supabase dashboard:
- `OPENAI_API_KEY` — your Google Gemini API key (free at aistudio.google.com)

### Deployment

See deployment guide for Vercel, Netlify, or GitHub Pages instructions.
