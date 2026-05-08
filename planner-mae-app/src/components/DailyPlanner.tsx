
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckSquare, Plus, Trash2, Target, Heart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface PlannerData {
  dailyGoals: string;
  tasks: Task[];
  gratitude: string;
  goalsWithGod: string;
}

const DailyPlanner: React.FC = () => {
  const [plannerData, setPlannerData] = useState<PlannerData>({
    dailyGoals: '',
    tasks: [],
    gratitude: '',
    goalsWithGod: ''
  });
  const [newTask, setNewTask] = useState('');
  const { toast } = useToast();

  const getTodayKey = () => {
    const today = new Date();
    return `planner_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    const todayKey = getTodayKey();
    const savedData = localStorage.getItem(todayKey);
    if (savedData) {
      setPlannerData(JSON.parse(savedData));
    }
  }, []);

  const savePlannerData = (data: PlannerData) => {
    const todayKey = getTodayKey();
    localStorage.setItem(todayKey, JSON.stringify(data));
    setPlannerData(data);
  };

  const updateField = (field: keyof PlannerData, value: any) => {
    const updatedData = { ...plannerData, [field]: value };
    savePlannerData(updatedData);
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    
    const newTaskObj: Task = {
      id: Date.now().toString(),
      text: newTask.trim(),
      completed: false
    };
    
    const updatedTasks = [...plannerData.tasks, newTaskObj];
    updateField('tasks', updatedTasks);
    setNewTask('');
    
    toast({
      title: "Tarefa adicionada!",
      description: "Nova tarefa foi adicionada ao seu planner.",
    });
  };

  const toggleTask = (taskId: string) => {
    const updatedTasks = plannerData.tasks.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );
    updateField('tasks', updatedTasks);
  };

  const removeTask = (taskId: string) => {
    const updatedTasks = plannerData.tasks.filter(task => task.id !== taskId);
    updateField('tasks', updatedTasks);
    
    toast({
      title: "Tarefa removida",
      description: "A tarefa foi removida do seu planner.",
    });
  };

  const completedTasks = plannerData.tasks.filter(task => task.completed).length;
  const totalTasks = plannerData.tasks.length;

  return (
    <div className="space-y-6">
      {/* Metas do Dia */}
      <Card className="shadow-lg border-0 bg-card/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Metas do Dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Quais são suas principais metas para hoje?"
            value={plannerData.dailyGoals}
            onChange={(e) => updateField('dailyGoals', e.target.value)}
            className="min-h-[100px] resize-none"
          />
        </CardContent>
      </Card>

      {/* Lista de Tarefas */}
      <Card className="shadow-lg border-0 bg-card/95">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-primary" />
              Tarefas do Dia
            </CardTitle>
            {totalTasks > 0 && (
              <div className="text-sm text-muted-foreground">
                {completedTasks}/{totalTasks} concluídas
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Adicionar nova tarefa */}
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar nova tarefa..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTask()}
              className="flex-1"
            />
            <Button onClick={addTask} className="bg-primary hover:bg-rose-dark">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Lista de tarefas */}
          <div className="space-y-2">
            {plannerData.tasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhuma tarefa adicionada ainda
              </p>
            ) : (
              plannerData.tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={() => toggleTask(task.id)}
                  />
                  <Label 
                    className={`flex-1 cursor-pointer ${task.completed ? 'line-through text-muted-foreground' : ''}`}
                  >
                    {task.text}
                  </Label>
                  <Button
                    onClick={() => removeTask(task.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Progresso */}
          {totalTasks > 0 && (
            <div className="mt-4">
              <div className="w-full bg-secondary rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gratidão do Dia */}
      <Card className="shadow-lg border-0 bg-card/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" />
            Gratidão do Dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Pelo que você é grata hoje?"
            value={plannerData.gratitude}
            onChange={(e) => updateField('gratitude', e.target.value)}
            className="min-h-[100px] resize-none"
          />
        </CardContent>
      </Card>

      {/* Metas com Deus */}
      <Card className="shadow-lg border-0 bg-card/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-accent" />
            Minhas Metas com Deus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Como você quer crescer espiritualmente?"
            value={plannerData.goalsWithGod}
            onChange={(e) => updateField('goalsWithGod', e.target.value)}
            className="min-h-[100px] resize-none"
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyPlanner;
