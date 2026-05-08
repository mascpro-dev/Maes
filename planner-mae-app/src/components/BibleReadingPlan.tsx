import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calendar, Book, CheckCircle, Circle } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';

interface ReadingEntry {
  day: number;
  date: string;
  reading: string;
  completed: boolean;
}

const BibleReadingPlan: React.FC = () => {
  const [readingPlan, setReadingPlan] = useState<ReadingEntry[]>([]);
  const [currentWeek, setCurrentWeek] = useState(1);

  useEffect(() => {
    generateReadingPlan();
    loadProgress();
  }, []);

  const generateReadingPlan = () => {
    const plan: ReadingEntry[] = [];
    const startDate = new Date(2024, 0, 1); // 1º de janeiro
    
    const readings = [
      // Janeiro (31 dias)
      "Gênesis 1-3", "Gênesis 4-6", "Gênesis 7-9", "Gênesis 10-12", "Gênesis 13-15",
      "Gênesis 16-18", "Gênesis 19-21", "Gênesis 22-24", "Gênesis 25-27", "Gênesis 28-30",
      "Gênesis 31-33", "Gênesis 34-36", "Gênesis 37-39", "Gênesis 40-42", "Gênesis 43-45",
      "Gênesis 46-48", "Gênesis 49-50; Êxodo 1", "Êxodo 2-4", "Êxodo 5-7", "Êxodo 8-10",
      "Êxodo 11-13", "Êxodo 14-16", "Êxodo 17-19", "Êxodo 20-22", "Êxodo 23-25",
      "Êxodo 26-28", "Êxodo 29-31", "Êxodo 32-34", "Êxodo 35-37", "Êxodo 38-40",
      "Levítico 1-3",
      
      // Fevereiro (28 dias)
      "Levítico 4-6", "Levítico 7-9", "Levítico 10-12", "Levítico 13-15", "Levítico 16-18",
      "Levítico 19-21", "Levítico 22-24", "Levítico 25-27", "Números 1-3", "Números 4-6",
      "Números 7-9", "Números 10-12", "Números 13-15", "Números 16-18", "Números 19-21",
      "Números 22-24", "Números 25-27", "Números 28-30", "Números 31-33", "Números 34-36",
      "Deuteronômio 1-3", "Deuteronômio 4-6", "Deuteronômio 7-9", "Deuteronômio 10-12", "Deuteronômio 13-15",
      "Deuteronômio 16-18", "Deuteronômio 19-21", "Deuteronômio 22-24",
      
      // Março (31 dias)
      "Deuteronômio 25-27", "Deuteronômio 28-30", "Deuteronômio 31-34", "Josué 1-3", "Josué 4-6",
      "Josué 7-9", "Josué 10-12", "Josué 13-15", "Josué 16-18", "Josué 19-21",
      "Josué 22-24", "Juízes 1-3", "Juízes 4-6", "Juízes 7-9", "Juízes 10-12",
      "Juízes 13-15", "Juízes 16-18", "Juízes 19-21", "Rute 1-4", "1 Samuel 1-3",
      "1 Samuel 4-6", "1 Samuel 7-9", "1 Samuel 10-12", "1 Samuel 13-15", "1 Samuel 16-18",
      "1 Samuel 19-21", "1 Samuel 22-24", "1 Samuel 25-27", "1 Samuel 28-31", "2 Samuel 1-3",
      "2 Samuel 4-6",
      
      // Abril (30 dias)
      "2 Samuel 7-9", "2 Samuel 10-12", "2 Samuel 13-15", "2 Samuel 16-18", "2 Samuel 19-21",
      "2 Samuel 22-24", "1 Reis 1-3", "1 Reis 4-6", "1 Reis 7-9", "1 Reis 10-12",
      "1 Reis 13-15", "1 Reis 16-18", "1 Reis 19-22", "2 Reis 1-3", "2 Reis 4-6",
      "2 Reis 7-9", "2 Reis 10-12", "2 Reis 13-15", "2 Reis 16-18", "2 Reis 19-21",
      "2 Reis 22-25", "1 Crônicas 1-3", "1 Crônicas 4-6", "1 Crônicas 7-9", "1 Crônicas 10-12",
      "1 Crônicas 13-15", "1 Crônicas 16-18", "1 Crônicas 19-21", "1 Crônicas 22-24", "1 Crônicas 25-27",
      
      // Maio (31 dias)
      "1 Crônicas 28-29; 2 Crônicas 1", "2 Crônicas 2-4", "2 Crônicas 5-7", "2 Crônicas 8-10", "2 Crônicas 11-13",
      "2 Crônicas 14-16", "2 Crônicas 17-19", "2 Crônicas 20-22", "2 Crônicas 23-25", "2 Crônicas 26-28",
      "2 Crônicas 29-31", "2 Crônicas 32-34", "2 Crônicas 35-36; Esdras 1", "Esdras 2-4", "Esdras 5-7",
      "Esdras 8-10", "Neemias 1-3", "Neemias 4-6", "Neemias 7-9", "Neemias 10-13",
      "Ester 1-3", "Ester 4-6", "Ester 7-10", "Jó 1-3", "Jó 4-6",
      "Jó 7-9", "Jó 10-12", "Jó 13-15", "Jó 16-18", "Jó 19-21",
      "Jó 22-24",
      
      // Junho (30 dias)
      "Jó 25-27", "Jó 28-30", "Jó 31-33", "Jó 34-36", "Jó 37-39",
      "Jó 40-42", "Salmos 1-3", "Salmos 4-6", "Salmos 7-9", "Salmos 10-12",
      "Salmos 13-15", "Salmos 16-18", "Salmos 19-21", "Salmos 22-24", "Salmos 25-27",
      "Salmos 28-30", "Salmos 31-33", "Salmos 34-36", "Salmos 37-39", "Salmos 40-42",
      "Salmos 43-45", "Salmos 46-48", "Salmos 49-51", "Salmos 52-54", "Salmos 55-57",
      "Salmos 58-60", "Salmos 61-63", "Salmos 64-66", "Salmos 67-69", "Salmos 70-72",
      
      // Julho (31 dias)
      "Salmos 73-75", "Salmos 76-78", "Salmos 79-81", "Salmos 82-84", "Salmos 85-87",
      "Salmos 88-90", "Salmos 91-93", "Salmos 94-96", "Salmos 97-99", "Salmos 100-102",
      "Salmos 103-105", "Salmos 106-108", "Salmos 109-111", "Salmos 112-114", "Salmos 115-117",
      "Salmos 118-119:24", "Salmos 119:25-72", "Salmos 119:73-120", "Salmos 119:121-176", "Salmos 120-122",
      "Salmos 123-125", "Salmos 126-128", "Salmos 129-131", "Salmos 132-134", "Salmos 135-137",
      "Salmos 138-140", "Salmos 141-143", "Salmos 144-146", "Salmos 147-150", "Provérbios 1-3",
      "Provérbios 4-6",
      
      // Agosto (31 dias)
      "Provérbios 7-9", "Provérbios 10-12", "Provérbios 13-15", "Provérbios 16-18", "Provérbios 19-21",
      "Provérbios 22-24", "Provérbios 25-27", "Provérbios 28-31", "Eclesiastes 1-3", "Eclesiastes 4-6",
      "Eclesiastes 7-9", "Eclesiastes 10-12", "Cantares 1-4", "Cantares 5-8", "Isaías 1-3",
      "Isaías 4-6", "Isaías 7-9", "Isaías 10-12", "Isaías 13-15", "Isaías 16-18",
      "Isaías 19-21", "Isaías 22-24", "Isaías 25-27", "Isaías 28-30", "Isaías 31-33",
      "Isaías 34-36", "Isaías 37-39", "Isaías 40-42", "Isaías 43-45", "Isaías 46-48",
      "Isaías 49-51",
      
      // Setembro (30 dias)
      "Isaías 52-54", "Isaías 55-57", "Isaías 58-60", "Isaías 61-63", "Isaías 64-66",
      "Jeremias 1-3", "Jeremias 4-6", "Jeremias 7-9", "Jeremias 10-12", "Jeremias 13-15",
      "Jeremias 16-18", "Jeremias 19-21", "Jeremias 22-24", "Jeremias 25-27", "Jeremias 28-30",
      "Jeremias 31-33", "Jeremias 34-36", "Jeremias 37-39", "Jeremias 40-42", "Jeremias 43-45",
      "Jeremias 46-48", "Jeremias 49-52", "Lamentações 1-5", "Ezequiel 1-3", "Ezequiel 4-6",
      "Ezequiel 7-9", "Ezequiel 10-12", "Ezequiel 13-15", "Ezequiel 16-18", "Ezequiel 19-21",
      
      // Outubro (31 dias)
      "Ezequiel 22-24", "Ezequiel 25-27", "Ezequiel 28-30", "Ezequiel 31-33", "Ezequiel 34-36",
      "Ezequiel 37-39", "Ezequiel 40-42", "Ezequiel 43-45", "Ezequiel 46-48", "Daniel 1-3",
      "Daniel 4-6", "Daniel 7-9", "Daniel 10-12", "Oseias 1-4", "Oseias 5-8",
      "Oseias 9-14", "Joel 1-3", "Amós 1-3", "Amós 4-6", "Amós 7-9",
      "Obadias; Jonas 1-4", "Miqueias 1-4", "Miqueias 5-7", "Naum 1-3", "Habacuque 1-3",
      "Sofonias 1-3", "Ageu 1-2", "Zacarias 1-3", "Zacarias 4-6", "Zacarias 7-9",
      "Zacarias 10-14",
      
      // Novembro (30 dias)
      "Malaquias 1-4", "Mateus 1-3", "Mateus 4-6", "Mateus 7-9", "Mateus 10-12",
      "Mateus 13-15", "Mateus 16-18", "Mateus 19-21", "Mateus 22-24", "Mateus 25-28",
      "Marcos 1-3", "Marcos 4-6", "Marcos 7-9", "Marcos 10-12", "Marcos 13-16",
      "Lucas 1-3", "Lucas 4-6", "Lucas 7-9", "Lucas 10-12", "Lucas 13-15",
      "Lucas 16-18", "Lucas 19-21", "Lucas 22-24", "João 1-3", "João 4-6",
      "João 7-9", "João 10-12", "João 13-15", "João 16-18", "João 19-21",
      
      // Dezembro (31 dias)
      "Atos 1-3", "Atos 4-6", "Atos 7-9", "Atos 10-12", "Atos 13-15",
      "Atos 16-18", "Atos 19-21", "Atos 22-24", "Atos 25-28", "Romanos 1-3",
      "Romanos 4-6", "Romanos 7-9", "Romanos 10-12", "Romanos 13-16", "1 Coríntios 1-4",
      "1 Coríntios 5-8", "1 Coríntios 9-12", "1 Coríntios 13-16", "2 Coríntios 1-4", "2 Coríntios 5-9",
      "2 Coríntios 10-13", "Gálatas 1-6", "Efésios 1-6", "Filipenses 1-4", "Colossenses 1-4",
      "1 Tessalonicenses 1-5", "2 Tessalonicenses 1-3", "1 Timóteo 1-6", "2 Timóteo 1-4", "Tito; Filemom",
      "Hebreus 1-13; Tiago 1-5; 1 Pedro 1-5; 2 Pedro 1-3; 1 João 1-5; 2 João; 3 João; Judas; Apocalipse 1-22"
    ];

    // Gerar 365 dias de leitura
    for (let i = 0; i < 365; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      plan.push({
        day: i + 1,
        date: currentDate.toLocaleDateString('pt-BR'),
        reading: readings[i] || `Revisão Geral - Dia ${i + 1}`,
        completed: false
      });
    }

    setReadingPlan(plan);
  };

  const loadProgress = () => {
    const saved = localStorage.getItem('bible_reading_progress');
    if (saved) {
      const progress = JSON.parse(saved);
      setReadingPlan(prev => prev.map(entry => ({
        ...entry,
        completed: progress[entry.day] || false
      })));
    }
  };

  const saveProgress = (updatedPlan: ReadingEntry[]) => {
    const progress: Record<number, boolean> = {};
    updatedPlan.forEach(entry => {
      progress[entry.day] = entry.completed;
    });
    localStorage.setItem('bible_reading_progress', JSON.stringify(progress));
  };

  const toggleReading = (day: number) => {
    const updated = readingPlan.map(entry =>
      entry.day === day ? { ...entry, completed: !entry.completed } : entry
    );
    setReadingPlan(updated);
    saveProgress(updated);
  };

  const getProgressStats = () => {
    const completed = readingPlan.filter(entry => entry.completed).length;
    const total = readingPlan.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  };

  const getWeeklyData = () => {
    const weeks = [];
    for (let i = 0; i < 52; i++) {
      const weekStart = i * 7;
      const weekEnd = Math.min(weekStart + 7, readingPlan.length);
      const weekEntries = readingPlan.slice(weekStart, weekEnd);
      const completed = weekEntries.filter(entry => entry.completed).length;
      
      weeks.push({
        week: i + 1,
        completed,
        total: weekEntries.length,
        percentage: weekEntries.length > 0 ? Math.round((completed / weekEntries.length) * 100) : 0
      });
    }
    return weeks;
  };

  const getCurrentWeekEntries = () => {
    const weekStart = (currentWeek - 1) * 7;
    const weekEnd = Math.min(weekStart + 7, readingPlan.length);
    return readingPlan.slice(weekStart, weekEnd);
  };

  const stats = getProgressStats();
  const weeklyData = getWeeklyData();
  const currentWeekEntries = getCurrentWeekEntries();

  const pieData = [
    { name: 'Lido', value: stats.completed, color: '#10b981' },
    { name: 'Restante', value: stats.total - stats.completed, color: '#e5e7eb' }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Plano de Leitura Bíblica Anual</h2>
        <p className="text-gray-600">Leia toda a Bíblia em 365 dias</p>
      </div>

      {/* Estatísticas Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-rose-dark">{stats.completed}</div>
              <div className="text-sm text-gray-600">Dias Completos</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.percentage}%</div>
              <div className="text-sm text-gray-600">Progresso Total</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{stats.total - stats.completed}</div>
              <div className="text-sm text-gray-600">Dias Restantes</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Book className="w-5 h-5" />
              Progresso Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                completed: { label: "Lido", color: "#10b981" },
                remaining: { label: "Restante", color: "#e5e7eb" }
              }}
              className="h-[200px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
            <div className="text-center mt-4">
              <Progress value={stats.percentage} className="w-full" />
              <p className="text-sm text-gray-600 mt-2">{stats.percentage}% concluído</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Progresso Semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                percentage: { label: "Progresso %", color: "#10b981" }
              }}
              className="h-[200px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData.slice(0, 12)}>
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Bar dataKey="percentage" fill="#10b981" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Navegação de Semanas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Semana {currentWeek} de 52</span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
                disabled={currentWeek === 1}
              >
                Anterior
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setCurrentWeek(Math.min(52, currentWeek + 1))}
                disabled={currentWeek === 52}
              >
                Próxima
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {currentWeekEntries.map((entry) => (
              <div 
                key={entry.day}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleReading(entry.day)}
                    className="p-1"
                  >
                    {entry.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400" />
                    )}
                  </Button>
                  <div>
                    <div className="font-medium">Dia {entry.day}</div>
                    <div className="text-sm text-gray-600">{entry.date}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-rose-dark">{entry.reading}</div>
                  <div className="text-sm text-gray-600">
                    {entry.completed ? 'Concluído' : 'Pendente'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BibleReadingPlan;
