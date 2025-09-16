-- FaceAttend RLS Policy Fix - NO TEST DATA
-- This just creates the policies without testing

-- Drop all existing policies first
DROP POLICY IF EXISTS "Allow authenticated users full access to classes" ON classes;
DROP POLICY IF EXISTS "Allow authenticated users full access to students" ON students;
DROP POLICY IF EXISTS "Allow authenticated users full access to enrollments" ON enrollments;
DROP POLICY IF EXISTS "Allow authenticated users full access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Allow authenticated users full access to attendance_sessions" ON attendance_sessions;

DROP POLICY IF EXISTS "Public access to classes" ON classes;
DROP POLICY IF EXISTS "Public access to students" ON students;
DROP POLICY IF EXISTS "Public access to enrollments" ON enrollments;
DROP POLICY IF EXISTS "Public access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Public access to attendance_sessions" ON attendance_sessions;

-- Create new policies for public access
CREATE POLICY classes_public_access ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY students_public_access ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY enrollments_public_access ON enrollments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY attendance_records_public_access ON attendance_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY attendance_sessions_public_access ON attendance_sessions FOR ALL USING (true) WITH CHECK (true);

-- Success message (no test data needed)
SELECT 'RLS policies created successfully - FaceAttend database ready!' as result;