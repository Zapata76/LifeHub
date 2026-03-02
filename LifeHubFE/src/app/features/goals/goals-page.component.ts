import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { GoalsService, Goal, Tracker, GoalLog } from './goals.service';
import { AuthService, HubUser } from '../../core/auth.service';
import { TasksService, FamilyMember } from '../tasks/tasks.service';

@Component({
  selector: 'app-goals-page',
  templateUrl: './goals-page.component.html',
  styleUrls: ['./goals-page.component.css']
})
export class GoalsPageComponent implements OnInit {
  goals: Goal[] = [];
  members: FamilyMember[] = [];
  currentUser: HubUser | null = null;
  editingGoal: Goal | null = null;
  goalForm: FormGroup;
  trackerForm: FormGroup;
  showLogForm: number | null = null;
  logValue: number = 0;
  logNotes: string = '';

  constructor(
    private goalsService: GoalsService,
    private tasksService: TasksService,
    private authService: AuthService,
    private fb: FormBuilder
  ) {
    this.goalForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      start_date: [''],
      end_date: [''],
      owner_id: [null, Validators.required],
      status: ['active']
    });

    this.trackerForm = this.fb.group({
      type: ['boolean', Validators.required],
      frequency: ['daily', Validators.required]
    });
  }

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.loadGoals();
        this.tasksService.getFamilyMembers().subscribe(data => this.members = data);
      }
    });
  }

  loadGoals() {
    this.goalsService.getGoals().subscribe(data => this.goals = data);
  }

  createNewGoal() {
    this.editingGoal = { 
      title: '', 
      owner_id: this.currentUser?.id || 0, 
      status: 'active',
      trackers: [] 
    };
    this.goalForm.reset({
      title: '',
      description: '',
      start_date: '',
      end_date: '',
      owner_id: this.currentUser?.id,
      status: 'active'
    });
  }

  editGoal(goal: Goal) {
    this.editingGoal = { ...goal };
    this.goalForm.patchValue({
      title: goal.title,
      description: goal.description,
      start_date: goal.start_date,
      end_date: goal.end_date,
      owner_id: goal.owner_id,
      status: goal.status
    });
  }

  saveGoal() {
    if (this.goalForm.invalid || !this.editingGoal) return;
    const goalData = { ...this.editingGoal, ...this.goalForm.value };
    this.goalsService.saveGoal(goalData).subscribe(() => {
      this.editingGoal = null;
      this.loadGoals();
    });
  }

  deleteGoal(goal: Goal) {
    if (confirm("Eliminare questo obiettivo?")) {
      this.goalsService.deleteGoal(goal.id!).subscribe(() => this.loadGoals());
    }
  }

  addTracker() {
    if (!this.editingGoal) return;
    const tracker: Tracker = {
      goal_id: this.editingGoal.id || 0,
      type: this.trackerForm.value.type,
      frequency: this.trackerForm.value.frequency
    };
    if (!this.editingGoal.trackers) this.editingGoal.trackers = [];
    this.editingGoal.trackers.push(tracker);
  }

  toggleLogForm(trackerId: number) {
    this.showLogForm = this.showLogForm === trackerId ? null : trackerId;
    this.logValue = 0;
    this.logNotes = '';
  }

  saveLog(trackerId: number) {
    const log: GoalLog = {
      tracker_id: trackerId,
      log_date: new Date().toISOString().split('T')[0],
      value: this.logValue,
      notes: this.logNotes
    };
    this.goalsService.addLog(log).subscribe(() => {
      this.showLogForm = null;
      this.loadGoals();
    });
  }

  getCompletionPercentage(goal: Goal): number {
    // Basic implementation of completion percentage
    // For now, let's say it's based on trackers
    if (!goal.trackers || goal.trackers.length === 0) return 0;
    let total = 0;
    goal.trackers.forEach(t => {
      if (t.type === 'boolean') {
        const lastLog = t.logs && t.logs.length > 0 ? t.logs[0] : null;
        if (lastLog && lastLog.value > 0) total += 100;
      } else if (t.type === 'percentage') {
        const lastLog = t.logs && t.logs.length > 0 ? t.logs[0] : null;
        if (lastLog) total += lastLog.value;
      } else {
        // For numeric, we don't have a target value yet, so just assume 50% if there is any log
        if (t.logs && t.logs.length > 0) total += 50;
      }
    });
    return Math.round(total / goal.trackers.length);
  }

  getBadges(goal: Goal): string[] {
    const badges = [];
    const percentage = this.getCompletionPercentage(goal);
    if (percentage >= 100) badges.push('🏆 Super!');
    if (percentage >= 50) badges.push('⭐ Grande!');
    if (goal.trackers && goal.trackers.some(t => t.logs && t.logs.length > 5)) badges.push('🔥 Costanza');
    return badges;
  }

  cancelEdit() {
    this.editingGoal = null;
  }
}
