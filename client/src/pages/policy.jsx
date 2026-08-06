import React, { useEffect, useState } from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '../styles/policy.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function Policy() {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/files/policy`);
        const data = await res.json();
        setUrl(data.url ? `${API_BASE_URL}${data.url}` : null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="policy-container">
      <div className="policy-bubble">
        {loading ? (
          <p>Loading…</p>
        ) : url ? (
          <Worker workerUrl={`${process.env.PUBLIC_URL}/pdfjs/pdf.worker.min.js`}>
            <Viewer fileUrl={url} />
          </Worker>
        ) : (
          <p>No policy uploaded yet.</p>
        )}
      </div>
    </div>
  );
}

export default Policy;