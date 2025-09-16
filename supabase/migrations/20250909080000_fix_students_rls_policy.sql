-- Fix RLS policy for students table to allow authenticated teachers to create students
DROP POLICY IF EXISTS "Teachers can create students" ON public.students;

CREATE POLICY "Teachers can create students" ON public.students
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );


