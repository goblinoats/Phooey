import React, { useState } from 'react';
import { useQuery, useTransaction } from 'tonk-builder/react';
import { counters, addCounter } from './counters.js';

export function CounterLibrary() {
  const { data, status, error } = useQuery(counters);
  const transact = useTransaction();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const duplicate = data.some((row) => row.fields.name === name.trim());

  async function submit(event) {
    event.preventDefault();
    if (!name.trim() || duplicate || saving) return;
    setSaving(true);
    setMessage('');
    try {
      await transact(addCounter(name.trim()));
      setName('');
      setMessage('Counter created.');
    } catch (error) {
      if (error.name !== 'AbortError') setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="library">
    <h2>Create another counter</h2>
    <p>{status === 'loading' ? 'Loading counters…' : `${data.length} counters in this space.`}</p>
    {error && <p role="alert">{error.message}</p>}
    <form className="controls" onSubmit={submit}>
      <label>
        New counter name
        <input value={name} required disabled={saving}
          onChange={(event) => { setName(event.target.value); setMessage(''); }} />
      </label>
      <button type="submit" disabled={status !== 'ready' || saving || duplicate || !name.trim()}>
        {saving ? 'Creating…' : 'Create counter'}
      </button>
    </form>
    <p role="status">{duplicate ? 'A counter with this name exists.' : message}</p>
  </section>;
}
