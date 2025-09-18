-- Fix the circular dependency in student viewing policy
-- The current policy requires students to be enrolled before they can be viewed,
-- but students need to be created before they can be enrolled

-- Drop the problematic policy
DROP POLICY IF EXISTS "Teachers can view students" ON public.students;

-- Create a new policy that allows teachers to view students they created
CREATE POLICY "Teachers can view students they created" ON public.students
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Also fix the update policy to allow teachers to update students they created
DROP POLICY IF EXISTS "Teachers can update students" ON public.students;

CREATE POLICY "Teachers can update students they created" ON public.students
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Ensure the user_owns_class function works properly
CREATE OR REPLACE FUNCTION public.user_owns_class(class_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.classes 
    WHERE id = class_id AND teacher_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
