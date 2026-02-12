/**
 * Training Tracker
 * Manage compliance training assignments, completion tracking, and certifications
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  TrainingCourse,
  TrainingAssignment,
  TrainingStatus,
  Certification,
  TrainingQuiz,
} from './types';

export class TrainingTracker {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Assign training to a user
   */
  async assignTraining(
    userId: string,
    courseId: string,
    assignedBy: string,
    dueDate?: string,
  ): Promise<TrainingAssignment> {
    const assignment: TrainingAssignment = {
      id: uuidv4(),
      userId,
      courseId,
      assignedAt: new Date().toISOString(),
      assignedBy,
      dueDate,
    };

    const { error } = await this.supabase
      .from('governance_training_assignments')
      .insert({
        id: assignment.id,
        user_id: assignment.userId,
        course_id: assignment.courseId,
        assigned_at: assignment.assignedAt,
        assigned_by: assignment.assignedBy,
        due_date: assignment.dueDate,
      });

    if (error) {
      throw new Error(`Failed to assign training: ${error.message}`);
    }

    return assignment;
  }

  /**
   * Track training completion
   */
  async trackCompletion(
    userId: string,
    courseId: string,
    quizAnswers?: number[],
  ): Promise<TrainingAssignment> {
    // Get assignment
    const { data: assignmentData, error: assignmentError } = await this.supabase
      .from('governance_training_assignments')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .is('completed_at', null)
      .single();

    if (assignmentError || !assignmentData) {
      throw new Error('Training assignment not found');
    }

    // Get course details
    const course = await this.getCourse(courseId);

    if (!course) {
      throw new Error('Course not found');
    }

    let score: number | undefined;
    let passed: boolean | undefined;

    // Grade quiz if present
    if (course.quiz && quizAnswers) {
      const gradeResult = this.gradeQuiz(course.quiz, quizAnswers);
      score = gradeResult.score;
      passed = gradeResult.passed;
    } else {
      // No quiz, automatically pass
      passed = true;
      score = 100;
    }

    // Update assignment
    const completedAt = new Date().toISOString();

    const { error: updateError } = await this.supabase
      .from('governance_training_assignments')
      .update({
        completed_at: completedAt,
        score,
        passed,
      })
      .eq('id', assignmentData.id);

    if (updateError) {
      throw new Error(`Failed to update assignment: ${updateError.message}`);
    }

    // Create certification if passed
    let certificateId: string | undefined;
    if (passed) {
      const certification = await this.createCertification(userId, course, score || 0);
      certificateId = certification.id;
    }

    return {
      id: assignmentData.id,
      userId: assignmentData.user_id,
      courseId: assignmentData.course_id,
      assignedAt: assignmentData.assigned_at,
      assignedBy: assignmentData.assigned_by,
      dueDate: assignmentData.due_date,
      completedAt,
      score,
      passed,
      certificateId,
    };
  }

  /**
   * Get training compliance status for a user
   */
  async getCompliance(userId: string): Promise<TrainingStatus> {
    // Get user's required courses
    const requiredCourses = await this.getRequiredCourses(userId);

    // Get user's assignments
    const { data: assignments } = await this.supabase
      .from('governance_training_assignments')
      .select('*')
      .eq('user_id', userId);

    const completedCourses = (assignments || []).filter((a) => a.completed_at && a.passed).length;
    const overdueCourses = this.countOverdueCourses(assignments || [], requiredCourses);

    // Get certifications
    const certifications = await this.getCertifications(userId);

    // Calculate compliance score
    const complianceScore = requiredCourses.length > 0
      ? Math.round((completedCourses / requiredCourses.length) * 100)
      : 100;

    return {
      userId,
      requiredCourses: requiredCourses.length,
      completedCourses,
      overdueCourses,
      certifications,
      complianceScore,
    };
  }

  /**
   * Create a new training course
   */
  async createCourse(course: Omit<TrainingCourse, 'id'>): Promise<TrainingCourse> {
    const fullCourse: TrainingCourse = {
      ...course,
      id: uuidv4(),
    };

    const { error } = await this.supabase
      .from('governance_training_courses')
      .insert({
        id: fullCourse.id,
        name: fullCourse.name,
        description: fullCourse.description,
        category: fullCourse.category,
        duration: fullCourse.duration,
        required_for: fullCourse.requiredFor,
        version: fullCourse.version,
        content: fullCourse.content,
        quiz: fullCourse.quiz,
        expiration_days: fullCourse.expirationDays,
      });

    if (error) {
      throw new Error(`Failed to create course: ${error.message}`);
    }

    return fullCourse;
  }

  /**
   * Get a course by ID
   */
  async getCourse(courseId: string): Promise<TrainingCourse | null> {
    const { data, error } = await this.supabase
      .from('governance_training_courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      duration: data.duration,
      requiredFor: data.required_for,
      version: data.version,
      content: data.content,
      quiz: data.quiz,
      expirationDays: data.expiration_days,
    };
  }

  /**
   * List all courses
   */
  async listCourses(category?: string): Promise<TrainingCourse[]> {
    let query = this.supabase.from('governance_training_courses').select('*');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list courses: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      duration: row.duration,
      requiredFor: row.required_for,
      version: row.version,
      content: row.content,
      quiz: row.quiz,
      expirationDays: row.expiration_days,
    }));
  }

  /**
   * Get certifications for a user
   */
  async getCertifications(userId: string): Promise<Certification[]> {
    const { data, error } = await this.supabase
      .from('governance_training_certifications')
      .select('*')
      .eq('user_id', userId)
      .order('issued_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get certifications: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      courseId: row.course_id,
      courseName: row.course_name,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      score: row.score,
      certificateUrl: row.certificate_url,
    }));
  }

  /**
   * Grade a quiz
   */
  private gradeQuiz(quiz: TrainingQuiz, answers: number[]): { score: number; passed: boolean } {
    if (quiz.questions.length !== answers.length) {
      throw new Error('Number of answers does not match number of questions');
    }

    let correctAnswers = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (quiz.questions[i].correctAnswer === answers[i]) {
        correctAnswers++;
      }
    }

    const score = Math.round((correctAnswers / quiz.questions.length) * 100);
    const passed = score >= quiz.passingScore;

    return { score, passed };
  }

  /**
   * Create a certification
   */
  private async createCertification(
    userId: string,
    course: TrainingCourse,
    score: number,
  ): Promise<Certification> {
    const now = new Date();
    const expiresAt = course.expirationDays
      ? new Date(now.getTime() + course.expirationDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const certification: Certification = {
      id: uuidv4(),
      userId,
      courseId: course.id,
      courseName: course.name,
      issuedAt: now.toISOString(),
      expiresAt,
      score,
    };

    const { error } = await this.supabase
      .from('governance_training_certifications')
      .insert({
        id: certification.id,
        user_id: certification.userId,
        course_id: certification.courseId,
        course_name: certification.courseName,
        issued_at: certification.issuedAt,
        expires_at: certification.expiresAt,
        score: certification.score,
      });

    if (error) {
      console.error('Failed to create certification:', error);
    }

    return certification;
  }

  /**
   * Get required courses for a user
   */
  private async getRequiredCourses(userId: string): Promise<TrainingCourse[]> {
    // Get user roles
    const { data: userRoles } = await this.supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId);

    const roles = (userRoles || []).map((r) => r.role_id);

    // Get courses required for these roles
    const { data: courses } = await this.supabase
      .from('governance_training_courses')
      .select('*');

    return (courses || [])
      .filter((course) => {
        const requiredFor = course.required_for || [];
        return requiredFor.some((r: string) => roles.includes(r) || r === 'all');
      })
      .map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        duration: row.duration,
        requiredFor: row.required_for,
        version: row.version,
        content: row.content,
        quiz: row.quiz,
        expirationDays: row.expiration_days,
      }));
  }

  /**
   * Count overdue courses
   */
  private countOverdueCourses(
    assignments: Array<Record<string, unknown>>,
    requiredCourses: TrainingCourse[],
  ): number {
    const now = new Date();
    let overdue = 0;

    for (const course of requiredCourses) {
      const assignment = assignments.find((a) => a.course_id === course.id);

      if (!assignment) {
        // Not assigned yet, considered overdue
        overdue++;
        continue;
      }

      if (assignment.completed_at) {
        // Completed, check if certification expired
        const completedAt = new Date(assignment.completed_at as string);
        if (course.expirationDays) {
          const expiresAt = new Date(completedAt.getTime() + course.expirationDays * 24 * 60 * 60 * 1000);
          if (now > expiresAt) {
            overdue++;
          }
        }
      } else if (assignment.due_date) {
        // Not completed, check if past due date
        const dueDate = new Date(assignment.due_date as string);
        if (now > dueDate) {
          overdue++;
        }
      }
    }

    return overdue;
  }
}
