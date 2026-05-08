
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, Plus, Trash2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generatePrayer } from '../services/openaiService';

interface PrayerRequest {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'answered';
  createdAt: string;
  generatedPrayer?: string;
}

const PrayerRequests: React.FC = () => {
  const [prayers, setPrayers] = useState<PrayerRequest[]>(() => {
    const saved = localStorage.getItem('prayer_requests');
    return saved ? JSON.parse(saved) : [];
  });
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const { toast } = useToast();

  const savePrayers = (updatedPrayers: PrayerRequest[]) => {
    setPrayers(updatedPrayers);
    localStorage.setItem('prayer_requests', JSON.stringify(updatedPrayers));
  };

  const addPrayer = () => {
    if (!newTitle.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, adicione um título para o pedido.",
        variant: "destructive"
      });
      return;
    }

    const newPrayer: PrayerRequest = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      description: newDescription.trim(),
      status: 'pending',
      createdAt: new Date().toLocaleDateString('pt-BR')
    };

    savePrayers([...prayers, newPrayer]);
    setNewTitle('');
    setNewDescription('');
    
    toast({
      title: "Pedido adicionado",
      description: "Seu pedido de oração foi salvo com sucesso.",
    });
  };

  const toggleStatus = (id: string) => {
    const updated = prayers.map(prayer =>
      prayer.id === id
        ? { ...prayer, status: prayer.status === 'pending' ? 'answered' as const : 'pending' as const }
        : prayer
    );
    savePrayers(updated);
  };

  const deletePrayer = (id: string) => {
    const updated = prayers.filter(prayer => prayer.id !== id);
    savePrayers(updated);
    toast({
      title: "Pedido removido",
      description: "O pedido foi removido da sua lista.",
    });
  };

  const generatePrayerWithAI = async (prayer: PrayerRequest) => {
    setIsGenerating(prayer.id);
    try {
      const generatedPrayer = await generatePrayer(prayer.title + ' - ' + prayer.description);
      
      const updated = prayers.map(p =>
        p.id === prayer.id
          ? { ...p, generatedPrayer }
          : p
      );
      savePrayers(updated);
      
      toast({
        title: "Oração gerada",
        description: "Uma oração personalizada foi criada para seu pedido.",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar oração",
        description: "Verifique se a chave da API está configurada corretamente.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Meus Pedidos de Oração</h2>
        <p className="text-gray-600">Coloque seus pedidos nas mãos de Deus</p>
      </div>

      <Card className="bg-white/90 backdrop-blur-sm border-rose-light/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-dark">
            <Plus className="w-5 h-5" />
            Novo Pedido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Título do pedido"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="border-rose-light/30 focus:border-rose"
          />
          <Textarea
            placeholder="Descreva seu pedido de oração..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="border-rose-light/30 focus:border-rose min-h-[100px]"
          />
          <Button onClick={addPrayer} className="w-full bg-rose hover:bg-rose-dark">
            <Heart className="w-4 h-4 mr-2" />
            Adicionar Pedido
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {prayers.map((prayer) => (
          <Card key={prayer.id} className="bg-white/90 backdrop-blur-sm border-rose-light/20">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg text-gray-800">{prayer.title}</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">{prayer.createdAt}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={prayer.status === 'answered' ? 'default' : 'secondary'}
                    className={prayer.status === 'answered' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                  >
                    {prayer.status === 'answered' ? 'Respondido' : 'Pendente'}
                  </Badge>
                  <Button
                    onClick={() => deletePrayer(prayer.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {prayer.description && (
                <p className="text-gray-700 text-sm">{prayer.description}</p>
              )}
              
              <div className="flex gap-2">
                <Button
                  onClick={() => toggleStatus(prayer.id)}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  Marcar como {prayer.status === 'pending' ? 'Respondido' : 'Pendente'}
                </Button>
                <Button
                  onClick={() => generatePrayerWithAI(prayer)}
                  disabled={isGenerating === prayer.id}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-rose-light text-rose hover:bg-rose-light"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isGenerating === prayer.id ? 'Gerando...' : 'Gerar Oração'}
                </Button>
              </div>

              {prayer.generatedPrayer && (
                <div className="mt-4 p-4 bg-rose-light/20 rounded-lg border border-rose-light/30">
                  <h4 className="font-medium text-rose-dark mb-2">Oração Gerada:</h4>
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                    {prayer.generatedPrayer}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {prayers.length === 0 && (
          <Card className="bg-white/90 backdrop-blur-sm border-rose-light/20">
            <CardContent className="text-center py-8">
              <Heart className="w-12 h-12 text-rose-light mx-auto mb-4" />
              <p className="text-gray-600">Nenhum pedido de oração ainda.</p>
              <p className="text-sm text-gray-500 mt-1">Adicione seu primeiro pedido acima.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PrayerRequests;
