-- FaceAttend RLS Policy Fix - NO SAMPLE DATA
-- Run this in your Supabase SQL Editor

-- Enable Row Level Security
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for authenticated users
-- Classes policies
DROP POLICY IF EXISTS "Allow authenticated users full access to classes" ON classes;
CREATE POLICY "Allow authenticated users full access to classes" ON classes FOR ALL WITH CHECK (true);

-- Students policies  
DROP POLICY IF EXISTS "Allow authenticated users full access to students" ON students;
CREATE POLICY "Allow authenticated users full access to students" ON students FOR ALL WITH CHECK (true);

-- Enrollments policies
DROP POLICY IF EXISTS "Allow authenticated users full access to enrollments" ON enrollments;
CREATE POLICY "Allow authenticated users full access to enrollments" ON enrollments FOR ALL WITH CHECK (true);

-- Attendance records policies
DROP POLICY IF EXISTS "Allow authenticated users full access to attendance_records" ON attendance_records;
CREATE POLICY "Allow authenticated users full access to attendance_records" ON attendance_records FOR ALL WITH CHECK (true);

-- Attendance sessions policies
DROP POLICY IF EXISTS "Allow authenticated users full access to attendance_sessions" ON attendance_sessions;
CREATE POLICY "Allow authenticated users full access to attendance_sessions" ON attendance_sessions FOR ALL WITH CHECK (true);

-- Verification - should return 0 for all (empty database)
SELECT 'Classes:' as table_name, COUNT(*) as count FROM classes
UNION ALL
SELECT 'Students:', COUNT(*) FROM students  
UNION ALL
SELECT 'Enrollments:', COUNT(*) FROM enrollments
UNION ALL
SELECT 'Attendance Records:', COUNT(*) FROM attendance_records;