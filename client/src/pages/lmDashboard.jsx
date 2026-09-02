import React, { useState, useEffect } from 'react';
import '../styles/lmDashboard.css';
import Toast from '../lmDashboardComponents/toast.jsx';
import SearchBox from "../lmDashboardComponents/searchBox.jsx";
import UsersTable from '../lmDashboardComponents/usersTable.jsx';
import AirtableConfigForm from '../lmDashboardComponents/airtableConfig.jsx';
import SectionHeader from '../lmDashboardComponents/sectionHeader.jsx';
import RoleStats from '../lmDashboardComponents/roleStats.jsx';
import CheckStatus from '../lmDashboardComponents/checkStatus.jsx';
import FileUploadCard from '../lmDashboardComponents/fileUploadCard.jsx';
import TentLinkForm from '../lmDashboardComponents/tentLink.jsx';
import SeasonToggle from '../lmDashboardComponents/seasonToggle.jsx';
import RosterChanges from '../lmDashboardComponents/rosterChanges.jsx';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

export default function LmDashboard() {
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await response.json();
        setUsers(data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    fetchUsers();
  }, []);


  const handleToggleRole = async (netID, field) => {
    try {
      const user = users.find((u) => u.netID === netID);
      const newValue = !user[field];

      const response = await fetch(`${API_BASE_URL}/api/admin/update-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ netID, field, value: newValue }),
      });

      if (response.ok) {
        setUsers((prev) => prev.map((u) => (u.netID === netID ? { ...u, [field]: newValue } : u)));
        setSuccessMessage(`Updated ${field} status for ${user.firstName}`);
        setErrorMessage('');
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to update user.');
        setTimeout(() => setErrorMessage(''), 5000);
      }
    } catch (error) {
      setErrorMessage('An unexpected error occurred.');
      setSuccessMessage('');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const filteredUsers = users.filter((user) => {
    const term = userSearchTerm.toLowerCase();
    return (
      user.firstName.toLowerCase().includes(term) ||
      user.lastName.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term)
    );
  });

  return (
    <div className="lm-dashboard">

      <h1>Line Monitor Dashboard</h1>
      <Toast type="success" message={successMessage} />
      <Toast type="error" message={errorMessage} />
      <SectionHeader title="Overview" subtitle="Quick stats for this season" />
      <RoleStats users={users} />

      <SectionHeader title="Tent Check Status" subtitle="See current check activity" />
      <CheckStatus
        onSuccess={(m) => { setSuccessMessage(m); setErrorMessage(''); }}
        onError={(m) => { setErrorMessage(m); setSuccessMessage(''); }}
      />
      {/* <SectionHeader
        title="Season Settings"
        subtitle="Toggle whether K-Ville is currently in season"
      /> */}
      <SeasonToggle
        onSuccess={(m) => { setSuccessMessage(m); setErrorMessage(''); }}
        onError={(m) => { setErrorMessage(m); setSuccessMessage(''); }}
      />
      <h2 style={{ marginTop: '1rem' }}>Users</h2>

      <SearchBox placeholder="Search users..." value={userSearchTerm} onChange={setUserSearchTerm} />

      <UsersTable users={filteredUsers} onToggleRole={handleToggleRole} />

      <SectionHeader
        title="Roster Changes"
        subtitle="Edits captains made themselves, newest first — already live in Airtable"
      />
      <RosterChanges onError={(m) => { setErrorMessage(m); setSuccessMessage(''); }} />

      <SectionHeader title="Airtable Settings" subtitle="Rotate keys yearly and update Base/Table IDs" />
      <AirtableConfigForm
        onSuccess={(m) => { setSuccessMessage(m); setErrorMessage(''); }}
        onError={(m) => { setErrorMessage(m); setSuccessMessage(''); }}
      />
      <h2 style={{ marginTop: '1.5rem' }}>Uploads</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: -20 }}>
          <div style={{ flex: '1 1 300px' }}>
            <FileUploadCard
              title="Policy PDF"
              uploadPath="/api/files/policy"
              accept="application/pdf"
              onSuccess={(m) => { setSuccessMessage(m); setErrorMessage(''); }}
              onError={(m) => { setErrorMessage(m); setSuccessMessage(''); }}
            />
          </div>
          <div style={{ flex: '1 1 300px' }}>
            <FileUploadCard
              title="Calendar PDF"
              uploadPath="/api/files/calendar"
              accept="application/pdf"
              onSuccess={(m) => { setSuccessMessage(m); setErrorMessage(''); }}
              onError={(m) => { setErrorMessage(m); setSuccessMessage(''); }}
            />
          </div>
          <div style={{ flex: '1 1 300px' }}>
            <TentLinkForm
              onSuccess={(m) => { setSuccessMessage(m); setErrorMessage(''); }}
              onError={(m) => { setErrorMessage(m); setSuccessMessage(''); }}
            />
          </div>
        </div>

    </div>
  );
}