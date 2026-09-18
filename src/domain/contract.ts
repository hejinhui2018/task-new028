import type { EventContract, JourneyDef } from './types';

/** 用户旅程：开通试用 → 创建项目 → 首次发布 */
export const JOURNEY: JourneyDef = {
  id: 'activation',
  title: '激活旅程：开通试用 → 创建项目 → 首次发布',
  steps: [
    { id: 'trial', title: '开通试用', expects: 'trial_started' },
    { id: 'project', title: '创建项目', expects: 'project_created' },
    { id: 'publish', title: '首次发布', expects: 'first_publish' },
  ],
};

/**
 * 默认迁移契约。
 * v1（旧 SDK）字段：uid / sid / exp / pid / tpl / plan_name
 * v2（新 SDK）字段：user_id / session_id / experiment_variant / project_id / template / plan + billing_cycle
 */
export function defaultContract(): EventContract {
  return {
    commonRequired: ['user_id'],
    v2Events: [
      { name: 'trial_started', requiredFields: ['plan'] },
      { name: 'project_created', requiredFields: ['project_id', 'template'] },
      { name: 'first_publish', requiredFields: ['project_id', 'url'] },
    ],
    rules: [
      { id: 'm1', kind: 'event-map', enabled: true, from: 'trial_activate', to: 'trial_started' },
      { id: 'm2', kind: 'event-map', enabled: true, from: 'proj_create', to: 'project_created' },
      { id: 'm3', kind: 'event-map', enabled: true, from: 'publish', to: 'first_publish' },
      { id: 'r1', kind: 'rename', enabled: true, event: '*', from: 'uid', to: 'user_id' },
      { id: 'r2', kind: 'rename', enabled: true, event: '*', from: 'sid', to: 'session_id' },
      { id: 'r3', kind: 'rename', enabled: true, event: '*', from: 'exp', to: 'experiment_variant' },
      { id: 'r4', kind: 'rename', enabled: true, event: '*', from: 'pid', to: 'project_id' },
      { id: 'r5', kind: 'rename', enabled: true, event: 'proj_create', from: 'tpl', to: 'template' },
      {
        id: 's1',
        kind: 'split',
        enabled: true,
        event: 'trial_activate',
        from: 'plan_name',
        to: ['plan', 'billing_cycle'],
        separator: '/',
      },
      {
        id: 'c1',
        kind: 'compat',
        enabled: true,
        event: 'trial_started',
        field: 'billing_cycle',
        required: true,
        note: 'v1 旧包的 plan_name 可能不含付费周期，禁止伪造，按失效处理',
      },
      {
        id: 'c2',
        kind: 'compat',
        enabled: true,
        event: '*',
        field: 'session_id',
        required: false,
        note: '缺失时会话关联降级，但不阻断事件',
      },
      {
        id: 'c3',
        kind: 'compat',
        enabled: true,
        event: '*',
        field: 'experiment_variant',
        required: false,
        note: '缺失时实验分组丢失，但不阻断事件',
      },
    ],
    forbiddenFields: ['email', 'phone', 'ip', 'idcard'],
    orderToleranceMs: 3000,
  };
}
