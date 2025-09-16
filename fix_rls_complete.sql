-- Complete RLS fix for students table
-- Run this in Supabase SQL Editor

-- First, let's see what policies currently exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'students';

-- Drop ALL existing policies on students table
DROP POLICY IF EXISTS "Teachers can create students" ON public.students;
DROP POLICY IF EXISTS "Teachers can view students" ON public.students;
DROP POLICY IF EXISTS "Teachers can update students" ON public.students;

-- Create new policies with explicit permissions
CREATE POLICY "Allow authenticated teachers to create students" ON public.students
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Allow authenticated teachers to view students" ON public.students
  FOR SELECT USING (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Allow authenticated teachers to update students" ON public.students
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
  );

-- Verify the new policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'students';


