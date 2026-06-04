/**
 * 定时任务 slice
 */
import type { Task, TaskRun } from "../../types";
import * as api from "../../lib/client";

export interface TaskState {
  tasks: Task[];
  loadingTasks: boolean;
  taskRuns: TaskRun[];
  taskRunsTotal: number;
  loadingTaskRuns: boolean;
}

export interface TaskActions {
  loadTasks: () => Promise<void>;
  createTask: (input: any) => Promise<Task>;
  updateTask: (id: string, input: any) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string, enabled: boolean) => Promise<void>;
  triggerTask: (id: string) => Promise<TaskRun>;
  loadTaskRuns: (filter?: api.TaskRunFilter) => Promise<void>;
}

export type TaskSlice = TaskState & TaskActions;

export const createTaskSlice = (set: any): TaskSlice => ({
  tasks: [],
  loadingTasks: false,
  taskRuns: [],
  taskRunsTotal: 0,
  loadingTaskRuns: false,

  loadTasks: async () => {
    set({ loadingTasks: true });
    try {
      const tasks = await api.fetchTasks();
      set({ tasks, loadingTasks: false });
    } catch {
      set({ loadingTasks: false });
    }
  },
  createTask: async (input) => {
    const task = await api.createTask(input);
    set((s: TaskState) => ({ tasks: [...s.tasks, task] }));
    return task;
  },
  updateTask: async (id, input) => {
    const task = await api.updateTask(id, input);
    set((s: TaskState) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
    return task;
  },
  deleteTask: async (id) => {
    await api.deleteTask(id);
    set((s: TaskState) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
  toggleTask: async (id, enabled) => {
    const task = await api.toggleTask(id, enabled);
    set((s: TaskState) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
  },
  triggerTask: async (id) => {
    const run = await api.triggerTask(id);
    const tasks = await api.fetchTasks();
    set({ tasks });
    return run;
  },
  loadTaskRuns: async (filter) => {
    set({ loadingTaskRuns: true });
    try {
      const result = await api.fetchTaskRuns(filter);
      set({ taskRuns: result.runs, taskRunsTotal: result.total, loadingTaskRuns: false });
    } catch {
      set({ loadingTaskRuns: false });
    }
  },
});
