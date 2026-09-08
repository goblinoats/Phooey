import React, { useState } from 'react';
import { defineReactComponent, useDialogProps, useCommand } from 'tonk-builder/react';
import styles from './controls.css?raw';
import { CounterLibrary } from './counter-library.jsx';

function CounterControls() {
  const { subject, count } = useDialogProps();
  const bump = useCommand('bump');
  // Tonk supplies the stored count. React keeps the amount input in local state.
  const [step, setStep] = useState(1);
  const validStep = Number.isSafeInteger(step) && step > 0;

  return <><div className="controls">
    <label>
      Amount
      <input aria-label="Amount" type="number" min="1" step="1" value={step}
        onChange={(event) => setStep(event.target.valueAsNumber)} />
    </label>
    <button type="button" disabled={!validStep || count === undefined}
      onClick={() => bump({ builderCounter: subject, amount: step })}>
      Add {validStep ? step : '…'}
    </button>
  </div><CounterLibrary /></>;
}

defineReactComponent('react-counter-controls', {
  props: { subject: 'entity', count: 'number' },
  key: 'subject',
  component: CounterControls,
  styles,
});
