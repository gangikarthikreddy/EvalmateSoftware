# Evalmate Local Setup + Supabase Setup

## 1) Open in VS Code
- Extract the zip.
- Open the `EvalmateSoftware` folder in VS Code.
- Open the terminal inside VS Code.

## 2) Install requirements
```bash
npm install
```

## 3) Create Supabase project
- Go to Supabase and create a new project.
- In Project Settings, copy:
  - Project URL
  - anon public key
  - service role key

## 4) Add environment file
Create `.env` in the project root:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 5) Link local project to Supabase
Install the Supabase CLI first, then in terminal:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```
This creates tables, policies, buckets, and the new project changes.

## 6) Add edge function secret
You need Gemini for AI grading.
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_key
```

## 7) Deploy functions
```bash
supabase functions deploy execute-code
supabase functions deploy grade-submission
supabase functions deploy re-verify
```

## 8) Run locally in browser
```bash
npm run dev
```
Open the local URL shown in terminal.

## 9) What changed in this version
- Instructor can upload assignment problem documents.
- Instructor can upload criteria documents.
- Instructor can attach files per rubric criterion.
- Instructor can delete courses.
- Instructor can delete assignments.
- Students can unenroll from courses.
- Instructor submissions page now supports course-wise view.
- Student grades page now supports course-wise view.
- Analytics now supports different analytics for different courses.
- Student performance analytics are shown per course.
- Instructor can see student full name and email.
- Code execution output is shown in browser for instructor after grading.

## 10) Important note for professor demo
For code assignments:
- student submits code
- AI grading runs
- code execution output is stored in the submission
- instructor opens assignment/submission page and can see the program output in browser

## 11) Where student programs run
Student code runs through the Supabase Edge Function:
- `supabase/functions/execute-code/index.ts`

The grading flow is handled here:
- `supabase/functions/grade-submission/index.ts`

So inside the project, the execution logic is part of the Supabase backend functions, and the output is displayed in the React browser app.
