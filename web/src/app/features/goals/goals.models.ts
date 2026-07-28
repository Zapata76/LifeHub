export type GoalStatus = 'active' | 'completed' | 'suspended';
export type TrackerType = 'boolean' | 'quantity' | 'percentage';
export type TrackerFrequency = 'daily' | 'weekly';

export interface GoalMember {
  id: number;
  username: string;
  role: 'admin' | 'adult' | 'child';
}

export interface GoalLog {
  id: number;
  tracker_id: number;
  log_date: string;
  value_number: number | string | null;
  value_boolean: number | boolean | null;
  note: string | null;
  version: number;
}

export interface GoalTracker {
  id: number;
  goal_id: number;
  tracker_type: TrackerType;
  target_value: number | string | null;
  unit_code: string | null;
  frequency_code: TrackerFrequency;
  version: number;
  logs: GoalLog[];
}

export interface GoalItem {
  id: number;
  owner_id: number;
  owner_name: string | null;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: GoalStatus;
  created_at: string;
  version: number;
  can_edit: boolean;
  can_log: boolean;
  trackers: GoalTracker[];
}

export interface GoalsOverview {
  goals: GoalItem[];
  members: GoalMember[];
}

export interface GoalTrackerPayload {
  id: number | null;
  type: TrackerType;
  frequency: TrackerFrequency;
}

export interface GoalPayload {
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  ownerId: number;
  status: GoalStatus;
  trackers: GoalTrackerPayload[];
  version?: number;
}
