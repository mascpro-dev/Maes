import React from 'react';

const BibleViewer: React.FC = () => {
  const bibleSrc = `${import.meta.env.BASE_URL}biblia/index.html`;

  return (
    <div
      className="w-full rounded-xl overflow-hidden shadow-sm border border-border bg-white"
      style={{ height: 'min(78vh, 780px)' }}
    >
      <iframe
        src={bibleSrc}
        title="Bíblia para Mulheres"
        className="w-full h-full border-0 block"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
};

export default BibleViewer;
