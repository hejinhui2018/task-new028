import { useStore } from '../state/store';
import type { LinkageState } from '../domain/types';

function stateClass(status: string): string {
  if (status === 'linked' || status === 'complete' || status === 'attributed') return 'ok';
  if (status === 'idle') return 'idle';
  if (status === 'variant-only' || status === 'partial') return 'warn';
  return 'bad';
}

const STATE_TEXT: Record<string, string> = {
  linked: '已关联',
  complete: '完整',
  attributed: '已归因',
  'variant-only': '仅分组',
  partial: '部分归因',
  gap: '缺口',
  mismatch: '冲突',
  idle: '未建立',
  unattributed: '未归因',
  blocked: '阻断',
};

function LinkCard({ title, status, detail }: { title: string; status: string; detail: string }) {
  return (
    <div className="link-card">
      <div className="lk-title">
        {title}
        <span className={`lk-state ${stateClass(status)}`}>{STATE_TEXT[status] ?? status}</span>
      </div>
      <div className="lk-detail">{detail}</div>
    </div>
  );
}

function describeSession(s: LinkageState['session']): string {
  switch (s.status) {
    case 'linked':
      return `会话 ${s.sessionId}（由 ${s.source} 建立）`;
    case 'mismatch':
      return s.detail;
    case 'gap':
      return s.detail;
    case 'idle':
      return '尚无事件建立会话';
  }
}

function describeExperiment(s: LinkageState['experiment']): string {
  switch (s.status) {
    case 'complete':
      return `实验 ${s.experimentId} / 分组 ${s.variant}（来源 ${s.source}）`;
    case 'variant-only':
      return `分组 ${s.variant}；${s.detail}`;
    case 'gap':
      return s.detail;
    case 'idle':
      return '尚无实验信息';
  }
}

function describeAttribution(s: LinkageState['attribution']): string {
  switch (s.status) {
    case 'attributed':
      return `渠道 ${s.utmSource}${s.utmCampaign ? ` / 活动 ${s.utmCampaign}` : ''}（来源 ${s.source}）`;
    case 'partial':
      return s.detail;
    case 'gap':
      return s.detail;
    case 'idle':
      return '试用尚未归因';
  }
}

function describeConversion(s: LinkageState['conversion']): string {
  switch (s.status) {
    case 'attributed':
      return s.detail;
    case 'partial':
      return s.detail;
    case 'unattributed':
      return s.detail;
    case 'blocked':
      return s.detail;
    case 'idle':
      return '首次发布尚未到达';
  }
}

export function LinkagePanel() {
  const { snapshot, steps } = useStore();
  const { linkage } = snapshot;

  const counts = {
    accepted: steps.filter((s) => s.status === 'accepted').length,
    waiting: steps.filter((s) => s.status === 'waiting').length,
    blocked: steps.filter((s) => s.status === 'blocked').length,
    invalid: steps.filter((s) => s.status === 'invalid').length,
  };

  return (
    <div className="panel">
      <h2>链路状态与验收结论</h2>
      <div className="body">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 9, fontSize: 11.5 }}>
          <span>用户 <b className="mono">{snapshot.userId}</b></span>
          <span className="muted">
            <span style={{ color: 'var(--accepted)' }}>接受 {counts.accepted}</span> ·{' '}
            <span style={{ color: 'var(--waiting)' }}>等待 {counts.waiting}</span> ·{' '}
            <span style={{ color: 'var(--blocked)' }}>阻断 {counts.blocked}</span> ·{' '}
            <span style={{ color: 'var(--invalid)' }}>失效 {counts.invalid}</span>
          </span>
        </div>

        <LinkCard title="① 会话关联" status={linkage.session.status} detail={describeSession(linkage.session)} />
        <LinkCard title="② 实验分组" status={linkage.experiment.status} detail={describeExperiment(linkage.experiment)} />
        <LinkCard title="③ 转化归因" status={linkage.attribution.status} detail={describeAttribution(linkage.attribution)} />
        <LinkCard title="④ 首次发布转化" status={linkage.conversion.status} detail={describeConversion(linkage.conversion)} />

        <div className="section-title">下游实际收到（{snapshot.downstreamIds.length}）</div>
        <div className="downstream-list">
          {snapshot.downstreamIds.length === 0 && <div className="muted small">暂无归一化事件下发</div>}
          {snapshot.downstreamIds.map((id, i) => {
            const step = steps.find((s) => s.normalized?.id === id);
            return (
              <div className="d-item" key={`${id}-${i}`}>
                <span className="seq">{i + 1}.</span>
                <span style={{ color: 'var(--accepted)' }}>✓</span>
                <span>{step?.normalized?.name ?? id}</span>
                <span className="muted" style={{ marginLeft: 'auto' }}>{id}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
