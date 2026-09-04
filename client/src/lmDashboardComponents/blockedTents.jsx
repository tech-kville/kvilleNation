import React, { useEffect, useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

/**
 * Tents whose Airtable record is malformed, so their captain cannot use the
 * roster editor. These need a VP to repair the record by hand — the captain
 * has no way to fix it from the site.
 */
export default function BlockedTents({ onError }) {
  const [state, setState] = useState({ scanned: 0, blocked: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/roster/blocked`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!res.ok) throw new Error('Failed to scan tents for data problems.');
        const data = await res.json();
        if (!cancelled) setState(data);
      } catch (err) {
        if (!cancelled) onError?.(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [onError]);

  if (loading) return <p className="roster-change-empty">Scanning tents…</p>;

  if (state.blocked.length === 0) {
    return (
      <p className="roster-change-empty">
        All {state.scanned} tents look healthy — every captain can edit their roster.
      </p>
    );
  }

  return (
    <div className="blocked-tents">
      <p className="roster-change-empty">
        <strong>{state.blocked.length}</strong> of {state.scanned} tents have a data problem
        that blocks their captain. Fix these in Airtable.
      </p>

      {state.blocked.map((tent) => (
        <div key={tent.id} className="blocked-tent-card">
          <div className="blocked-tent-head">
            <span className="blocked-tent-order">Tent {tent.order}</span>
            {tent.name && <span className="blocked-tent-name">{tent.name}</span>}
            <span className="blocked-tent-type">{tent.type}</span>
            <span className="blocked-tent-captain">captain: {tent.captain || '(none)'}</span>
          </div>

          <ul className="blocked-tent-problems">
            {tent.problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>

          <div className="blocked-tent-values">
            <div><span>Members</span><code>{tent.members || '(empty)'}</code></div>
            <div><span>netIDs</span><code>{tent.netIDs || '(empty)'}</code></div>
          </div>
        </div>
      ))}
    </div>
  );
}
