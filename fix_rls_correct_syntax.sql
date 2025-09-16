-- FaceAttend RLS Policy Fix - CORRECTED SYNTAX
-- Copy and paste this EXACT script into Supabase SQL Editor

-- Drop all existing policies first
DROP POLICY IF EXISTS "Allow authenticated users full access to classes" ON classes;
DROP POLICY IF EXISTS "Allow authenticated users full access to students" ON students;
DROP POLICY IF EXISTS "Allow authenticated users full access to enrollments" ON enrollments;
DROP POLICY IF EXISTS "Allow authenticated users full access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Allow authenticated users full access to attendance_sessions" ON attendance_sessions;

-- Also drop any other existing policies
DROP POLICY IF EXISTS "Public access to classes" ON classes;
DROP POLICY IF EXISTS "Public access to students" ON students;
DROP POLICY IF EXISTS "Public access to enrollments" ON enrollments;
DROP POLICY IF EXISTS "Public access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Public access to attendance_sessions" ON attendance_sessions;

-- Create new policies with simple names (no special characters)
CREATE POLICY classes_public_access ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY students_public_access ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY enrollments_public_access ON enrollments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY attendance_records_public_access ON attendance_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY attendance_sessions_public_access ON attendance_sessions FOR ALL USING (true) WITH CHECK (true);

-- Test the policies work
INSERT INTO classes (name, subject, period, teacher_id)
VALUES ('Test Policy', 'Test', '1st', '00000000-0000-0000-0000-000000000000');

-- Clean up test data
DELETE FROM classes WHERE name = 'Test Policy';

-- Success message
SELECT 'Database policies fixed - FaceAttend ready!' as status;