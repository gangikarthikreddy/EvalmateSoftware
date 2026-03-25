
-- Fix grades INSERT policy: only allow if user is instructor of the course or student owns the submission
DROP POLICY "System can insert grades" ON public.grades;
CREATE POLICY "Grades can be inserted by instructors or system" ON public.grades FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      JOIN public.courses c ON c.id = a.course_id
      WHERE s.id = submission_id AND (c.instructor_id = auth.uid() OR s.student_id = auth.uid())
    )
  );

-- Fix grades UPDATE policy
DROP POLICY "System can update grades" ON public.grades;
CREATE POLICY "Grades can be updated by instructors" ON public.grades FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.assignments a ON a.id = s.assignment_id
      JOIN public.courses c ON c.id = a.course_id
      WHERE s.id = submission_id AND c.instructor_id = auth.uid()
    )
  );
