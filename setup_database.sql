-- FaceAttend Database Setup Script
-- Run this in your Supabase SQL Editor

-- 1. Enable Row Level Security but allow public access for demo
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Create permissive policies for demo/testing (TEMPORARY)
-- In production, you'd want proper user-based policies

-- Classes policies
DROP POLICY IF EXISTS "Allow public read access to classes" ON classes;
DROP POLICY IF EXISTS "Allow public insert access to classes" ON classes;
DROP POLICY IF EXISTS "Allow public update access to classes" ON classes;
DROP POLICY IF EXISTS "Allow public delete access to classes" ON classes;

CREATE POLICY "Allow public read access to classes" ON classes FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to classes" ON classes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to classes" ON classes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to classes" ON classes FOR DELETE USING (true);

-- Students policies
DROP POLICY IF EXISTS "Allow public read access to students" ON students;
DROP POLICY IF EXISTS "Allow public insert access to students" ON students;
DROP POLICY IF EXISTS "Allow public update access to students" ON students;
DROP POLICY IF EXISTS "Allow public delete access to students" ON students;

CREATE POLICY "Allow public read access to students" ON students FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to students" ON students FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to students" ON students FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to students" ON students FOR DELETE USING (true);

-- Enrollments policies
DROP POLICY IF EXISTS "Allow public read access to enrollments" ON enrollments;
DROP POLICY IF EXISTS "Allow public insert access to enrollments" ON enrollments;
DROP POLICY IF EXISTS "Allow public update access to enrollments" ON enrollments;
DROP POLICY IF EXISTS "Allow public delete access to enrollments" ON enrollments;

CREATE POLICY "Allow public read access to enrollments" ON enrollments FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to enrollments" ON enrollments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to enrollments" ON enrollments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to enrollments" ON enrollments FOR DELETE USING (true);

-- Attendance records policies
DROP POLICY IF EXISTS "Allow public read access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Allow public insert access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Allow public update access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Allow public delete access to attendance_records" ON attendance_records;

CREATE POLICY "Allow public read access to attendance_records" ON attendance_records FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to attendance_records" ON attendance_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to attendance_records" ON attendance_records FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to attendance_records" ON attendance_records FOR DELETE USING (true);

-- Attendance sessions policies  
DROP POLICY IF EXISTS "Allow public read access to attendance_sessions" ON attendance_sessions;
DROP POLICY IF EXISTS "Allow public insert access to attendance_sessions" ON attendance_sessions;
DROP POLICY IF EXISTS "Allow public update access to attendance_sessions" ON attendance_sessions;
DROP POLICY IF EXISTS "Allow public delete access to attendance_sessions" ON attendance_sessions;

CREATE POLICY "Allow public read access to attendance_sessions" ON attendance_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to attendance_sessions" ON attendance_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to attendance_sessions" ON attendance_sessions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to attendance_sessions" ON attendance_sessions FOR DELETE USING (true);

-- 3. Insert sample data for testing
INSERT INTO classes (id, name, subject, period, teacher_id, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Math 101', 'Mathematics', '1st Period', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440002', 'Science Lab', 'Physics', '2nd Period', '550e8400-e29b-41d4-a716-446655440000', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO students (id, student_id, full_name, facial_id, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440010', 'STU001', 'John Smith', NULL, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440011', 'STU002', 'Sarah Johnson', NULL, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440012', 'STU003', 'Mike Davis', NULL, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440013', 'STU004', 'Emma Wilson', NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO enrollments (id, class_id, student_id, enrolled_at) VALUES
('550e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', NOW()),
('550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440011', NOW()),
('550e8400-e29b-41d4-a716-446655440022', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440012', NOW()),
('550e8400-e29b-41d4-a716-446655440023', '550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440013', NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. Insert sample attendance data
INSERT INTO attendance_records (id, class_id, student_id, date, status, created_at) VALUES
('550e8400-e29b-41d4-a716-446655440030', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440010', CURRENT_DATE, 'present', NOW()),
('550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440011', CURRENT_DATE, 'present', NOW()),
('550e8400-e29b-41d4-a716-446655440032', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440012', CURRENT_DATE, 'absent', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO attendance_sessions (id, class_id, teacher_id, date, total_students, present_count, absent_count, created_at) VALUES
('550e8400-e29b-41d4-a716-446655440040', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', CURRENT_DATE, 3, 2, 1, NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. Verification queries
SELECT 'Classes created:' as info, COUNT(*) as count FROM classes;
SELECT 'Students created:' as info, COUNT(*) as count FROM students;
SELECT 'Enrollments created:' as info, COUNT(*) as count FROM enrollments;
SELECT 'Attendance records created:' as info, COUNT(*) as count FROM attendance_records;