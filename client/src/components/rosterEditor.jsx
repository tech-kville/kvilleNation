import React, { useEffect, useMemo, useState } from 'react';
import '../styles/rosterEditor.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const CONTACT = 'tenting.kville@gmail.com';
const MAX_MEMBERS = 12;

/**
 * The one place the "email the VPs" fallback is written. Every blocked action
 * and every unexpected response routes through here, so a captain always has
 * somewhere to go.
 */
export function InfoBox({ tone = 'info', children, action }) {
  return (
    <div className={`roster-info roster-info-${tone}`} role="status">
      <div className="roster-info-body">{children}</div>
      {action}
    </div>
  );
}

export function ContactLink() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}

function formatWindowDate(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Why this roster is read-only, phrased for the captain. */
function readOnlyMessage(reason, window) {
  switch (reason) {
    case 'not-captain':
      return (
        <>
          Only your tent's captain can change the roster from this page. If something here
          is wrong, ask your captain, or email <ContactLink />.
        </>
      );
    case 'window-closed':
      return (
        <>
          Your roster edit window closed on {formatWindowDate(window?.closesAt)}. To change
          your roster now, email <ContactLink />.
        </>
      );
    case 'not-started':
      return (
        <>
          Your tent hasn't started tenting yet. You'll be able to edit your roster here
          starting {formatWindowDate(window?.opensAt)}.
        </>
      );
    case 'check-in-progress':
      return (
        <>
          A tent check is happening right now, so roster changes are paused until it
          finishes. Your roster is locked exactly as a Line Monitor sees it. Check back
          shortly.
        </>
      );
    case 'no-start-date':
      return (
        <>
          We don't have a start date on file for your tent, so roster editing isn't
          available. Please email <ContactLink />.
        </>
      );
    default:
      return (
        <>
          Roster editing isn't available for your tent right now. Please email <ContactLink />.
        </>
      );
  }
}

function sameRoster(a, b) {
  if (a.length !== b.length) return false;
  return a.every((m, i) => m.name === b[i].name && m.netID === b[i].netID);
}

export default function RosterEditor({ tent, isCaptain, canEdit, reason, editWindow, dataProblem, onSaved }) {
  const savedRoster = useMemo(() => tent?.roster ?? [], [tent]);

  const [draft, setDraft] = useState(savedRoster);
  const [newName, setNewName] = useState('');
  const [newNetID, setNewNetID] = useState('');
  const [notice, setNotice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  // Whenever the server hands us a roster, that is the truth — discard the draft.
  useEffect(() => {
    setDraft(savedRoster);
    setConfirming(false);
    setNewName('');
    setNewNetID('');
  }, [savedRoster]);

  const captainNetID = String(tent?.captain ?? '').trim().toLowerCase();
  const dirty = !sameRoster(draft, savedRoster);

  const pending = useMemo(() => {
    const before = new Set(savedRoster.map((m) => m.netID.toLowerCase()));
    const after = new Set(draft.map((m) => m.netID.toLowerCase()));
    return {
      added: draft.filter((m) => !before.has(m.netID.toLowerCase())),
      removed: savedRoster.filter((m) => !after.has(m.netID.toLowerCase())),
    };
  }, [draft, savedRoster]);

  function handleRemove(member) {
    if (member.netID.trim().toLowerCase() === captainNetID) {
      setNotice({
        tone: 'warn',
        body: (
          <>
            Captains can't remove themselves from their own tent. To transfer captaincy or
            dissolve your tent, email <ContactLink />.
          </>
        ),
      });
      return;
    }
    setNotice(null);
    setConfirming(false);
    setDraft((prev) => prev.filter((m) => m !== member));
  }

  function handleAdd(event) {
    event.preventDefault();

    const name = newName.trim();
    const netID = newNetID.trim();

    if (!name || !netID) {
      setNotice({ tone: 'warn', body: <>Enter both a name and a netID to add someone.</> });
      return;
    }
    if (name.includes(',') || netID.includes(',')) {
      setNotice({ tone: 'warn', body: <>Names and netIDs can't contain commas.</> });
      return;
    }
    if (draft.length >= MAX_MEMBERS) {
      setNotice({
        tone: 'warn',
        body: (
          <>
            Tents are capped at {MAX_MEMBERS} members. Remove someone first, or email{' '}
            <ContactLink /> if you need an exception.
          </>
        ),
      });
      return;
    }
    if (draft.some((m) => m.netID.trim().toLowerCase() === netID.toLowerCase())) {
      setNotice({ tone: 'warn', body: <><strong>{netID}</strong> is already on your roster.</> });
      return;
    }

    setNotice(null);
    setConfirming(false);
    setDraft((prev) => [...prev, { name, netID }]);
    setNewName('');
    setNewNetID('');
  }

  function handleCancel() {
    setDraft(savedRoster);
    setNotice(null);
    setConfirming(false);
    setNewName('');
    setNewNetID('');
  }

  async function handleSave() {
    setSaving(true);
    setNotice(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/roster/my-tent`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          roster: draft,
          // Echo back exactly what we loaded so the server can detect a
          // concurrent edit made directly in Airtable.
          expectedMembers: savedRoster.map((m) => m.name).join(', '),
          expectedNetIDs: savedRoster.map((m) => m.netID).join(', '),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.code === 'check-in-progress') {
        setNotice({ tone: 'warn', body: <>{data.error}</> });
        setConfirming(false);
        return;
      }

      if (response.status === 409 && data.code === 'data-problem') {
        setNotice({
          tone: 'warn',
          body: (
            <>
              {data.error}
            </>
          ),
        });
        setConfirming(false);
        return;
      }

      if (response.status === 409) {
        setNotice({
          tone: 'warn',
          body: (
            <>
              Your roster was changed in Airtable while this page was open, so your edits
              weren't saved. Reload to see the current roster and try again.
            </>
          ),
          action: (
            <button type="button" className="roster-btn-secondary" onClick={() => window.location.reload()}>
              Reload
            </button>
          ),
        });
        setConfirming(false);
        return;
      }

      if (!response.ok) {
        setNotice({
          tone: 'error',
          body: (
            <>
              {data.error || 'Something went wrong and your roster was not saved.'}{' '}
              If this keeps happening, email <ContactLink />.
            </>
          ),
        });
        setConfirming(false);
        return;
      }

      setConfirming(false);
      setNotice({
        tone: 'success',
        body: <>Roster saved. Your changes are live in Airtable and on tent checks.</>,
      });
      // Re-render from the server's copy, never from local state, so what is
      // shown always equals what is actually in Airtable.
      onSaved(data);
    } catch {
      setNotice({
        tone: 'error',
        body: <>We couldn't reach the server. Check your connection, or email <ContactLink />.</>,
      });
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  const rosterToShow = canEdit ? draft : savedRoster;

  return (
    <div className="roster-editor">
      <div className="roster-header">
        <span className="members-title">Team Members</span>
        <span className="roster-count">
          {rosterToShow.length} / {MAX_MEMBERS}
        </span>
      </div>

      {canEdit && (
        <p className="roster-window-note">
          You can edit your roster until <strong>{formatWindowDate(editWindow?.closesAt)}</strong>.
        </p>
      )}

      {rosterToShow.length === 0 ? (
        <p className="tent-empty">No members on this roster yet.</p>
      ) : (
        <ul className="roster-list">
          {rosterToShow.map((member, index) => {
            const isTentCaptain = member.netID.trim().toLowerCase() === captainNetID;
            return (
              <li key={`${member.netID}-${index}`} className="roster-row">
                <span className="roster-name">{member.name || <em>(no name)</em>}</span>
                <span className="roster-netid">{member.netID || <em>(no netID)</em>}</span>
                {canEdit &&
                  (isTentCaptain ? (
                    <span className="roster-locked" title="Captains can't remove themselves">
                      Captain
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="roster-remove"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => handleRemove(member)}
                    >
                      ×
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {dataProblem && (
        <InfoBox tone="warn">
          Something in your tent's roster data needs a fix that only the VPs of Tenting
          can make. They have been notified automatically — you don't need to email.
          If it's urgent, reach them at <ContactLink />.
        </InfoBox>
      )}

      {!canEdit && !dataProblem && (
        <InfoBox tone="info">{readOnlyMessage(isCaptain ? reason : 'not-captain', editWindow)}</InfoBox>
      )}

      {canEdit && (
        <form className="roster-add" onSubmit={handleAdd}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name"
            aria-label="New member full name"
          />
          <input
            type="text"
            value={newNetID}
            onChange={(e) => setNewNetID(e.target.value)}
            placeholder="NetID"
            aria-label="New member netID"
          />
          <button type="submit" className="roster-btn-secondary">
            Add member
          </button>
        </form>
      )}

      {notice && (
        <InfoBox tone={notice.tone} action={notice.action}>
          {notice.body}
        </InfoBox>
      )}

      {canEdit && dirty && !confirming && (
        <div className="roster-actions">
          <button type="button" className="roster-btn-primary" onClick={() => setConfirming(true)}>
            Save Changes
          </button>
          <button type="button" className="roster-btn-secondary" onClick={handleCancel}>
            Discard
          </button>
        </div>
      )}

      {confirming && (
        <div className="roster-confirm">
          <p className="roster-confirm-title">Save these changes to your roster?</p>
          {pending.added.length > 0 && (
            <p>
              <strong>Adding:</strong>{' '}
              {pending.added.map((m) => `${m.name} (${m.netID})`).join(', ')}
            </p>
          )}
          {pending.removed.length > 0 && (
            <p>
              <strong>Removing:</strong>{' '}
              {pending.removed.map((m) => `${m.name} (${m.netID})`).join(', ')}
            </p>
          )}
          <p className="roster-confirm-note">
            This updates Airtable immediately and is visible to Line Monitors on tent checks.
          </p>
          <div className="roster-actions">
            <button
              type="button"
              className="roster-btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Yes, save'}
            </button>
            <button
              type="button"
              className="roster-btn-secondary"
              onClick={() => setConfirming(false)}
              disabled={saving}
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
