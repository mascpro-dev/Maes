
import React, { useState, useEffect } from 'react';
import { DevotionalService, StaticDevotional } from '../services/devotionalService';
import { OpenAIService, DevotionalResponse } from '../services/openaiService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Book, RefreshCw, Heart, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DailyDevotional: React.FC = () => {
  const [devotional, setDevotional] = useState<StaticDevotional | DevotionalResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const { toast } = useToast();

  const getTodayKey = () => {
    const today = new Date();
    return `devocional_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    const apiKey = localStorage.getItem('openai_api_key');
    setHasApiKey(!!apiKey);
    loadTodayDevotional();
  }, []);

  const loadTodayDevotional = () => {
    // Primeiro, tenta carregar o devocional estático
    const staticDevotional = DevotionalService.getTodayDevotional();
    if (staticDevotional) {
      setDevotional(staticDevotional);
      return;
    }

    // Se não há devocional estático, verifica se há um gerado por IA salvo
    const todayKey = getTodayKey();
    const savedDevotional = localStorage.getItem(todayKey);
    if (savedDevotional) {
      setDevotional(JSON.parse(savedDevotional));
    }
  };

  const generateAIDevotional = async () => {
    if (!hasApiKey) {
      toast({
        title: "API não configurada",
        description: "Peça à administradora para configurar a API da IA.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const newDevotional = await OpenAIService.generateDevotional();
      if (newDevotional) {
        setDevotional(newDevotional);
        const todayKey = getTodayKey();
        localStorage.setItem(todayKey, JSON.stringify(newDevotional));
        setUseAI(true);
        toast({
          title: "Devocional gerado por IA!",
          description: "Um novo devocional foi criado especialmente para hoje.",
        });
      } else {
        toast({
          title: "Erro ao gerar devocional",
          description: "Verifique a configuração da API no painel administrativo.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um problema ao gerar o devocional.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const backToStaticDevotional = () => {
    const staticDevotional = DevotionalService.getTodayDevotional();
    if (staticDevotional) {
      setDevotional(staticDevotional);
      setUseAI(false);
      // Remove o devocional de IA do storage para hoje
      const todayKey = getTodayKey();
      localStorage.removeItem(todayKey);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-lg border-0 bg-white/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="w-5 h-5 text-rose" />
            Devocional Diário
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-white/95 animate-fade-in">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Book className="w-5 h-5 text-rose" />
            Devocional Diário
            {useAI && <Sparkles className="w-4 h-4 text-yellow-500" />}
          </CardTitle>
          <div className="flex gap-2">
            {hasApiKey && (
              <>
                {useAI ? (
                  <Button
                    onClick={backToStaticDevotional}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Book className="w-4 h-4" />
                    Devocional Base
                  </Button>
                ) : (
                  <Button
                    onClick={generateAIDevotional}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Sparkles className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Gerar com IA
                  </Button>
                )}
              </>
            )}
            {useAI && (
              <Button
                onClick={generateAIDevotional}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Renovar IA
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {devotional ? (
          <>
            {/* Título (apenas para devocionais estáticos) */}
            {'title' in devotional && (
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-2">{devotional.title}</h2>
              </div>
            )}

            {/* Versículo */}
            <div className="bg-rose-light/30 p-4 rounded-lg border-l-4 border-rose">
              <h3 className="font-semibold text-rose-dark mb-2">
                Versículo do Dia
                {'reference' in devotional && (
                  <span className="text-sm font-normal ml-2">({devotional.reference})</span>
                )}
              </h3>
              <p className="text-gray-700 italic">{devotional.verse}</p>
            </div>

            {/* Mensagem */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">Mensagem</h3>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                {devotional.message.split('\n').map((paragraph, index) => (
                  paragraph.trim() && (
                    <p key={index} className="mb-3">
                      {paragraph.trim()}
                    </p>
                  )
                ))}
              </div>
            </div>

            {/* Oração */}
            <div className="bg-cream/50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-800 mb-3">Oração</h3>
              <p className="text-gray-700 italic">{devotional.prayer}</p>
            </div>

            {/* Info sobre o sistema */}
            <div className="text-center pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {useAI ? (
                  <span className="flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Devocional gerado por IA
                  </span>
                ) : (
                  `Devocional ${'day' in devotional ? devotional.day : 'do dia'} de ${DevotionalService.getTotalDevotionals()}`
                )}
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Heart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 mb-4">Não foi possível carregar o devocional de hoje.</p>
            {hasApiKey && (
              <Button onClick={generateAIDevotional} className="bg-rose hover:bg-rose-dark gap-2">
                <Sparkles className="w-4 h-4" />
                Gerar com IA
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyDevotional;
