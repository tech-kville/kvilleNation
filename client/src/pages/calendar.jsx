import React, { useEffect, useState } from 'react';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '../styles/calendar.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

export default function Calendar() {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  const layoutPlugin = defaultLayoutPlugin({
    // optional: hide sidebar thumbnails on mobile (cleaner)
    sidebarTabs: () => [],
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/files/calendar`);
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
    <div className="calendar-page">
      <div className="calendar">
        {loading ? (
          <p>Loading…</p>
        ) : url ? (
          <div className="pdf-frame">
            <Worker workerUrl={`${process.env.PUBLIC_URL}/pdfjs/pdf.worker.min.js`}>
              <Viewer
                fileUrl={url}
                plugins={[layoutPlugin]}
                defaultScale={SpecialZoomLevel.PageWidth}  
              />
            </Worker>
          </div>
        ) : (
          <p>No calendar file uploaded yet.</p>
        )}
      </div>
    </div>
  );
}