
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BibleOnline: React.FC = () => {
  const bibleUrl = 'https://xn--finanaspro-s6a.site/';

  const openInNewTab = () => {
    window.open(bibleUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Bíblia Online</h2>
        <p className="text-gray-600">Leia a Palavra de Deus a qualquer momento</p>
      </div>

      <Card className="bg-white/90 backdrop-blur-sm border-rose-light/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-dark">
            <BookOpen className="w-5 h-5" />
            Acesso à Bíblia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <Button 
              onClick={openInNewTab}
              className="bg-rose hover:bg-rose-dark text-white gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Bíblia em Nova Aba
            </Button>
          </div>
          
          <div className="border border-rose-light/30 rounded-lg overflow-hidden">
            <iframe
              src={bibleUrl}
              className="w-full h-[600px]"
              title="Bíblia Online"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BibleOnline;
