import React from 'react';

const BibleViewer: React.FC = () => {
  return (
    <div className="w-full rounded-xl overflow-hidden shadow-lg border border-border bg-white" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
      <iframe
        src="/biblia/index.html"
        title="Bíblia para Mulheres"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
};

export default BibleViewer;
