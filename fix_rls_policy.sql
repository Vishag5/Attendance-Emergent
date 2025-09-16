-- Fix RLS policy for students table to allow authenticated teachers to create students
-- Run this SQL in your Supabase dashboard under SQL Editor

-- First, drop the existing policy
DROP POLICY IF EXISTS "Teachers can create students" ON public.students;

-- Create a new policy that allows authenticated users with profiles to create students
CREATE POLICY "Teachers can create students" ON public.students
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'students' AND policyname = 'Teachers can create students';


