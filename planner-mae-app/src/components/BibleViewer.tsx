import React from 'react';

const BIBLE_VERSION = 'v2-2026-05-07';

const BibleViewer: React.FC = () => {
  const bibleSrc = `${import.meta.env.BASE_URL}biblia/index.html?${BIBLE_VERSION}`;

  return (
    <div
      className="w-full rounded-xl overflow-hidden shadow-sm border border-border bg-white"
      style={{ height: 'min(78vh, 780px)' }}
    >
      <iframe
        src={bibleSrc}
        title="Bíblia"
        className="w-full h-full border-0 block"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
};

export default BibleViewer;
