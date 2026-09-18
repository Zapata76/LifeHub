/** Defines the immutable API models used by the household task board. */

export type TaskStatus = 'open' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface HouseholdTask {
  id: number;
  title: string;
  description: string | null;
  assigned_to: number | null;
  assigned_username: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  version: number;
}

export interface TaskMember { id: number; username: string; }

export interface TaskCommand {
  title: string;
  description: string;
  assignedTo: number | null;
  priority: TaskPriority;
  dueDate: string | null;
  status: TaskStatus;
}
