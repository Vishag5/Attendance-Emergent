import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Class {
  id: string;
  name: string;
  subject: string;
  period: string;
  teacher_id: string;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  student_id: string;
  full_name: string;
  facial_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  class_id: string;
  student_id: string;
  enrolled_at: string;
  students: Student;
}

export const useClasses = () => {
  return useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Class[];
    }
  });
};

export const useClassById = (classId: string) => {
  return useQuery({
    queryKey: ['class', classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();
      
      if (error) throw error;
      return data as Class;
    },
    enabled: !!classId
  });
};

export const useClassEnrollments = (classId: string) => {
  return useQuery({
    queryKey: ['enrollments', classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          students (*)
        `)
        .eq('class_id', classId)
        .order('enrolled_at', { ascending: false });
      
      if (error) throw error;
      return data as Enrollment[];
    },
    enabled: !!classId
  });
};

export const useCreateClass = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (classData: { name: string; subject: string; period: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('classes')
        .insert({
          ...classData,
          teacher_id: user.id
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast({
        title: "Success",
        description: "Class created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};

export const useCreateStudent = () => {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (studentData: { student_id: string; full_name: string; facial_id?: string }) => {
      const { data, error } = await supabase
        .from('students')
        .insert(studentData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};

export const useEnrollStudent = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ classId, studentId }: { classId: string; studentId: string }) => {
      const { data, error } = await supabase
        .from('enrollments')
        .insert({
          class_id: classId,
          student_id: studentId
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['enrollments', variables.classId] });
      toast({
        title: "Success",
        description: "Student enrolled successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};

export const useDeleteStudent = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ studentId, classId }: { studentId: string; classId: string }) => {
      // First, delete the enrollment
      const { error: enrollmentError } = await supabase
        .from('enrollments')
        .delete()
        .eq('student_id', studentId)
        .eq('class_id', classId);

      if (enrollmentError) throw enrollmentError;

      // Then, delete the student record
      const { error: studentError } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);

      if (studentError) throw studentError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['enrollments', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast({
        title: "Success",
        description: "Student deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });
};