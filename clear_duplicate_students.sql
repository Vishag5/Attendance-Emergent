-- Clear duplicate students to avoid conflicts during testing
-- Run this in Supabase SQL Editor if you get duplicate key errors

-- Delete students with duplicate student_id values
DELETE FROM public.students 
WHERE student_id IN (
  SELECT student_id 
  FROM public.students 
  GROUP BY student_id 
  HAVING COUNT(*) > 1
);

-- Or delete all students to start fresh (uncomment if needed)
-- DELETE FROM public.students;

-- Check remaining students
SELECT student_id, full_name, created_at 
FROM public.students 
ORDER BY created_at DESC;


