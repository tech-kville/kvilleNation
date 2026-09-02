import React, { useEffect, useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function formatWhen(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function MemberChips({ members, kind }) {
  if (!members?.length) return <span className="roster-change-none">—</span>;
  return (
    <span className="roster-change-chips">
      {members.map((m, i) => (
        <span key={`${m.netID}-${i}`} className={`roster-change-chip roster-change-${kind}`}>
          {m.name} ({m.netID})
        </span>
      ))}
    </span>
  );
}

/**
 * Captains write roster changes straight to Airtable, so this feed is how the
 * VPs of Tenting see what happened and can reverse anything that looks wrong.
 */
export default function RosterChanges({ onError }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/roster/changes`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!res.ok) throw new Error('Failed to load roster changes.');
        const data = await res.json();
        if (!cancelled) setChanges(data);
      } catch (err) {
        if (!cancelled) onError?.(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [onError]);

  if (loading) return <p className="roster-change-empty">Loading roster changes…</p>;
  if (changes.length === 0) {
    return <p className="roster-change-empty">No captains have changed their roster yet.</p>;
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Tent</th>
            <th>Changed by</th>
            <th>Added</th>
            <th>Removed</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change._id}>
              <td>{formatWhen(change.createdAt)}</td>
              <td>
                {change.tentOrder}
                {change.tentName ? ` — ${change.tentName}` : ''}
              </td>
              <td>
                {change.actorName}
                <br />
                <small>{change.actorNetID}</small>
              </td>
              <td><MemberChips members={change.added} kind="added" /></td>
              <td><MemberChips members={change.removed} kind="removed" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
