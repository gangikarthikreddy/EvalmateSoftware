
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('instructor', 'student');

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- has_role function (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Courses table
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Instructors can manage own courses" ON public.courses FOR ALL TO authenticated USING (auth.uid() = instructor_id) WITH CHECK (auth.uid() = instructor_id);
CREATE POLICY "Students can view courses" ON public.courses FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Course enrollments
CREATE TABLE public.course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students can view own enrollments" ON public.course_enrollments FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Students can enroll" ON public.course_enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Instructors can view enrollments for own courses" ON public.course_enrollments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.courses WHERE courses.id = course_id AND courses.instructor_id = auth.uid()));

-- Assignment type enum
CREATE TYPE public.assignment_type AS ENUM ('text', 'code', 'file');

-- Assignments table
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type assignment_type NOT NULL DEFAULT 'text',
  programming_language TEXT,
  due_date TIMESTAMPTZ,
  max_score INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Instructors manage own assignments" ON public.assignments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.courses WHERE courses.id = course_id AND courses.instructor_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.courses WHERE courses.id = course_id AND courses.instructor_id = auth.uid()));
CREATE POLICY "Students can view assignments" ON public.assignments FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rubrics table
CREATE TABLE public.rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  description TEXT,
  max_points INTEGER NOT NULL DEFAULT 10,
  sort_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Instructors manage rubrics" ON public.rubrics FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.assignments a JOIN public.courses c ON c.id = a.course_id WHERE a.id = assignment_id AND c.instructor_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a JOIN public.courses c ON c.id = a.course_id WHERE a.id = assignment_id AND c.instructor_id = auth.uid()));
CREATE POLICY "Students can view rubrics" ON public.rubrics FOR SELECT TO authenticated USING (true);

-- Submission status enum
CREATE TYPE public.submission_status AS ENUM ('submitted', 'grading', 'graded', 're_verification_requested', 're_grading', 're_graded');

-- Submissions table
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text_content TEXT,
  code_content TEXT,
  file_url TEXT,
  status submission_status NOT NULL DEFAULT 'submitted',
  total_score NUMERIC,
  max_possible_score NUMERIC,
  ai_feedback TEXT,
  code_output TEXT,
  code_execution_success BOOLEAN,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own submissions" ON public.submissions FOR ALL TO authenticated USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Instructors view submissions for own courses" ON public.submissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.assignments a JOIN public.courses c ON c.id = a.course_id WHERE a.id = assignment_id AND c.instructor_id = auth.uid()));
CREATE POLICY "Instructors update submissions for own courses" ON public.submissions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.assignments a JOIN public.courses c ON c.id = a.course_id WHERE a.id = assignment_id AND c.instructor_id = auth.uid()));
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grades per rubric criterion
CREATE TABLE public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  rubric_id UUID NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 0,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own grades" ON public.grades FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.submissions WHERE submissions.id = submission_id AND submissions.student_id = auth.uid()));
CREATE POLICY "Instructors view grades" ON public.grades FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id JOIN public.courses c ON c.id = a.course_id WHERE s.id = submission_id AND c.instructor_id = auth.uid()));
CREATE POLICY "System can insert grades" ON public.grades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "System can update grades" ON public.grades FOR UPDATE TO authenticated USING (true);

-- Re-verification requests
CREATE TYPE public.reverification_status AS ENUM ('pending', 'in_review', 'completed', 'rejected');

CREATE TABLE public.re_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status reverification_status NOT NULL DEFAULT 'pending',
  instructor_notes TEXT,
  previous_score NUMERIC,
  new_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.re_verification_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own reverification requests" ON public.re_verification_requests FOR ALL TO authenticated USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Instructors view reverification requests" ON public.re_verification_requests FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id JOIN public.courses c ON c.id = a.course_id WHERE s.id = submission_id AND c.instructor_id = auth.uid()));
CREATE POLICY "Instructors update reverification requests" ON public.re_verification_requests FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.submissions s JOIN public.assignments a ON a.id = s.assignment_id JOIN public.courses c ON c.id = a.course_id WHERE s.id = submission_id AND c.instructor_id = auth.uid()));
CREATE TRIGGER update_reverification_updated_at BEFORE UPDATE ON public.re_verification_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for submissions
INSERT INTO storage.buckets (id, name, public) VALUES ('submissions', 'submissions', false);
CREATE POLICY "Students can upload submission files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Students can view own submission files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Instructors can view all submission files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'submissions');
