import { useState } from 'react';
import { useStore } from './state/store';
import { TopBar, CaseDescription } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { EventQueue } from './components/EventQueue';
import { JourneyTrack, StepLog } from './components/JourneyView';
import { LinkagePanel } from './components/LinkagePanel';
import { ImportModal } from './components/ImportModal';
import { FaultModal } from './components/FaultModal';
import { ContractModal } from './components/ContractModal';

export function App() {
  const { steps, snapshot } = useStore();
  const [showImport, setShowImport] = useState(false);
  const [showFault, setShowFault] = useState(false);
  const [showContract, setShowContract] = useState(false);

  return (
    <div className="app">
      <TopBar onOpenImport={() => setShowImport(true)} onOpenContract={() => setShowContract(true)} />
      <div>
        <Toolbar />
        <CaseDescription />
      </div>

      <div className="main">
        <div className="column">
          <EventQueue onFaultMenu={() => setShowFault(true)} />
        </div>

        <div className="column">
          <JourneyTrack snapshot={snapshot} />
          <StepLog steps={steps} />
        </div>

        <div className="column">
          <LinkagePanel />
        </div>
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {showFault && <FaultModal onClose={() => setShowFault(false)} />}
      {showContract && <ContractModal onClose={() => setShowContract(false)} />}
    </div>
  );
}
